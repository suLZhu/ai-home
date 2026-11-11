export type UserSettings = {
  callName: string
  userName: string
  identity: string
  relationship: string
  preferences: string
  notes: string
  avatar: string
}

export const USER_SETTINGS_KEY: string
export const BLANK_USER_SETTINGS: UserSettings
export declare function blankUserSettings(): UserSettings
export declare function normalizeUserSettings(raw: unknown, people: string[]): Record<string, UserSettings>
export declare function buildUserContext(settings: UserSettings | null | undefined, extras?: { roomName?: string }): string
