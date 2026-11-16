export const GEN_DEBUG_CAP: number

export type GenDebugEntry = {
  t: number
  iso: string
  stage: string
  detail: unknown
}

export function appendGenDebugLog(arr: unknown[], entry: GenDebugEntry, cap?: number): GenDebugEntry[]
export function makeGenDebugEntry(stage: string, detail?: unknown, now?: number): GenDebugEntry
export function genDebug(stage: string, detail?: unknown): GenDebugEntry
export function getGenDebugLog(): GenDebugEntry[]
export function clearGenDebugLog(): void
