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
  const patch = (key: keyof ChatDisplayPrefs, value: boolean | string) => {
    const next = { ...prefs, [key]: value } as ChatDisplayPrefs
    setPrefs(next)
    saveChatDisplay(next)
  }
  return <div className="setting-card settings-inner-card chat-display-settings">
    <b>聊天展示设置</b>
    <p className="muted">勾选的内容才会出现在对话气泡周围；不勾选就保持干净。时间可放在气泡上方或下方。</p>

    <div className="chat-display-grid">
      <Option checked={prefs.assistantAvatar} label="助手头像" onChange={(v) => patch('assistantAvatar', v)}/>
      <Option checked={prefs.userAvatar} label="用户头像" onChange={(v) => patch('userAvatar', v)}/>
      <Option checked={prefs.assistantName} label="助手名称" onChange={(v) => patch('assistantName', v)}/>
      <Option checked={prefs.userName} label="用户名称" onChange={(v) => patch('userName', v)}/>

      <div className="chat-display-time-cell">
        <Option checked={prefs.time} label="发送消息时间" onChange={(v) => patch('time', v)}/>
        <div className="chat-display-timepos" role="radiogroup" aria-label="发送消息时间位置">
          <label><input type="radio" name="chatDisplayTimePos" checked={prefs.timePos === 'above'} disabled={!prefs.time} onChange={() => patch('timePos', 'above')}/>上</label>
          <label><input type="radio" name="chatDisplayTimePos" checked={prefs.timePos === 'below'} disabled={!prefs.time} onChange={() => patch('timePos', 'below')}/>下</label>
        </div>
      </div>

      <Option checked={prefs.token} label="Token 用量" onChange={(v) => patch('token', v)}/>
    </div>

    <div className="chat-display-preview" aria-label="聊天展示实时预览">
      <span className="chat-display-preview-label">实时预览</span>
      <div className="cdp-row assistant">
        {prefs.assistantAvatar && <span className="cdp-avatar" aria-hidden="true">A</span>}
        <div className="cdp-stack start">
          {prefs.assistantName && <span className="cdp-name">助手</span>}
          {prefs.time && prefs.timePos === 'above' && <span className="cdp-time">14:35</span>}
          <span className="cdp-bubble">这是一条助手预览消息</span>
          {prefs.time && prefs.timePos === 'below' && <span className="cdp-time">14:35</span>}
          {prefs.token && <span className="cdp-token">Token 128</span>}
        </div>
      </div>
      <div className="cdp-row user">
        {prefs.userAvatar && <span className="cdp-avatar me" aria-hidden="true">我</span>}
        <div className="cdp-stack end">
          {prefs.userName && <span className="cdp-name end">我</span>}
          {prefs.time && prefs.timePos === 'above' && <span className="cdp-time">14:36</span>}
          <span className="cdp-bubble me">这是一条用户预览消息</span>
          {prefs.time && prefs.timePos === 'below' && <span className="cdp-time">14:36</span>}
        </div>
      </div>
    </div>
  </div>
}
