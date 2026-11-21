export const CONTEXT_LIMITS: { maxMessages: number; keepMessages: number; maxChars: number }
export function planCompaction(history: unknown[], limits?: { maxMessages?: number; keepMessages?: number; maxChars?: number }): { needed: boolean; cut: number }
export function buildSummaryPrompt(previousSummary: string, messages: unknown[], options?: { maxChars?: number }): { role: string; content: string }[]
export function buildSummarySystemMessage(summary: string, coveredMessages: number): string
export function searchMessageList(messages: unknown[], query: string, limit?: number): { index: number; role: string; at: string; content: string; score: number }[]
export function searchHistory(conversations: Record<string, any[]>, person: string, query: string, limit?: number): { conversationId: string; title: string; role: string; at: string; content: string; score: number }[]
