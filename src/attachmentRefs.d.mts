export type AttachLike = {
  name?: string
  type?: string
  size?: number
  preview?: string
  dataUrl?: string
  assetId?: string
}

export type MessageLike = { attachments?: AttachLike[] | null } | null | undefined

export type PreviewKind = 'remote' | 'data' | 'stale' | 'none'

export function isStablePreview(preview: unknown): boolean
export function classifyPreview(preview: unknown): PreviewKind
export function needsUpload(attachment: AttachLike | null | undefined): boolean
export function assetIdsOfMessages(list: MessageLike[] | null | undefined): Set<string>
export function collectReferencedAssetIds(state?: {
  conversations?: Record<string, Array<{ id?: string; messages?: MessageLike[] }>> | null
  messages?: Record<string, MessageLike[]> | null
  deferredBatches?: Record<string, { messages?: MessageLike[] } | null> | null
  excludeMessageIds?: Iterable<string> | Set<string> | null
}): Set<string>
export function releasedAssetIds(
  removedAssetIds: Iterable<string> | Set<string> | null | undefined,
  stillReferenced: Iterable<string> | Set<string> | null | undefined,
): string[]
