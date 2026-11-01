import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE_STORAGE_KEY, resolveApiBase, setApiBase } from './apiBase.mjs'

// 统一 API Base URL 启动初始化。
// 优先级：开发者设置里的运行时覆盖（localStorage）> 构建期 VITE_API_BASE_URL > 空（同源相对路径，Web 原行为）。
// 这里必须在渲染任何组件前调用，确保首次 fetch/EventSource 就用上正确的 base。
try {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_STORAGE_KEY) : ''
  const buildBase = (import.meta as any).env?.VITE_API_BASE_URL ?? ''
  setApiBase(resolveApiBase({ override, buildBase }))
} catch {
  // localStorage 不可用（隐私模式等）时退回同源，不阻塞启动。
  setApiBase('')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
