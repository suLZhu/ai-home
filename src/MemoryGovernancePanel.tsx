// 记忆治理面板：助手提议的记忆先进候选区，用户确认后才生效；拒绝会留墓碑，
// 同样的内容不会再被提议。工具调用看板和「记忆面板」共用这一份实现。
import { useState } from 'react'
import { SoftSelect } from './SoftSelect'
import {
  useMemoryRecords, transitionMemoryRecord, createMemoryRecord,
  LIFECYCLE_LABEL, SCOPE_LABEL, type MemoryLifecycle, type MemoryRecord,
} from './memoryGovernance'
import { MemoryViewSwitcher, MemoryVisualizer, type MemoryView } from './memoryViews'
import { MEMORY_VIEW_KEY, normalizeMemoryView } from './memoryVisuals.mjs'
import { IconShare } from './icons'

const CATEGORIES = ['人物关系', '经历事件', '偏好习惯', '项目进度', '其他']

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function MemoryGovernancePanel({ person, onJumpToSource, hint, showViews = true, onTidy }: {
  person: string
  onJumpToSource?: (conversationId: string, messageId?: string) => void
  hint?: string
  showViews?: boolean
  onTidy?: (records: MemoryRecord[]) => Promise<{ created: number; archived: number; scanned: number }>
}) {
  const { records, error, refresh } = useMemoryRecords(person)
  const [filter, setFilter] = useState<'全部' | MemoryLifecycle>('全部')
  const [busy, setBusy] = useState('')
  const [tidying, setTidying] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState({ title: '', content: '', keywords: '', category: '其他' })
  const [creating, setCreating] = useState(false)
  // 记忆的展示方式：星空 / 花园 / 日记本 / 列表；选择按浏览器保存，下次进来沿用。
  const [view, setView] = useState<MemoryView>(() => {
    try { return normalizeMemoryView(localStorage.getItem(MEMORY_VIEW_KEY) || '') } catch { return 'stars' }
  })
  const changeView = (next: MemoryView) => {
    setView(next)
    try { localStorage.setItem(MEMORY_VIEW_KEY, next) } catch { /* 私密模式忽略 */ }
  }

  async function transition(record: MemoryRecord, lifecycle: MemoryLifecycle): Promise<boolean> {
    if (busy) return false
    setBusy(record.id + ':' + lifecycle)
    setActionError('')
    setNotice('')
    try {
      await transitionMemoryRecord(record.id, lifecycle)
      setNotice(`「${record.title}」${lifecycle === 'active' ? '已生效' : lifecycle === 'rejected' ? '已拒绝（保留墓碑，不会再次提议）' : '已归档'}。`)
      await refresh()
      return true
    } catch (e) { setActionError(e instanceof Error ? e.message : '记忆状态变更失败'); return false }
    finally { setBusy('') }
  }

  async function tidy() {
    if (!onTidy || tidying) return
    setTidying(true); setActionError(''); setNotice('')
    try {
      const result = await onTidy(records)
      setNotice(result.scanned === 0
        ? '还没有可整理的记忆。'
        : `AI 整理完成：看了 ${result.scanned} 条，合并/改写后新增 ${result.created} 条，归档 ${result.archived} 条。`)
      await refresh()
    } catch (e) { setActionError(e instanceof Error ? e.message : 'AI 整理失败') }
    finally { setTidying(false) }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    setActionError('')
    setNotice('')
    setCreating(true)
    try {
      const result = await createMemoryRecord(person, draft)
      setNotice(result.duplicate ? '相同内容的记忆已存在，未重复创建。' : '已保存并直接生效（你亲手记录的不需要审批）。')
      setDraft({ title: '', content: '', keywords: '', category: '其他' })
      await refresh()
    } catch (err) { setActionError(err instanceof Error ? err.message : '保存记忆失败') }
    finally { setCreating(false) }
  }

  const statusOptions: { key: '全部' | MemoryLifecycle; text: string }[] = [
    { key: '全部', text: '全部' }, { key: 'candidate', text: '候选' }, { key: 'active', text: '已生效' },
    { key: 'archived', text: '已归档' }, { key: 'rejected', text: '已拒绝' },
  ]
  const visible = records.filter(r => filter === '全部' || r.lifecycle === filter)

  return <section className="tool-dash-memory" aria-label="记忆治理">
    <header className="tool-dash-runs-head">
      <div><b>记忆治理</b><small>{hint || '助手提议的记忆进候选区（自动整理可在上方设为直接生效）；拒绝会留墓碑，同样的内容不会再被提议。'}</small></div>
      <div className="tool-dash-runs-actions">
        {onTidy && records.length > 0 && <button type="button" className="tool-dash-refresh" disabled={tidying || !!busy} onClick={() => void tidy()}>{tidying ? '整理中…' : 'AI 整理'}</button>}
        <button type="button" className="tool-dash-refresh" onClick={() => void refresh()}>刷新</button>
      </div>
    </header>
    {showViews && <MemoryViewSwitcher value={view} onChange={changeView}/>}
    {error && <p className="tool-dash-error" role="alert">{error}</p>}
    {actionError && <p className="tool-dash-error" role="alert">{actionError}</p>}
    {notice && <p className="tool-dash-note" role="status">{notice}</p>}
    <div className="tool-dash-chip-row" role="group" aria-label="记忆状态筛选">
      {statusOptions.map(option => <button type="button" key={option.key}
        className={'tool-dash-chip' + (filter === option.key ? ' active' : '')}
        aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>{option.text}</button>)}
    </div>
    {records.length === 0
      ? <p className="tool-dash-note">还没有记忆记录。助手在对话中调用 memory_add 提议、或你手动新增后，会出现在这里。</p>
      : visible.length === 0
      ? <p className="memory-view-empty">这个筛选下还没有记忆。</p>
      : view !== 'list' && showViews
      ? <MemoryVisualizer view={view as Exclude<MemoryView, 'list'>} records={visible} onTransition={transition}/>
      : <ul className="tool-dash-memory-list">{visible.map(record => <li className={'tool-dash-memory-item lifecycle-' + record.lifecycle} key={record.id}>
          <div className="tool-dash-item-top">
            <span className={'tool-dash-badge ' + (record.lifecycle === 'active' ? 'success' : record.lifecycle === 'candidate' ? 'running' : 'error')}>
              {LIFECYCLE_LABEL[record.lifecycle]}
            </span>
            <b>{record.title}</b>
            <span className="tool-dash-item-meta">{SCOPE_LABEL[record.scope]} · {record.category} · {record.createdBy === 'model' ? '助手提议' : '手动记录'}</span>
          </div>
          <p className="tool-dash-args">{record.content}</p>
          {record.keywords && <small className="tool-dash-note">关键词：{record.keywords}</small>}
          <div className="tool-dash-item-meta">
            <span>被召回 {record.recallCount} 次</span>
            <span>更新于 {formatWhen(record.updatedAt)}</span>
          </div>
          <div className="tool-dash-memory-actions">
            {record.sourceConversationId && onJumpToSource && <button type="button" className="tool-dash-jump"
              onClick={() => onJumpToSource(record.sourceConversationId, record.sourceMessageIds[0])}>跳回来源会话 <IconShare className="ui-icon-inline" size={13}/></button>}
            {record.lifecycle === 'candidate' && <>
              <button type="button" className="tool-dash-approve" disabled={!!busy} onClick={() => void transition(record, 'active')}>确认生效</button>
              <button type="button" className="tool-dash-reject" disabled={!!busy} onClick={() => void transition(record, 'rejected')}>拒绝</button>
            </>}
            {record.lifecycle === 'active' && <>
              <button type="button" className="tool-dash-chip" disabled={!!busy} onClick={() => void transition(record, 'archived')}>归档</button>
              <button type="button" className="tool-dash-reject" disabled={!!busy} onClick={() => void transition(record, 'rejected')}>拒绝</button>
            </>}
            {(record.lifecycle === 'archived' || record.lifecycle === 'rejected') &&
              <button type="button" className="tool-dash-approve" disabled={!!busy} onClick={() => void transition(record, 'active')}>恢复生效</button>}
          </div>
        </li>)}</ul>}
    <details className="memory-create-fold">
      <summary>手动新增记忆（直接生效）</summary>
    <form className="tool-dash-memory-create" onSubmit={e => void create(e)}>
      <input required maxLength={120} value={draft.title} onChange={e => setDraft(old => ({ ...old, title: e.target.value }))} placeholder="记忆标题，例如：我们决定周六去看展" aria-label="记忆标题" />
      <textarea required rows={2} maxLength={4000} value={draft.content} onChange={e => setDraft(old => ({ ...old, content: e.target.value }))} placeholder="值得长期记住的事实、约定或偏好" aria-label="记忆内容" />
      <div className="tool-dash-memory-create-row">
        <input value={draft.keywords} onChange={e => setDraft(old => ({ ...old, keywords: e.target.value }))} placeholder="召回关键词，逗号分隔" aria-label="召回关键词" />
        <SoftSelect ariaLabel="分类" value={draft.category} onChange={value => setDraft(old => ({ ...old, category: value }))} options={CATEGORIES.map(category => ({ value: category, label: category }))}/>
        <button type="submit" disabled={creating || !draft.title.trim() || !draft.content.trim()}>{creating ? '保存中…' : '保存记忆'}</button>
      </div>
    </form>
    </details>
  </section>
}
