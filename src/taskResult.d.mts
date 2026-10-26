export type TaskResultEnvelope = {
  runId: string
  taskId: string
  conversationId: string
  title: string
  answer: string
}

export function taskResultEnvelope(input: { runId?: string; taskId?: string; conversationId?: string; title?: string; answer?: string }): string
export function parseTaskEnvelope(content: unknown): TaskResultEnvelope | null

export type TaskConsumptionDecision =
  | { action: 'write'; conversationId: string; envelope: TaskResultEnvelope }
  | { action: 'already'; envelope: TaskResultEnvelope }
  | { action: 'skip_no_conversation'; envelope: TaskResultEnvelope }
  | { action: 'skip_missing_conversation'; conversationId: string; envelope: TaskResultEnvelope }
  | { action: 'skip_invalid' }

export function decideTaskConsumption(conversations: unknown, content: unknown): TaskConsumptionDecision
