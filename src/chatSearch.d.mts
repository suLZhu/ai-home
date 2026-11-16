export type ChatSearchMessageLike = {
  id?: string | null
  role?: string | null
  content?: string | null
}

export type ChatSearchItem = {
  index: number
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
  count: number
}

export type ChatSearchResult = {
  total: number
  items: ChatSearchItem[]
}

export function normalizeQuery(query: unknown): string
export function countOccurrences(text: unknown, lowerQuery: string): number
export function snippetAround(text: unknown, query: unknown, radius?: number, maxLen?: number): string
export function searchMessages(
  messages: ChatSearchMessageLike[] | null | undefined,
  query: unknown,
  limit?: number,
): ChatSearchResult
export function stepMatchIndex(current: number, total: number, direction: number): number
