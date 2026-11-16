export function liveUpdateSupported(): boolean
export function notifyAppReady(): Promise<unknown | null>
export function currentBundle(): Promise<{ bundle?: { version?: string; id?: string } } | null>
export function applyWebUpdate(url: string, version: string, checksum?: string): Promise<unknown>
export function resetToBuiltin(): Promise<void>
export function compareVersions(a: string, b: string): number
