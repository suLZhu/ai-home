/**
 * 单次用户消息的工具执行预算。
 * roundLimit 是模型请求轮次；maxCalls 是实际工具调用次数，两者不是同一个量。
 * 工具调用计数在执行前完成，同一轮返回多项调用也不能绕过上限。
 */
export function createToolExecutionBudget({ roundLimit = 10, maxCalls = 64 } = {}) {
  const rounds = Number(roundLimit)
  const calls = Number(maxCalls)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw new RangeError('工具轮数必须为 1～20')
  if (!Number.isInteger(calls) || calls < 1 || calls > 64) throw new RangeError('工具调用次数必须为 1～64')
  let executedCalls = 0
  return {
    roundLimit: rounds,
    maxCalls: calls,
    get executedCalls() { return executedCalls },
    tryStartTool() {
      if (executedCalls >= calls) return false
      executedCalls++
      return true
    },
    isLastRound(roundIndex) { return roundIndex + 1 >= rounds },
  }
}
