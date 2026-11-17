export const BACKUP_APP: string
export const BACKUP_VERSION: number
export const BACKUP_DIR_LABEL: string
export type BackupKind = { id: string; label: string; prefix: string; desc: string; keys?: string[]; all?: boolean; serverKeys?: boolean; serverMemory?: boolean }
export const BACKUP_KINDS: BackupKind[]
export function backupKind(id: string): BackupKind | null
export function collectBackupLocal(storage: Storage, kindId: string): Record<string, string>
export function localKeysForRestore(payload: any, kindId: string): Record<string, string>
export function backupFileName(kindId: string, date?: Date): string
export function kindFromFileName(name: string): string
export function parseBackup(text: string): any
export function makeBackupEnvelope(kindId: string, local: Record<string, string>, server?: any, date?: Date): any
export function summarizeBackup(payload: any): { localKeys: number; memoryPeople: number; memoryCount: number; apiKeys: number }

export function summarizeChatBackup(payload: any): { conversationCount: number; messagesCount: number; preview: Array<{ assistantId: string; title: string; count: number }> }
