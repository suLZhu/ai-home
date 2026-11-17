// 房间工作区里的小组件：记账本 / 清单 / 便签 / 计数器。
// 助手通过 widget_* 工具创建，长期保存；只有用户点删除才会消失。
import { useCallback, useEffect, useRef, useState } from 'react'
import './RoomWidgets.css'
import { apiFetch } from './apiBase.mjs'
import { confirmDialog } from './uiDialog'
import { IconCheck, IconChevronRight, IconClose, IconEdit, IconGrid, IconLedger, IconMinus, IconPlus, IconSparkles, IconTrash, type IconComponent } from './icons'

export type WidgetType = 'custom' | 'ledger' | 'checklist' | 'note' | 'counter'
export type RoomWidget = {
  id: string
  person: string
  type: WidgetType
  title: string
  config: any
  createdAt: string
  updatedAt: string
}

const TYPE_META: Record<WidgetType, { icon: IconComponent; label: string }> = {
  custom: { icon: IconSparkles, label: 'AI 小组件' },
  ledger: { icon: IconLedger, label: '记账本' },
  checklist: { icon: IconCheck, label: '清单' },
  note: { icon: IconEdit, label: '便签' },
  counter: { icon: IconGrid, label: '计数器' },
}

function money(value: number): string {
  const n = Number(value) || 0
  return (n < 0 ? '-¥' : '¥') + Math.abs(n).toFixed(2)
}

function ledgerTotals(config: any) {
  const entries = Array.isArray(config?.entries) ? config.entries : []
  let expense = 0, income = 0
  for (const entry of entries) {
    const amount = Number(entry?.amount) || 0
    if (entry?.kind === 'income') income += amount
    else expense += amount
  }
  return { expense, income, balance: income - expense, entries }
}

function summary(widget: RoomWidget): string {
  if (widget.type === 'custom') return String(widget.config?.summary || '').trim() || 'AI 定制小组件'
  if (widget.type === 'ledger') {
    const { balance, entries } = ledgerTotals(widget.config)
    return entries.length ? '结余 ' + money(balance) + ' · ' + entries.length + ' 笔' : '还没有记账'
  }
  if (widget.type === 'checklist') {
    const items = Array.isArray(widget.config?.items) ? widget.config.items : []
    const done = items.filter((item: any) => item?.done).length
    return items.length ? done + ' / ' + items.length + ' 已完成' : '还没有条目'
  }
  if (widget.type === 'counter') return '当前 ' + (Number(widget.config?.count) || 0)
  const text = String(widget.config?.text || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 40) : '空白便签'
}

export function RoomWidgets({ person }: { person: string }) {
  const [widgets, setWidgets] = useState<RoomWidget[]>([])
  const [open, setOpen] = useState<RoomWidget | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/widgets?person=' + encodeURIComponent(person), { credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '读取小组件失败')
      setWidgets(Array.isArray(data.widgets) ? data.widgets : [])
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : '读取小组件失败') }
  }, [person])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const onChange = () => { void refresh() }
    window.addEventListener('aihome:widgets-changed', onChange)
    return () => window.removeEventListener('aihome:widgets-changed', onChange)
  }, [refresh])

  if (!widgets.length && !error) return <div className="room-widgets-empty">
    <span aria-hidden="true"><IconGrid size={18}/></span>
    <small>还没有小组件。在聊天里说「给我建一个记账本」，它会一直留在这里。</small>
  </div>

  return <div className="room-widgets">
    {error && <p className="room-widgets-error" role="alert">{error}</p>}
    {widgets.map(widget => {
      const WidgetIcon = TYPE_META[widget.type]?.icon || IconGrid
      return <button type="button" className={'room-widget-card type-' + widget.type} key={widget.id} onClick={() => setOpen(widget)}>
      <span className="room-widget-icon" aria-hidden="true"><WidgetIcon size={18}/></span>
      <span className="room-widget-text">
        <b>{widget.title}</b>
        <small>{summary(widget)}</small>
      </span>
      <span className="room-widget-go" aria-hidden="true"><IconChevronRight size={14}/></span>
    </button>})}
    {open && <WidgetSheet widget={open} onClose={() => setOpen(null)} onSaved={() => { void refresh() }} />}
  </div>
}

function customDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:#403b35}*{box-sizing:border-box}button,input,select,textarea{font:inherit}</style></head><body>
<script>
(function(){
  var data = {};
  var listeners = [];
  function emit(){ for (var i=0;i<listeners.length;i++){ try{ listeners[i](data); }catch(e){} } }
  window.qijian = {
    getData: function(){ return data; },
    setData: function(next){ data = (next && typeof next === 'object') ? next : {}; parent.postMessage({type:'qijian-set-data', data:data}, '*'); emit(); },
    onData: function(fn){ if(typeof fn === 'function'){ listeners.push(fn); try{ fn(data); }catch(e){} } },
    ready: function(){ parent.postMessage({type:'qijian-ready'}, '*'); }
  };
  window.addEventListener('message', function(e){
    if (e.data && e.data.type === 'qijian-data') { data = (e.data.data && typeof e.data.data === 'object') ? e.data.data : {}; emit(); }
  });
  setTimeout(function(){ try{ window.qijian.ready(); }catch(e){} }, 0);
})();
</script>
${html}
</body></html>`
}

function CustomWidgetFrame({ widget, onData }: { widget: RoomWidget; onData: (data: any) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const message = event.data
      if (!message || typeof message !== 'object') return
      if (message.type === 'qijian-ready') {
        const data = widget.config?.data && typeof widget.config.data === 'object' ? widget.config.data : {}
        frameRef.current.contentWindow?.postMessage({ type: 'qijian-data', data }, '*')
      } else if (message.type === 'qijian-set-data') {
        onData(message.data && typeof message.data === 'object' ? message.data : {})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [widget.id, widget.config?.data, onData])
  return <iframe ref={frameRef} className="custom-widget-frame" title={widget.title}
    sandbox="allow-scripts allow-forms"
    srcDoc={customDocument(String(widget.config?.html || ''))}/>
}

function WidgetSheet({ widget, onClose, onSaved }: { widget: RoomWidget; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState<RoomWidget>(widget)
  const [title, setTitle] = useState(widget.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [item, setItem] = useState('')
  const [noteText, setNoteText] = useState(String(widget.config?.text || ''))
  const customTimerRef = useRef<number | undefined>(undefined)
  const customDataRef = useRef<any>(widget.config?.data || {})
  const saveCustomData = useCallback((data: any) => {
    customDataRef.current = data
    window.clearTimeout(customTimerRef.current)
    customTimerRef.current = window.setTimeout(() => {
      void save({ config: { ...current.config, data } })
    }, 400)
  }, [current])
  useEffect(() => () => { window.clearTimeout(customTimerRef.current) }, [])

  async function save(patch: { title?: string; config?: any }) {
    if (busy) return null
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch('/api/widgets/' + encodeURIComponent(current.id), {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: current.person, title: patch.title ?? title, config: patch.config ?? current.config }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '保存失败')
      setCurrent(data.widget)
      onSaved()
      return data.widget as RoomWidget
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      return null
    } finally { setBusy(false) }
  }

  async function rename() {
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === current.title) return
    await save({ title: nextTitle })
  }

  async function addLedger() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value === 0) { setError('金额不能为 0'); return }
    const entries = Array.isArray(current.config?.entries) ? current.config.entries : []
    const next = { ...current.config, entries: [...entries, { id: crypto.randomUUID(), amount: Math.abs(value), note: note.trim(), kind, at: new Date().toISOString() }] }
    const saved = await save({ config: next })
    if (saved) { setAmount(''); setNote('') }
  }

  async function removeEntry(id: string) {
    const entries = (Array.isArray(current.config?.entries) ? current.config.entries : []).filter((entry: any) => entry.id !== id)
    await save({ config: { ...current.config, entries } })
  }

  async function addItem() {
    if (!item.trim()) return
    const items = Array.isArray(current.config?.items) ? current.config.items : []
    const saved = await save({ config: { ...current.config, items: [...items, { id: crypto.randomUUID(), text: item.trim(), done: false }] } })
    if (saved) setItem('')
  }

  async function toggleItem(id: string) {
    const items = (Array.isArray(current.config?.items) ? current.config.items : []).map((entry: any) => entry.id === id ? { ...entry, done: !entry.done } : entry)
    await save({ config: { ...current.config, items } })
  }

  async function removeItem(id: string) {
    const items = (Array.isArray(current.config?.items) ? current.config.items : []).filter((entry: any) => entry.id !== id)
    await save({ config: { ...current.config, items } })
  }

  async function saveNote() {
    await save({ config: { ...current.config, text: noteText } })
  }

  async function bump(delta: number) {
    const count = (Number(current.config?.count) || 0) + delta
    await save({ config: { ...current.config, count } })
  }

  async function removeWidget() {
    if (!(await confirmDialog({ title: '删除小组件', message: '删除「' + current.title + '」？里面的内容也会一起删除。', confirmLabel: '删除', danger: true }))) return
    setBusy(true)
    try {
      const response = await apiFetch('/api/widgets/' + encodeURIComponent(current.id), {
        method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: current.person }),
      })
      if (!response.ok) throw new Error('删除失败')
      onSaved()
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : '删除失败') }
    finally { setBusy(false) }
  }

  const ledger = ledgerTotals(current.config)
  return <div className="widget-sheet-scrim" onClick={onClose}>
    <div className="widget-sheet" role="dialog" aria-modal="true" aria-label={current.title} onClick={event => event.stopPropagation()}>
      <div className="widget-sheet-head">
        <span className="widget-sheet-type">{TYPE_META[current.type]?.label || '小组件'}</span>
        <button type="button" className="widget-sheet-close" onClick={onClose} aria-label="关闭"><IconClose size={15}/></button>
      </div>
      <input className="widget-title-input" value={title} onChange={event => setTitle(event.target.value)} onBlur={() => void rename()} aria-label="小组件名称" />
      {error && <p className="widget-error" role="alert">{error}</p>}

      {current.type === 'custom' && <>
        <CustomWidgetFrame widget={current} onData={saveCustomData}/>
        <p className="custom-widget-hint">AI 定制小组件 · 数据自动保存在这台设备</p>
      </>}

      {current.type === 'ledger' && <>
        <div className="widget-ledger-total">
          <span><small>支出</small><b>{money(ledger.expense)}</b></span>
          <span><small>收入</small><b>{money(ledger.income)}</b></span>
          <span><small>结余</small><b className={ledger.balance < 0 ? 'negative' : ''}>{money(ledger.balance)}</b></span>
        </div>
        <form className="widget-add-row" onSubmit={event => { event.preventDefault(); void addLedger() }}>
          <input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="金额" aria-label="金额" />
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="备注（可选）" aria-label="备注" />
          <button type="button" className={'widget-kind' + (kind === 'income' ? ' income' : '')} onClick={() => setKind(kind === 'income' ? 'expense' : 'income')}>{kind === 'income' ? '收入' : '支出'}</button>
          <button type="submit" disabled={busy}>记一笔</button>
        </form>
        <div className="widget-entries">
          {ledger.entries.length === 0 ? <p className="widget-empty">还没有记录。</p> : ledger.entries.slice().reverse().map((entry: any) =>
            <div className="widget-entry" key={entry.id}>
              <span className="widget-entry-main"><b>{entry.note || (entry.kind === 'income' ? '收入' : '支出')}</b><small>{new Date(entry.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span>
              <span className={'widget-entry-amount ' + (entry.kind === 'income' ? 'income' : '')}>{entry.kind === 'income' ? '+' : '-'}{money(entry.amount)}</span>
              <button type="button" className="widget-entry-delete" aria-label="删除这笔" onClick={() => void removeEntry(entry.id)}><IconTrash size={14}/></button>
            </div>)}
        </div>
      </>}

      {current.type === 'checklist' && <>
        <form className="widget-add-row" onSubmit={event => { event.preventDefault(); void addItem() }}>
          <input value={item} onChange={event => setItem(event.target.value)} placeholder="添加一件事" aria-label="添加清单项" />
          <button type="submit" disabled={busy}>添加</button>
        </form>
        <div className="widget-checklist">
          {(Array.isArray(current.config?.items) ? current.config.items : []).map((entry: any) =>
            <div className={'widget-check-item' + (entry.done ? ' done' : '')} key={entry.id}>
              <button type="button" className="widget-check-box" aria-label={entry.done ? '标记未完成' : '标记完成'} onClick={() => void toggleItem(entry.id)}>{entry.done ? <IconCheck size={13}/> : ''}</button>
              <span>{entry.text}</span>
              <button type="button" className="widget-entry-delete" aria-label="删除" onClick={() => void removeItem(entry.id)}><IconTrash size={14}/></button>
            </div>)}
          {(!current.config?.items || current.config.items.length === 0) && <p className="widget-empty">还没有条目。</p>}
        </div>
      </>}

      {current.type === 'note' && <>
        <textarea className="widget-note" rows={8} value={noteText} onChange={event => setNoteText(event.target.value)} placeholder="写下想留在房间里的内容…" />
        <button type="button" className="widget-save" disabled={busy} onClick={() => void saveNote()}>{busy ? '保存中…' : '保存便签'}</button>
      </>}

      {current.type === 'counter' && <div className="widget-counter">
        <button type="button" onClick={() => void bump(-(Number(current.config?.step) || 1))}><IconMinus size={16}/></button>
        <b>{Number(current.config?.count) || 0}</b>
        <button type="button" onClick={() => void bump(Number(current.config?.step) || 1)}><IconPlus size={16}/></button>
        <button type="button" className="widget-counter-reset" onClick={() => void save({ config: { ...current.config, count: 0 } })}>归零</button>
      </div>}

      <div className="widget-sheet-actions">
        <button type="button" className="widget-delete" disabled={busy} onClick={() => void removeWidget()}>删除小组件</button>
      </div>
    </div>
  </div>
}
