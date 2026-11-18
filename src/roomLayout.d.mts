export type RoomItem = {
  id: string
  kind: 'decor' | 'hotspot' | 'visual'
  type?: string
  cls?: string
  text?: string
  emoji?: string
  label?: string
  action?: string
  countKey?: string
  hit?: string
  x?: number
  y?: number
  w?: number
  h?: number
  style?: Record<string, string>
}

export type RoomLayout = {
  version: number
  name: string
  items: RoomItem[]
  background?: { css?: string; color?: string; image?: string }
}

export const ROOM_LAYOUT_KEY: (person: string) => string
export const DEFAULT_ROOM_LAYOUT: RoomLayout
export function normalizeRoomStyle(input: unknown): Record<string, string | number> | undefined
export function normalizeRoomLayout(input: unknown): RoomLayout
export function loadRoomLayout(person: string, storage?: Storage): RoomLayout
export function saveRoomLayout(person: string, layout: unknown, storage?: Storage): RoomLayout
export function resetRoomLayout(person: string, storage?: Storage): RoomLayout
export function buildRoomItem(input: Partial<RoomItem> & { x?: number; y?: number; w?: number; h?: number }): RoomItem
export const ROOM_ACTIONS: Record<string, string>
