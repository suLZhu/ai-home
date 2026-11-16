// Task-result envelope: the scheduler delivers finished runs through the
// assistant inbox, and the content field carries this JSON payload so the
// frontend can route the answer into the exact conversation the task was
// created from — without the server ever touching conversation state (which
// lives entirely in the frontend snapshot).
//
// Pure functions only (no DOM, no sqlite): shared by server.mjs / TaskScheduler
// via inbox.addTaskResult and by App.tsx via decideTaskConsumption, so the
// consume-decision logic is the SAME code in production and in node tests.

// Build the JSON envelope stored in assistant_inbox.content for kind='task_result'.
export function taskResultEnvelope({ runId, taskId, conversationId, title, answer }) {
  return JSON.stringify({
    v: 1,
    runId: String(runId || ''),
    taskId: String(taskId || ''),
    conversationId: String(conversationId || ''),
    title: String(title || '').slice(0, 160),
    answer: String(answer || '').slice(0, 3600),
  })
}

// Parse an envelope back; returns null for anything malformed so a corrupt
// row can never be rendered as if it were a real result.
export function parseTaskEnvelope(content) {
  try {
    const env = JSON.parse(String(content || ''))
    if (!env || typeof env !== 'object' || typeof env.runId !== 'string' || !env.runId.trim()) return null
    return {
      runId: env.runId.trim(),
      taskId: typeof env.taskId === 'string' ? env.taskId : '',
      conversationId: typeof env.conversationId === 'string' ? env.conversationId : '',
      title: typeof env.title === 'string' ? env.title : '',
      answer: typeof env.answer === 'string' ? env.answer : '',
    }
  } catch { return null }
}

// Decide what the frontend should do with one task_result inbox row, given the
// current persisted conversations for that assistant. This is the idempotency
// core: it reads ONLY durable state (conversations already containing the
// runId), never an in-memory dedup set, so refresh/restart/poll cannot cause a
// duplicate write.
//
// Returns one of:
//   { action: 'write', conversationId, envelope }        -> append answer to that conversation
//   { action: 'already' }                                -> runId already persisted; just ack
//   { action: 'skip_no_conversation' }                   -> task never bound a conversation; never auto-create one
//   { action: 'skip_missing_conversation', conversationId } -> bound conversation no longer exists; safe failure
//   { action: 'skip_invalid' }                           -> malformed envelope; never render
export function decideTaskConsumption(conversations, content) {
  const envelope = parseTaskEnvelope(content)
  if (!envelope) return { action: 'skip_invalid' }
  const list = Array.isArray(conversations) ? conversations : []
  if (!envelope.conversationId) return { action: 'skip_no_conversation', envelope }
  const conversation = list.find(c => c && c.id === envelope.conversationId)
  if (!conversation) return { action: 'skip_missing_conversation', conversationId: envelope.conversationId, envelope }
  const messages = Array.isArray(conversation.messages) ? conversation.messages : []
  if (messages.some(m => m && m.taskRunId === envelope.runId)) return { action: 'already', envelope }
  return { action: 'write', conversationId: envelope.conversationId, envelope }
}
