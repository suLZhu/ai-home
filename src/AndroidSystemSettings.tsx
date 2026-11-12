import { useCallback, useEffect, useState } from 'react'
import { normalizeCapabilities, type Capabilities } from './systemCapabilities.mjs'
import {
  readSystemCapabilities, openSystemSetting, registerSystemHandlers,
  showSystemNotification,
} from './nativeSystem.mjs'
import { notificationPayload } from './notificationDispatch.mjs'

/**
 * 「Android 系统能力」设置页：只有标题 + 真实状态 + 一行点击。
 * 原生层不能改系统策略的项，点进去只申请权限或打开对应系统设置页；
 * 正常项不写任何说明，异常项最多一行短句。
 */
export function AndroidSystemSettings({
  people, displayName, avatarOf,
}: {
  people: string[]
  displayName: (person: string) => string
  avatarOf: (person: string) => string
}) {
  const [caps, setCaps] = useState<Capabilities>(() => normalizeCapabilities(readSystemCapabilities()))
  const [note, setNote] = useState('')

  const refresh = useCallback(() => setCaps(normalizeCapabilities(readSystemCapabilities())), [])

  useEffect(() => {
    // 初始值已在 useState 里读好；这里只做一次异步复核，避免在 effect 里同步 setState。
    const initial = window.setTimeout(refresh, 0)
    const unregister = registerSystemHandlers({ onStatusChanged: refresh })
    const onFocus = () => refresh()
    const onVisible = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(initial)
      unregister()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  function openRow(row: Capabilities['rows'][number]) {
    if (!caps.available) return
    openSystemSetting(row.id, row.ok, caps.sdk)
    // 从系统设置返回时 focus / visibilitychange 会刷新；这里再补一次，覆盖部分 ROM 不派发焦点事件。
    window.setTimeout(refresh, 1200)
  }

  function testNotification() {
    const person = people[0] || ''
    const payload = notificationPayload({
      kind: 'message', person, label: person ? displayName(person) : '',
      text: '这是一条系统能力测试通知。', messageId: 'system-capability-test',
      avatar: person ? avatarOf(person) : '', at: Date.now(),
    })
    // test=true：原生层不写入去重集合，可以反复验证渠道、头像与锁屏显示。
    const sent = showSystemNotification({ ...payload, test: true })
    setNote(sent ? '已发送' : '通知未授权或不在 App 内')
    window.setTimeout(() => setNote(''), 2600)
  }

  return <div className="syscap-panel" id="android-system-panel">
    <div className="syscap-head">
      <b>Android 系统能力</b>
      <span>{caps.available ? '本机状态' : '仅 Android App 内可用'}</span>
    </div>
    <div className="kelivo-list syscap-list">
      {caps.rows.map((row) => <div className="syscap-item" key={row.id}>
        <button type="button" className="syscap-row" onClick={() => openRow(row)} aria-label={row.label + '：' + row.status}>
          <span className="syscap-label">{row.label}</span>
          <span className={'syscap-status ' + (caps.available ? (row.ok ? 'ok' : 'bad') : 'idle')}>{row.status}</span>
          <span className="syscap-chevron" aria-hidden="true">›</span>
        </button>
        {caps.available && !row.ok && row.hint && <p className="syscap-hint">{row.hint}</p>}
      </div>)}
    </div>
    <div className="syscap-foot">
      <span>{caps.available ? '已登记 ' + caps.alarm.registered + ' 条定时提醒' + (caps.alarm.degraded ? ' · 非精确调度' : ' · 精确定时') : '当前为电脑预览'}</span>
      <div>
        <button type="button" className="btn btn-ghost" onClick={refresh}>刷新</button>
        <button type="button" className="btn btn-secondary" onClick={testNotification}>测试通知</button>
      </div>
    </div>
    {note && <p className="syscap-note" role="status">{note}</p>}
  </div>
}
