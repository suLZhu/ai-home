import { useEffect, useState } from 'react'
import { CHAT_DISPLAY_EVENT, loadChatDisplay, saveChatDisplay, type ChatDisplayPrefs } from './chatDisplayPrefs.mjs'

const ITEMS: Array<{ key: keyof ChatDisplayPrefs; label: string; hint?: string }> = [
  { key: 'assistantAvatar', label: '助手头像' },
  { key: 'userAvatar', label: '用户头像' },
  { key: 'assistantName', label: '助手名称' },
  { key: 'userName', label: '用户名称' },
  { key: 'time', label: '发送消息时间', hint: '显示在对话框上或下' },
  { key: 'token', label: 'Token 用量' },
]

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
    <div className="chat-display-options">
      {ITEMS.map((item) => <label key={item.key} className="chat-display-option">
        <input type="checkbox" checked={Boolean(prefs[item.key])} onChange={(e) => patch(item.key, e.target.checked)}/>
        <span><b>{item.label}</b>{item.hint && <small>{item.hint}</small>}</span>
      </label>)}
    </div>
    <div className="chat-display-timepos" aria-label="消息时间位置">
      <span>时间位置</span>
      <label><input type="radio" name="chatDisplayTimePos" checked={prefs.timePos === 'above'} onChange={() => patch('timePos', 'above')}/>气泡上方</label>
      <label><input type="radio" name="chatDisplayTimePos" checked={prefs.timePos === 'below'} onChange={() => patch('timePos', 'below')}/>气泡下方</label>
    </div>
  </div>
}
