export type SystemHandler = {
  onOpen?: (payload: unknown) => void
  onTaskFire?: (runId: string) => void
  onStatusChanged?: () => void
}

export declare function systemBridgeAvailable(): boolean
export declare function readSystemCapabilities(): unknown
export declare function openSystemSetting(id: string, ok?: boolean, sdk?: number): boolean
export declare function setGenerationForeground(payload: unknown): boolean
export declare function showSystemNotification(payload: unknown): boolean
export declare function syncSystemChannels(channels: unknown[]): boolean
export declare function syncSystemAlarms(plan: unknown[]): Record<string, unknown> | null
export declare function consumePendingOpen(): unknown
export declare function readNativeDelivered(): string[]
export declare function registerSystemHandlers(handler: SystemHandler): () => void
