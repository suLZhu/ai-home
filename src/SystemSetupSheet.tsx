// 启动时的系统权限引导：通知 / 精确定时 / 全屏提醒 / 电池优化。
// 原生桥没有或全部就绪时不显示；用户点「稍后」只在本次会话隐藏，下次启动还会提醒。
import { useEffect, useState } from 'react'
import './SystemSetup.css'
import { readSystemCapabilities, registerSystemHandlers, openSystemSetting, systemBridgeAvailable } from './nativeSystem.mjs'
import { normalizeCapabilities } from './systemCapabilities.mjs'
import { missingSetupRows } from './systemSetup.mjs'

export function SystemSetupSheet({ active }: { active: boolean }) {
  const [caps, setCaps] = useState<ReturnType<typeof normalizeCapabilities> | null>(null)
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!active || !systemBridgeAvailable()) return
    let alive = true
    const read = () => {
      if (!alive) return
      const next = normalizeCapabilities(readSystemCapabilities())
      if (next.available) { setCaps(next); setReady(true) }
    }
    // 等首屏稳定、通知权限系统弹窗结束再读一次。
    const timer = window.setTimeout(read, 900)
    const unregister = registerSystemHandlers({ onStatusChanged: read })
    const onVisible = () => { if (!document.hidden) read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      unregister()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])

  if (!active || dismissed || !ready || !caps) return null
  const missing = missingSetupRows(caps)
  if (!missing.length) return null

  return <div className="setup-scrim" role="presentation">
    <div className="setup-sheet" role="dialog" aria-modal="true" aria-label="系统提醒权限">
      <b className="setup-title">先把提醒的开关打开</b>
      <p className="setup-intro">下面几项系统权限没开时，定时任务到点可能不响、锁屏也不会弹。开一次就好。</p>
      <div className="setup-list">
        {missing.map(row => <div className="setup-row" key={row.id}>
          <span className="setup-row-text">
            <b>{row.label}</b>
            <small>{row.hint}</small>
          </span>
          <button type="button" onClick={() => { openSystemSetting(row.id, false, row.sdk) }}>去开启</button>
        </div>)}
      </div>
      <div className="setup-actions">
        <button type="button" className="setup-later" onClick={() => setDismissed(true)}>稍后</button>
      </div>
    </div>
  </div>
}
