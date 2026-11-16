export type CapabilityRow = {
  id: string
  label: string
  ok: boolean
  status: string
  hint: string
  action: string
}

export type AlarmState = {
  registered: number
  exact: boolean
  degraded: boolean
  lastRestoreAt: string
  deliveredCount: number
}

export type Capabilities = {
  available: boolean
  sdk: number
  rows: CapabilityRow[]
  alarm: AlarmState
}

export declare const CAPABILITY_ROWS: Array<{ id: string; label: string; okLabel: string; badLabel: string }>
export declare function systemSettingTarget(id: string, ok?: boolean, sdk?: number): string
export declare function normalizeCapabilities(raw: unknown): Capabilities
export declare function capabilitySummary(caps: Capabilities): { ok: number; total: number }
