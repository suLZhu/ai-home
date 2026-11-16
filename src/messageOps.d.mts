export type RegenerateContext = {
  userIndex: number
  assistantIndex: number
  userMessage: { role: 'user' | 'assistant'; content: string; id?: string; attachments?: Array<Record<string, unknown>> }
  original: { role: 'user' | 'assistant'; content: string; id?: string; usage?: Record<string, number | string | undefined>; taskRunId?: string }
}

export function resolveRegenerateContext(
  list: Array<{ role: 'user' | 'assistant'; content: string; id?: string; taskRunId?: string }> | null | undefined,
  assistantId: string,
): RegenerateContext | null

export function alignMessageIds<T extends { id?: string; role: 'user' | 'assistant'; content: string }>(
  viewList: T[] | null | undefined,
  convList: T[] | null | undefined,
): { view: T[] | null; conv: T[]; changed: boolean }
