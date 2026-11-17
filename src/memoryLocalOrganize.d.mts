export type LocalAuto = {
  enabled: boolean
  minMessages: number
  minChars: number
  minDays: number
  autoConfirm: boolean
  rules: string
  lastRunAt: string | null
  lastRun: { status?: string; finishedAt?: string; error?: string; scanned?: number; created?: number } | null
}

export type LocalAutoStats = { pendingMessages: number; pendingChars: number; daysSinceLast: number }
export type LocalTrigger = 'disabled' | 'no_new_messages' | 'messages' | 'chars' | 'days' | 'below_threshold'
export type LocalProposal = { title: string; content: string; keywords: string; category: string }

export const LOCAL_AUTO_KEY: string
export const DEFAULT_LOCAL_AUTO: LocalAuto
export function normalizeLocalAuto(raw: unknown): LocalAuto
export function readLocalAuto(): LocalAuto
export function writeLocalAuto(patch: Partial<LocalAuto>): LocalAuto
export function pendingStats(messages: unknown[], lastRunAt: string | null): LocalAutoStats
export function localTrigger(cfg: LocalAuto, stats: LocalAutoStats): LocalTrigger
export function parseProposals(text: string): LocalProposal[]
export function parseTidyItems(text: string): { title: string; content: string; keywords: string; category: string; sources: string[] }[]
export function tidyMemoryLibrary(input: {
  person: string
  records: any[]
  endpoint: string
  apiKey: string
  chatUrl?: string
  model: string
  autoConfirm?: boolean
  rules?: string
}): Promise<{ created: number; archived: number; scanned: number }>
export function runLocalOrganize(input: {
  person: string
  messages: unknown[]
  endpoint: string
  apiKey: string
  chatUrl?: string
  model: string
  cfg: LocalAuto
  embedTarget?: { endpoint: string; apiKey: string; model: string } | null
}): Promise<{ created: number; scanned: number; duplicate: number }>
