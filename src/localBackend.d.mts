// 本地模式后端垫片的类型声明（对应 localBackend.mjs）。
// 未配置服务器地址时，apiBase.apiFetch 把全部 /api/* 请求路由到 localHandle。

// 分发一个 /api/* 请求，返回与 src/server.mjs 同构的 Response
// （JSON 或上游流式透传）；任何异常都会收敛成 500 JSON。
export declare function localHandle(path: string, init?: RequestInit): Promise<Response>

// 启动预热：把 IndexedDB 中的附件字节换成本会话有效的 blob: objectURL。
// 失败静默（图片按既有逻辑显示失效占位），不阻塞渲染。
export declare function warmupLocalAttachments(): Promise<void>

// assetUrl() 在本地模式下用它把 /api/attachments/<id> 稳定引用换成
// objectURL；未注册（不存在/未预热）时原样返回。
export declare function localAttachmentUrl(preview: unknown): string
