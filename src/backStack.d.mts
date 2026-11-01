// Android 返回键处理栈的类型声明（对应 backStack.mjs）。
export declare function pushBackHandler(fn: () => boolean | void): () => void
export declare function handleBack(): boolean
export declare function backStackDepth(): number
export declare function clearBackHandlers(): void
