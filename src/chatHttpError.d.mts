export declare function upstreamHint(detail: unknown): string
export declare function friendlyHttpError(status: number | string, detail: unknown): string
export declare function routeInfoFromError(status: number | string, detail: unknown): string

export declare function diagnoseChatHttpError(status: number | string, detail: unknown, options?: { toolsEnabled?: boolean; elapsedMs?: number }): string
export declare function diagnoseChatTransportError(error: unknown, options?: { stage?: 'prepare' | 'request' | 'stream' | 'tool'; elapsedMs?: number; toolsEnabled?: boolean; localMode?: boolean }): string

export declare function diagnoseGptSubscriptionError(status:number,detail:unknown,options?:{elapsedMs?:number;hasAccountId?:boolean}):string
