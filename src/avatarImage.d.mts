export const AVATAR_EDGE: number
export const AVATAR_QUALITY: number
export const AVATAR_MAX_INPUT_BYTES: number
export const AVATAR_MAX_DATAURL_CHARS: number
export function canUseAsAvatar(file: { type?: string; size?: number } | null | undefined): boolean
export function avatarCropRect(iw: number, ih: number): { sx: number; sy: number; sw: number; sh: number } | null
export function isAvatarDataUrl(v: unknown): boolean
export function fileToAvatar(file: File): Promise<string>
