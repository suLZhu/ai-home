export type SkillRecord = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  updatedAt: string
}
export const SKILLS_KEY_PREFIX: string
export const SKILL_BUDGET_CHARS: number
export function normalizeSkill(raw: unknown): SkillRecord
export function normalizeSkills(list: unknown): SkillRecord[]
export function loadSkills(person: string, storage?: Storage | null): SkillRecord[]
export function saveSkills(person: string, list: unknown, storage?: Storage | null): SkillRecord[]
export function parseSkillMarkdown(text: string): { name: string; description: string; instructions: string }
export function enabledSkillsBlock(list: unknown, budget?: number): string
