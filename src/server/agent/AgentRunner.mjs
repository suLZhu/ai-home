// The unified agent runner: one user prompt -> a bounded tool loop -> a
// persisted answer. Everything that makes an agent "visible" happens here —
// rounds are counted, every tool call goes through ToolExecutor (which logs
// it), and events stream to subscribers while the row in agent_runs is the
// durable truth.
//
// Hard rules:
//  - at most MAX_ROUNDS model round-trips, no exceptions;
//  - identity comes from the run row (server-assigned); the model can never
//    choose which assistant it is acting as;
//  - a tool failure is fed back as role=tool so the model can recover —
//    it never aborts the whole run;
//  - cancellation is cooperative via AbortController.
import { chat } from './OpenAICompatibleProvider.mjs'
import { createToolRegistry } from './ToolRegistry.mjs'
import { executeToolCall } from './ToolExecutor.mjs'
import { getAgentRun, finishAgentRun } from './AgentRunStore.mjs'

export const MAX_ROUNDS = 5

function buildSystemPrompt(run, displayName, now) {
  return [
    `【当前扮演角色】你是 ${displayName}（服务端身份 ID：${run.assistantId}）。你正在通过工具助手执行用户交给你的任务，而不是普通闲聊。`,
    `【执行日期】${now}`,
    '【工具使用规则】',
    '1. 只在确实需要时调用工具；每次工具调用会真实执行并被记录，不要编造工具结果。',
    '2. 工具返回 [错误] 时可以换一种方式重试一次，仍失败就如实告诉用户。',
    '3. 返回 [待审批] 表示需要用户确认，先解释你要做什么，等待用户批准，不要重复调用。',
    '4. 记账工具只在用户明确要求记账时使用；成功返回前不要声称已记账。',
    '5. 完成任务后用简洁的中文总结你做了什么、结果如何。',
  ].join('\n')
}

function usageTotal(target, src) {
  if (!src) return
  target.promptTokens = (target.promptTokens || 0) + (src.promptTokens || 0)
  target.completionTokens = (target.completionTokens || 0) + (src.completionTokens || 0)
  target.cachedTokens = (target.cachedTokens || 0) + (src.cachedTokens || 0)
  target.calls = (target.calls || 0) + 1
}

// ctx: { db, bus, providerFor(assistantId) -> {endpoint, apiKey, model},
//        displayNameFor(assistantId), mcpList(row), mcpCall(row, name, args) }
// Returns the finished run row (status always terminal when this resolves).
export async function runAgent(ctx, run, { signal } = {}) {
  const { db, bus } = ctx
  // Identity and credentials are resolved server-side from the run row; the
  // request payload cannot influence either.
  const provider = ctx.providerFor(run.assistantId)
  const displayName = ctx.displayNameFor(run.assistantId)
  if (!provider.endpoint || !provider.apiKey || !provider.model) {
    const finished = finishAgentRun(db, run.id, {
      status: 'failed', errorCode: 'PROVIDER_MISSING',
      errorMessage: '该助手尚未配置 API 地址、模型或 API Key（工作区 → 模型设置）',
    })
    bus.publish({ type: 'run_finished', runId: run.id, status: finished.status })
    return finished
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  const usage = {}
  let rounds = 0
  let toolCalls = 0
  let answer = ''
  let status = 'succeeded'
  let errorCode = null
  let errorMessage = null

  try {
    const registry = await createToolRegistry({
      db,
      person: run.assistantId,
      mcpList: row => ctx.mcpList(row),
      mcpCall: (row, name, args) => ctx.mcpCall(row, name, args),
    })
    const messages = [
      { role: 'system', content: buildSystemPrompt(run, displayName, new Date().toLocaleDateString('en-CA')) },
      { role: 'user', content: run.prompt },
    ]

    for (rounds = 1; rounds <= MAX_ROUNDS; rounds++) {
      if (controller.signal.aborted) { status = 'cancelled'; errorCode = 'ABORTED'; errorMessage = '运行已被取消'; break }
      bus.publish({ type: 'round_started', runId: run.id, round: rounds })

      const reply = await chat({
        endpoint: provider.endpoint,
        apiKey: provider.apiKey,
        model: provider.model,
        messages,
        tools: registry.definitions,
        signal: controller.signal,
      })
      usageTotal(usage, reply.usage)

      if (!reply.toolCalls.length) {
        answer = reply.content || ''
        break
      }

      messages.push({
        role: 'assistant',
        content: reply.content || null,
        tool_calls: reply.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
      })

      for (const call of reply.toolCalls) {
        if (controller.signal.aborted) break
        toolCalls++
        const outcome = await executeToolCall({
          db, bus, registry, run,
          round: rounds, callId: call.id, name: call.name, rawArgs: call.arguments,
          signal: controller.signal,
        })
        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.content })
      }

      if (controller.signal.aborted) { status = 'cancelled'; errorCode = 'ABORTED'; errorMessage = '运行已被取消'; break }
      // Last round already spent: stop rather than exceed the hard cap.
      if (rounds === MAX_ROUNDS) {
        status = 'succeeded'
        answer = '(已达最大执行轮数上限，任务在工具调用后停止，请根据以上工具结果回答用户)'
      }
    }

    if (rounds > MAX_ROUNDS) rounds = MAX_ROUNDS // for-increment overshoot when no break happened

    if (status === 'succeeded' && !answer && !controller.signal.aborted) {
      answer = '(模型没有返回内容)'
    }
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      status = 'cancelled'; errorCode = 'ABORTED'; errorMessage = '运行已被取消'
    } else {
      status = 'failed'
      errorCode = String(error?.code || (error?.status === 502 ? 'UPSTREAM_ERROR' : 'RUN_ERROR')).slice(0, 64)
      errorMessage = String(error?.message || '运行失败').slice(0, 800)
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  const finished = finishAgentRun(db, run.id, { answer, rounds, toolCalls, status, errorCode, errorMessage, usage, model: provider.model })
  bus.publish({ type: 'run_finished', runId: run.id, status: finished.status, rounds: finished.rounds, toolCalls: finished.toolCalls })
  return finished
}

// Launch a run without blocking the HTTP response. The returned handle allows
// cancel(runId); finished promises are kept so tests can await them.
export class AgentRunner {
  constructor(ctx) {
    this.ctx = ctx
    this.active = new Map() // runId -> {controller, promise}
  }

  start(run) {
    const controller = new AbortController()
    const promise = runAgent(this.ctx, run, { signal: controller.signal })
      .catch(error => {
        // runAgent already finishes the row; this is a last-resort guard so a
        // crashed loop never leaves a dangling promise.
        try { finishAgentRun(this.ctx.db, run.id, { status: 'failed', errorCode: 'RUNNER_CRASH', errorMessage: String(error?.message || error).slice(0, 800) }) } catch { /* row already terminal */ }
        return getAgentRun(this.ctx.db, run.id)
      })
      .finally(() => this.active.delete(run.id))
    this.active.set(run.id, { controller, promise })
    return { runId: run.id, promise }
  }

  cancel(runId) {
    const entry = this.active.get(String(runId || ''))
    if (!entry) return false
    entry.controller.abort()
    return true
  }

  isActive(runId) { return this.active.has(String(runId || '')) }
}
