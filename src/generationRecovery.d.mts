export declare const ACTIVE_GENERATION_KEY: string
export declare const INTERRUPTED_NOTE: string
export declare function readActiveGeneration(storage: { getItem(k: string): string | null } | null | undefined): { person: string; conversationId: string; messageId: string; at: number } | null
export declare function startGeneration(storage: { setItem(k: string, v: string): void } | null | undefined, info: Record<string, unknown>, now?: number): boolean
export declare function finishGeneration(storage: { getItem(k: string): string | null; removeItem(k: string): void } | null | undefined, messageId: string): boolean
export declare function needsGenerationRecovery(active: unknown, sending: boolean): boolean
export declare function recoverInterruptedMessages(messages: unknown[], messageId: string, note?: string): { messages: any[]; changed: boolean }
