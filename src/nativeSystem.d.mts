export type SystemHandler = {
  onOpen?: (payload: unknown) => void
  onTaskFire?: (runId: string) => void
  onStatusChanged?: () => void
}

export declare function systemBridgeAvailable(): boolean
export declare function readSystemCapabilities(): unknown
export declare function openSystemSetting(id: string, ok?: boolean, sdk?: number): boolean
export declare function setGenerationForeground(payload: unknown): boolean
export declare function nativeTextZoomAvailable(): boolean
export declare function setAppTextZoom(scalePercent: number): boolean
export declare function showSystemNotification(payload: unknown): boolean
export declare function clearConversationNotifications(person: string, conversationId?: string): boolean
export declare function syncSystemChannels(channels: unknown[]): boolean
export declare function syncSystemAlarms(plan: unknown[]): Record<string, unknown> | null
export declare function consumePendingOpen(): unknown
export declare function readNativeDelivered(): string[]
export declare function registerSystemHandlers(handler: SystemHandler): () => void

export declare function backupFilesAvailable(): boolean
export declare function saveBackupFile(name: string, content: string): { ok: boolean; name?: string; path?: string; error?: string } | null
export declare function listBackupFiles(): { name: string; size: number; modifiedAt: number }[]
export declare function readBackupFile(name: string): { ok: boolean; name?: string; content?: string; error?: string } | null
export declare function deleteBackupFile(name: string): boolean

export declare function nativeHttpGet(url: string, headers?: Record<string, string>): { status?: number; body?: string; error?: string } | null
export declare function nativeHttpGetAsync(url: string, headers?: Record<string,string>, timeoutMs?: number): Promise<{status?:number;body?:string;error?:string}|null>

export declare function nativeHttpPost(url: string, headers?: Record<string, string>, body?: string): { status?: number; body?: string; error?: string } | null
export declare function openExternalUrl(url: string): boolean

export declare function nativeHttpStreamAvailable(): boolean
export declare function nativeHttpStream(url: string, headers: Record<string, string>, body: string, onEvent: (event: { type: string; status?: number; text?: string; message?: string }) => void): { id: string; cancel: () => void } | null

export declare function openNativeWebView(url: string, title?: string): boolean

export declare function readClipboardText(): Promise<string>

export declare function appVersion(): string
