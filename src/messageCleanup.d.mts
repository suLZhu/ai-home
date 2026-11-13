/** 清洗一段完整文本中的系统注入块与 DSML / function_calls 协议标签。 */
export declare function cleanupMessageText(input: unknown): string

/** 有状态的流式清洗器：push 返回本次可安全显示的增量，flush 冲刷残留。 */
export declare function createStreamCleanup(): {
  push(chunk: string): string
  flush(): string
}
