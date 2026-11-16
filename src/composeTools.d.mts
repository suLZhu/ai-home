export type ComposeToolEntry = { id: string; label: string; icon: string }
export declare const COMPOSE_TOOLS: ComposeToolEntry[]
export declare const COMPOSE_TOOL_IDS: string[]
export declare function composeToolGroups(): {
  allIds: string[]
  duplicates: string[]
  missingIcon: string[]
}
