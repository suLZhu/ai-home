// Executes one tool call inside an agent run: policy gate -> tool_call_logs
// row -> invoke -> terminal transition -> event. Every execution is recorded
// whether it succeeds or fails, so the dashboard always has the full story.
//
// Retry rule (per the run spec): read tools get exactly one retry, write tools
// never retry automatically — a repeated write could double-charge a ledger.
//
// Policy modes: auto executes immediately; deny cancels before running; ask
// parks the run in awaiting_confirmation until the user decides (see
// ApprovalGate) — approval resumes execution and the real result goes back to
// the model, rejection feeds a readable refusal back instead.
import { createToolLog, finishToolLog, redactValue } from '../../toolLog.mjs'
import { getPolicy } from './ToolPolicy.mjs'
import { awaitApproval } from './ApprovalGate.mjs'

const TOOL_TIMEOUT_MS = 30 * 1000
const RETRY_DELAY_MS = 400

function summarize(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(redactValue(data) ?? null)
  return text.length > 4000 ? text.slice(0, 4000) + '…[已截断]' : text
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function parseArgs(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  try { const parsed = JSON.parse(String(raw)); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} }
  catch { throw Object.assign(new Error('工具参数不是合法 JSON'), { status: 400 }) }
}

// Returns { ok, content } where content is the role=tool payload fed back to
// the model. Every path ends with the log row in a terminal state (except
// ask-pending, which resumes into the shared execute path below).
export async function executeToolCall({ db, bus, registry, run, round, callId, name, rawArgs, signal }) {
  const person = run.assistantId
  const args = parseArgs(rawArgs)
  const mode = getPolicy(db, person, name)
  const meta = registry.describe(name)
  if (!meta) return { ok: false, content: `[错误] 未知工具：${name}` }

  const logInput = {
    person,
    source: meta.source,
    serverName: meta.serverName,
    toolName: name,
    arguments: args,
    status: 'running',
    runId: run.id,
    conversationId: run.conversationId || '',
    eventId: `${run.id}:${round}:${callId}`.slice(0, 120),
  }

  if (mode === 'deny') {
    const log = createToolLog(db, logInput)
    finishToolLog(db, log.id, { status: 'cancelled', errorCode: 'POLICY_DENIED', errorMessage: '工具权限策略拒绝了这次调用' })
    bus.publish({ type: 'tool_finished', runId: run.id, logId: log.id, tool: name, status: 'cancelled' })
    return { ok: false, content: `[权限] 工具 ${name} 被策略拒绝（deny），请改用其他方式完成任务或直接回答。` }
  }

  if (mode === 'ask') {
    const log = createToolLog(db, { ...logInput, status: 'awaiting_confirmation' })
    const logId = log.id
    bus.publish({ type: 'tool_awaiting', runId: run.id, logId, tool: name, round, person })
    const decision = await awaitApproval({ logId, runId: run.id, person, tool: name, signal })
    if (decision !== 'approved') {
      const code = decision === 'timeout' ? 'APPROVAL_TIMEOUT' : decision === 'aborted' ? 'ABORTED' : 'APPROVAL_REJECTED'
      const message = decision === 'timeout' ? '审批超时，用户未在 5 分钟内响应'
        : decision === 'aborted' ? '运行已取消，审批随之中止'
          : '用户拒绝了这次工具调用'
      finishToolLog(db, logId, { status: 'cancelled', errorCode: code, errorMessage: message })
      bus.publish({ type: 'tool_finished', runId: run.id, logId, tool: name, status: 'cancelled' })
      return { ok: false, content: `[${decision === 'approved' ? '已批准' : '未批准'}] 工具 ${name} ${message}。请如实告知用户，不要重试。` }
    }
    // Approved: move awaiting_confirmation -> running, then share the auto path.
    finishToolLog(db, logId, { status: 'running' })
    bus.publish({ type: 'tool_started', runId: run.id, logId, tool: name, round, approved: true })
    return runInvoke({ db, bus, registry, run, name, args, meta, logId, signal })
  }

  const log = createToolLog(db, logInput)
  bus.publish({ type: 'tool_started', runId: run.id, logId: log.id, tool: name, round })
  return runInvoke({ db, bus, registry, run, name, args, meta, logId: log.id, signal })
}

// Shared invoke path for auto and approved calls: retry policy, terminal
// transition, event.
async function runInvoke({ db, bus, registry, run, name, args, meta, logId, signal }) {
  const started = Date.now()
  const maxAttempts = meta.readOnly ? 2 : 1 // one retry for reads, zero for writes
  let attempt = 0
  let lastError = null
  let resolved = null

  while (attempt < maxAttempts) {
    attempt++
    try {
      if (signal?.aborted) throw Object.assign(new Error('运行已取消'), { code: 'ABORTED' })
      resolved = await withTimeout(registry.invoke(name, args), TOOL_TIMEOUT_MS)
      break
    } catch (error) {
      lastError = error
      if (error?.code === 'ABORTED' || signal?.aborted) break
      if (attempt < maxAttempts) await sleep(RETRY_DELAY_MS)
    }
  }

  if (resolved) {
    const summary = summarize(resolved.data)
    finishToolLog(db, logId, { status: 'succeeded', resultSummary: summary })
    bus.publish({ type: 'tool_finished', runId: run.id, logId, tool: name, status: 'succeeded', durationMs: Date.now() - started })
    return { ok: true, content: summary }
  }

  const aborted = lastError?.code === 'ABORTED' || signal?.aborted
  const status = aborted ? 'cancelled' : 'failed'
  const errorCode = aborted ? 'ABORTED'
    : String(lastError?.code || (lastError?.status === 502 ? 'UPSTREAM_ERROR' : 'TOOL_ERROR')).slice(0, 64)
  finishToolLog(db, logId, { status, errorCode, errorMessage: lastError?.message || '工具执行失败' })
  bus.publish({ type: 'tool_finished', runId: run.id, logId, tool: name, status })
  return { ok: false, content: `[错误] 工具 ${name} 执行${aborted ? '被取消' : '失败'}：${String(lastError?.message || '未知错误').slice(0, 400)}` }
}

async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('工具执行超时（30 秒）'), { code: 'TOOL_TIMEOUT' })), ms)
  })
  try { return await Promise.race([promise, timeout]) }
  finally { clearTimeout(timer) }
}
