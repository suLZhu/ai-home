export interface ToolExecutionBudget {
  readonly roundLimit: number
  readonly maxCalls: number
  readonly executedCalls: number
  tryStartTool(): boolean
  isLastRound(roundIndex: number): boolean
}
export function createToolExecutionBudget(options?: { roundLimit?: number; maxCalls?: number }): ToolExecutionBudget
