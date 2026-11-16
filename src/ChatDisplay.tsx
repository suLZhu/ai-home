import { useEffect, useState } from 'react'
import { CHAT_DISPLAY_EVENT, loadChatDisplay, saveChatDisplay, type ChatDisplayPrefs } from './chatDisplayPrefs.mjs'

export function useChatDisplay() {
  const [prefs, setPrefs] = useState<ChatDisplayPrefs>(() => loadChatDisplay())
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setPrefs(detail ? { ...loadChatDisplay(), ...detail } : loadChatDisplay())
    }
    window.addEventListener(CHAT_DISPLAY_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(CHAT_DISPLAY_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return prefs
}

function Option({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return <label className="chat-display-option">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/>
    <span>{label}</span>
  </label>
}

export function ChatDisplaySettings() {
  const [prefs, setPrefs] = useState<ChatDisplayPrefs>(() => loadChatDisplay())
  const patch = (key: keyof ChatDisplayPrefs, value: boolean | string | number) => {
    const next = { ...prefs, [key]: value } as ChatDisplayPrefs
    setPrefs(next)
    saveChatDisplay(next)
  }
  return <div className="setting-card settings-inner-card chat-display-settings">
    <b>聊天展示设置</b>
    <p className="muted">勾选的内容才会出现在对话气泡周围；不勾选就保持干净。时间与名称并排显示在气泡上方。</p>

    <div className="chat-display-grid">
      <Option checked={prefs.assistantAvatar} label="助手头像" onChange={(v) => patch('assistantAvatar', v)}/>
      <Option checked={prefs.userAvatar} label="用户头像" onChange={(v) => patch('userAvatar', v)}/>
      <Option checked={prefs.assistantName} label="助手名称" onChange={(v) => patch('assistantName', v)}/>
      <Option checked={prefs.userName} label="用户名称" onChange={(v) => patch('userName', v)}/>
      <Option checked={prefs.time} label="发送消息时间" onChange={(v) => patch('time', v)}/>
      <Option checked={prefs.token} label="Token 用量" onChange={(v) => patch('token', v)}/>
    </div>

    <section className="chat-thinking-settings" aria-label="思考模式与工具调用">
      <h3>思考模式</h3>
      <p className="muted">只展示模型接口实际返回的思考内容；默认折叠，不会生成或猜测隐藏推理。</p>
      <Option checked={prefs.showReasoning} label="显示思考过程（折叠卡片）" onChange={v=>patch('showReasoning',v)}/>
      <Option checked={prefs.autoTranslateReasoning} label="自动翻译英文思考内容（需额外请求）" onChange={v=>patch('autoTranslateReasoning',v)}/>
      <Option checked={prefs.showReasoningDuration} label="显示思考耗时" onChange={v=>patch('showReasoningDuration',v)}/>
      <h3>工具调用</h3>
      <Option checked={prefs.showToolCalls} label="显示工具调用记录（折叠卡片）" onChange={v=>patch('showToolCalls',v)}/>
      <label className="chat-tool-limit">连续工具调用最大轮数
        <select value={prefs.toolRoundLimit} onChange={e=>patch('toolRoundLimit',Number(e.target.value))}>
          {[5,10,15,20].map(n=><option key={n} value={n}>{n} 轮</option>)}
        </select>
      </label>
      <p className="muted">轮数是连续请求上限；单轮可能调用多个工具。提高上限可能增加用量。</p>
    </section>
    <div className="chat-display-preview" aria-label="聊天展示实时预览">
      <span className="chat-display-preview-label">实时预览</span>
      <div className="cdp-row assistant">
        {prefs.assistantAvatar && <span className="cdp-avatar" aria-hidden="true">A</span>}
        <div className="cdp-stack start">
          {prefs.time && <span className="cdp-time">26/11/14 14:35</span>}
          {prefs.assistantName && <span className="cdp-name">助手</span>}
          <span className="cdp-bubble">这是一条助手预览消息</span>
          {prefs.token && <span className="cdp-token">Token 128</span>}
        </div>
      </div>
      <div className="cdp-row user">
        {prefs.userAvatar && <span className="cdp-avatar me" aria-hidden="true">我</span>}
        <div className="cdp-stack start">
          {prefs.time && <span className="cdp-time">26/11/14 14:36</span>}
          {prefs.userName && <span className="cdp-name">我</span>}
          <span className="cdp-bubble me">这是一条用户预览消息</span>
        </div>
      </div>
    </div>
  </div>
}
