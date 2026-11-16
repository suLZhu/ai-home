// 云端恢复决策层的类型声明（与 cloudRecovery.mjs 对应）。
export type CloudLoadErrorLike = { status?: number } | null | undefined
export type CloudLoadAction = 'sign-out' | 'offline-keep-local' | 'apply-cloud' | 'upload-local'

export interface RecoveryMessageLike {
  id?: string
  role?: string
  content?: string
  attachments?: Array<{ name?: string; type?: string; size?: number; assetId?: string; preview?: string }>
  [key: string]: unknown
}
export interface RecoveryConversationLike {
  id?: string
  title?: string
  messages?: RecoveryMessageLike[]
  updatedAt?: string
}
export type ConversationsMap = Record<string, RecoveryConversationLike[] | undefined>

export interface RecoveryBackup {
  version: number
  backedUpAt: string
  conversations: ConversationsMap
  activeConversationIds: Record<string, string>
}

export declare const RECOVERY_BACKUP_KEY: string
export declare function classifyCloudLoadError(status: number | undefined): 'auth' | 'network'
export declare function conversationsHaveData(convs: ConversationsMap | null | undefined): boolean
export declare function countConversationMessages(convs: ConversationsMap | null | undefined): number
export declare function decideCloudLoadAction(input: {
  error?: CloudLoadErrorLike
  cloudState?: Record<string, unknown> | null
  localHasData?: boolean
}): CloudLoadAction
export declare function shouldBackupBeforeApply(localConvs: ConversationsMap | null | undefined, cloudConvs: ConversationsMap | null | undefined): boolean
export declare function buildRecoveryBackup(localConvs: ConversationsMap, localActiveIds: Record<string, string>): RecoveryBackup
export declare function pickActiveConversationIds(convs: ConversationsMap, activeIds: Record<string, string> | null | undefined): Record<string, string>
export declare function pickActiveMessagesFromSnapshot(convs: ConversationsMap, activeIds: Record<string, string> | null | undefined): Record<string, RecoveryMessageLike[]>
