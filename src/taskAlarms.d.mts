export type AlarmTask = {
  taskId: string
  runId: string
  assistantId: string
  assistantName: string
  conversationId: string
  title: string
  body: string
  at: number
  recurrence: string
  status: string
  kind: string
  channelId: string
  channelName: string
}

export declare const MAX_ALARMS: number
export declare const RESTORE_GRACE_MS: number
export declare function alarmRunId(task: Record<string, unknown>): string
export declare function normalizeAlarmTask(raw: unknown): Record<string, string> | null
export declare function buildAlarmPlan(tasks: unknown[], now?: number): AlarmTask[]
export declare function restoreAlarmPlan(tasks: unknown[], now?: number, delivered?: unknown, graceMs?: number): AlarmTask[]
export declare function syncSummary(plan: unknown[], exact: boolean): { registered: number; exact: boolean; degraded: boolean; at: number }
