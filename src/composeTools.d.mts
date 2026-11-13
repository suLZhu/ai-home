export type ComposeToolEntry = { id: string; label: string }
export type MoreToolEntry = { id: string; label: string; desc: string; action: string }
export declare const PRIMARY_TOOLS: ComposeToolEntry[]
export declare const MORE_TOOLS: MoreToolEntry[]
export declare const LEGACY_TOOL_IDS: string[]
export declare function composeToolGroups(): {
  primary: string[]
  more: string[]
  allIds: string[]
  duplicates: string[]
  missing: string[]
}
