export const MEMORY_VIEW_KEY: string
export const MEMORY_VIEWS: string[]
export function normalizeMemoryView(value: string): 'stars' | 'garden' | 'diary' | 'list'
export function categoryColor(category: string): string
export function starLayout(records: any[], options?: { max?: number }): { record: any; left: number; top: number; size: number; delay: number; color: string }[]
export function gardenLayout(records: any[], options?: { max?: number }): { record: any; color: string; petals: number; rotate: number; size: number; delay: number }[]
export function groupMemoriesByDay(records: any[]): { day: string; records: any[] }[]
