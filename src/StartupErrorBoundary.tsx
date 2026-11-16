import { Component, type ErrorInfo, type ReactNode } from 'react'
import { App as NativeApp } from '@capacitor/app'

type Props = { children: ReactNode }
type State = { failure: string | null }

export default class StartupErrorBoundary extends Component<Props, State> {
  state: State = { failure: null }

  static getDerivedStateFromError(error: Error): State {
    return { failure: String(error?.message || error || '未知界面错误') }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[qijian startup] UI render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failure) return this.props.children
    const text = this.state.failure
    return <main role="alert" style={{
      boxSizing: 'border-box', padding: 'max(48px, env(safe-area-inset-top, 0px)) 24px 32px',
      minHeight: '100dvh', background: '#f8f6fb', color: '#453f51',
      fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <h1 style={{ fontSize: 24, margin: '16px 0 0' }}>栖间暂时无法打开</h1>
      <p>界面加载遇到了错误。这里不会清除你的聊天记录、世界书或密钥，请先尝试重新打开。</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 14,
        background: '#eeeaf3', borderRadius: 12, fontSize: 12 }}>{text}</pre>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        <button type="button" onClick={() => {
          const report = '栖间启动错误：' + text
          void navigator.clipboard?.writeText(report).catch(() => {})
        }}>复制错误</button>
        <button type="button" onClick={() => void NativeApp.exitApp()}>退出应用</button>
      </div>
      <small>若反复出现，请截图这个页面给开发者；不要卸载应用或清除数据。</small>
    </main>
  }
}
