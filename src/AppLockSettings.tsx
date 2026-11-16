import { useEffect, useMemo, useState } from 'react'
import { appLockApps, appLockAvailable, appLockOpenSettings, appLockSetLocked, appLockSetPin, appLockStatus, type AppLockApp, type AppLockStatus } from './appLock.mjs'

export function AppLockSettings() {
  const available = appLockAvailable()
  const [status, setStatus] = useState<AppLockStatus | null>(null)
  const [apps, setApps] = useState<AppLockApp[]>([])
  const [query, setQuery] = useState('')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => {
    setStatus(appLockStatus())
    setApps(appLockApps())
  }
  useEffect(() => {
    refresh()
    const onResume = () => refresh()
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)
    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => !q || a.label.toLowerCase().includes(q) || a.pkg.toLowerCase().includes(q))
  }, [apps, query])

  const toggle = (app: AppLockApp) => {
    const ok = appLockSetLocked(app.pkg, !app.locked)
    if (!ok) { setMessage('保存失败，请确认在 Android App 内操作'); return }
    setApps((old) => old.map((a) => a.pkg === app.pkg ? { ...a, locked: !a.locked } : a))
    setMessage(app.locked ? `已解除「${app.label}」` : `已锁定「${app.label}」`)
    setStatus(appLockStatus())
  }

  const savePin = () => {
    const res = appLockSetPin(pin)
    setMessage(res.ok ? 'PIN 已保存' : (res.error || 'PIN 保存失败'))
    if (res.ok) setPin('')
    setStatus(appLockStatus())
  }

  if (!available) {
    return <div className="setting-card settings-inner-card"><b>应用锁</b><p className="muted">应用锁需要 Android App 的原生无障碍服务；浏览器或桌面端不可用。</p></div>
  }

  return <div className="setting-card settings-inner-card app-lock">
    <b>应用锁</b>
    <p className="muted">勾选要锁定的应用。打开它们时会先显示解锁页，输入 PIN 才能继续；只监听前台应用切换，不读取屏幕内容、不模拟点击。</p>

    <div className={'app-lock-state' + (status?.accessibility ? ' ok' : ' bad')}>
      <span>{status?.accessibility ? '无障碍服务已开启' : '无障碍服务未开启'}</span>
      {!status?.accessibility && <button type="button" onClick={() => { appLockOpenSettings(); setMessage('已跳转系统设置，找到「栖间」打开无障碍开关') }}>去开启</button>}
    </div>

    <div className="app-lock-pin">
      <label>{status?.hasPin ? '修改 PIN' : '设置 PIN（4–32 位）'}
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder={status?.hasPin ? '输入新 PIN' : '例如 1234'} maxLength={32}/>
      </label>
      <button type="button" disabled={!pin.trim()} onClick={savePin}>保存 PIN</button>
    </div>

    {message && <p className="muted app-lock-msg">{message}</p>}

    <input className="memory-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索应用名称或包名" aria-label="搜索应用"/>

    <div className="app-lock-list">
      {filtered.map((app) => <label className="app-lock-row" key={app.pkg}>
        <input type="checkbox" checked={app.locked} onChange={() => toggle(app)}/>
        <span className="app-lock-name"><b>{app.label}</b><small>{app.pkg}</small></span>
      </label>)}
      {filtered.length === 0 && <p className="muted">没有匹配的应用。</p>}
    </div>
  </div>
}
