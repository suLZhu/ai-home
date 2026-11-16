import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE_STORAGE_KEY, resolveApiBase, setApiBase } from './apiBase.mjs'
import { warmupLocalAttachments } from './localBackend.mjs'

// 统一 API Base URL 启动初始化。
// 优先级：开发者设置里的运行时覆盖（localStorage）> 构建期 VITE_API_BASE_URL > 空。
// base 为空 = 本地模式（LocalBackend 应答 /api/*，开箱即用）；填了地址 = 云端代理模式。
// 这里必须在渲染任何组件前调用，确保首次 fetch/EventSource 就用上正确的 base。
try {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_STORAGE_KEY) : ''
  const buildBase = (import.meta as any).env?.VITE_API_BASE_URL ?? ''
  setApiBase(resolveApiBase({ override, buildBase }))
} catch {
  // localStorage 不可用（隐私模式等）时退回同源，不阻塞启动。
  setApiBase('')
}

// 本地模式预热：把 IndexedDB 里的图片附件换成本会话有效的 objectURL，
// 让聊天记录里的 /api/attachments/<id> 引用在首帧就能显示（失败不阻塞启动）。
void warmupLocalAttachments().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
