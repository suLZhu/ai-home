// Executes one tool call inside an agent run: policy gate -> tool_call_logs
// row -> invoke -> terminal transition -> event. Every execution is recorded
// whether it succeeds or fails, so the dashboard always has the full story.
//
// Retry rule (per the run spec): read tools get exactly one retry, write tools
// never retry automatically — a repeated write could double-charge a ledger.
import { createToolLog, finishToolLog, redactValue } from '../../toolLog.mjs'
import { getPolicy } from './ToolPolicy.mjs'

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
// the model. Approval-pending calls come back as ok:false with a marker the
// model can read; they never silently disappear.
export async function executeToolCall({ db, bus, registry, run, round, callId, name, rawArgs, signal }) {
  const person = run.assistantId
  const args = parseArgs(rawArgs)
  const mode = getPolicy(db, person, name)
  const meta = registry.describe(name)
  if (!meta) {
    return { ok: false, content: `[错误] 未知工具：${name}` }
  }

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
    // Stage 4 wires the approval queue; for now the call parks in
    // awaiting_confirmation and the model is told to wait for the user.
    const log = createToolLog(db, { ...logInput, status: 'awaiting_confirmation' })
    bus.publish({ type: 'tool_awaiting', runId: run.id, logId: log.id, tool: name })
    return { ok: false, content: `[待审批] 工具 ${name} 需要用户确认后才能执行，请先说明你要做什么，等待用户批准。` }
  }

  const log = createToolLog(db, logInput)
  const logId = log.id
  bus.publish({ type: 'tool_started', runId: run.id, logId, tool: name, round })
  const started = Date.now()

  // One retry for reads, zero for writes.
  const maxAttempts = meta.readOnly ? 2 : 1
  let attempt = 0
  let lastError = null
  let resolved = null

  while (attempt < maxAttempts) {
    attempt++
    try {
      if (signal?.aborted) throw Object.assign(new Error('运行已取消'), { code: 'ABORTED' })
      resolved = await withTimeout(registry.invoke(name, args), TOOL_TIMEOUT_MS, signal)
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
