// 记忆的三种可视化：星空 / 花园 / 日记本，外加原来的列表。
// 只负责画和点开详情；状态变更仍交给 MemoryGovernancePanel 的 transition。
import { useMemo, useState } from 'react'
import './MemoryViews.css'
import { IconStar, IconFlower, IconBook, IconList, IconClose, type IconComponent } from './icons'
import {
  MEMORY_VIEWS, normalizeMemoryView, starLayout, gardenLayout, groupMemoriesByDay, categoryColor,
} from './memoryVisuals.mjs'
import { LIFECYCLE_LABEL, SCOPE_LABEL, type MemoryLifecycle, type MemoryRecord } from './memoryGovernance'

export type MemoryView = 'stars' | 'garden' | 'diary' | 'list'

const VIEW_OPTIONS: { value: MemoryView; label: string; Icon: IconComponent }[] = [
  { value: 'stars', label: '星空', Icon: IconStar },
  { value: 'garden', label: '花园', Icon: IconFlower },
  { value: 'diary', label: '日记本', Icon: IconBook },
  { value: 'list', label: '列表', Icon: IconList },
]

const LEGEND = ['人物关系', '经历事件', '偏好习惯', '项目进度', '其他']

export function MemoryViewSwitcher({ value, onChange }: { value: MemoryView; onChange: (next: MemoryView) => void }) {
  return <div className="memory-view-switch" role="tablist" aria-label="记忆显示方式">
    {VIEW_OPTIONS.map(option => <button type="button" role="tab" key={option.value}
      aria-selected={value === option.value}
      className={'memory-view-tab' + (value === option.value ? ' active' : '')}
      onClick={() => onChange(option.value)}>
      <option.Icon size={15}/><span>{option.label}</span>
    </button>)}
  </div>
}

function formatDay(day: string): string {
  if (day === '未记日期') return day
  const date = new Date(day + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function StarShape({ size }: { size: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M12 1.6 14.7 9.3 22.4 12 14.7 14.7 12 22.4 9.3 14.7 1.6 12 9.3 9.3Z" fill="currentColor"/>
  </svg>
}

function FlowerShape({ color, petals, size }: { color: string; petals: number; size: number }) {
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
    {Array.from({ length: petals }, (_, index) => <ellipse key={index}
      cx="50" cy="30" rx="12.5" ry="23" fill={color} opacity="0.9"
      transform={`rotate(${index * (360 / petals)} 50 50)`}/>)}
    <circle cx="50" cy="50" r="11" fill="#f6e7b4"/>
    <circle cx="50" cy="50" r="5" fill="#e7c87a" opacity="0.8"/>
  </svg>
}

function MemoryRecordSheet({ record, onClose, onTransition }: {
  record: MemoryRecord
  onClose: () => void
  onTransition: (record: MemoryRecord, lifecycle: MemoryLifecycle) => Promise<boolean>
}) {
  const [busy, setBusy] = useState('')
  async function act(lifecycle: MemoryLifecycle) {
    if (busy) return
    setBusy(lifecycle)
    const ok = await onTransition(record, lifecycle)
    setBusy('')
    if (ok) onClose()
  }
  return <div className="memory-sheet-scrim" onClick={onClose}>
    <div className="memory-sheet" role="dialog" aria-modal="true" aria-label={record.title} onClick={event => event.stopPropagation()}>
      <div className="memory-sheet-head">
        <span className={'memory-sheet-badge ' + record.lifecycle}>{LIFECYCLE_LABEL[record.lifecycle]}</span>
        <button type="button" className="memory-sheet-close" onClick={onClose} aria-label="关闭"><IconClose size={15}/></button>
      </div>
      <b className="memory-sheet-title">{record.title}</b>
      <p className="memory-sheet-meta">{SCOPE_LABEL[record.scope]} · {record.category} · {record.createdBy === 'model' ? '助手提议' : '手动记录'}</p>
      <p className="memory-sheet-content">{record.content}</p>
      {record.keywords && <small className="memory-sheet-keywords">关键词：{record.keywords}</small>}
      <small className="memory-sheet-foot">被召回 {record.recallCount} 次 · 更新于 {formatWhen(record.updatedAt)}</small>
      <div className="memory-sheet-actions">
        {record.lifecycle === 'candidate' && <>
          <button type="button" className="memory-sheet-ok" disabled={!!busy} onClick={() => void act('active')}>{busy === 'active' ? '确认中…' : '确认生效'}</button>
          <button type="button" className="memory-sheet-danger" disabled={!!busy} onClick={() => void act('rejected')}>拒绝</button>
        </>}
        {record.lifecycle === 'active' && <>
          <button type="button" className="memory-sheet-muted" disabled={!!busy} onClick={() => void act('archived')}>归档</button>
          <button type="button" className="memory-sheet-danger" disabled={!!busy} onClick={() => void act('rejected')}>拒绝</button>
        </>}
        {(record.lifecycle === 'archived' || record.lifecycle === 'rejected') &&
          <button type="button" className="memory-sheet-ok" disabled={!!busy} onClick={() => void act('active')}>恢复生效</button>}
      </div>
    </div>
  </div>
}

export function MemoryVisualizer({ view, records, onTransition }: {
  view: Exclude<MemoryView, 'list'>
  records: MemoryRecord[]
  onTransition: (record: MemoryRecord, lifecycle: MemoryLifecycle) => Promise<boolean>
}) {
  const [detail, setDetail] = useState<MemoryRecord | null>(null)
  const stars = useMemo(() => starLayout(records), [records])
  const flowers = useMemo(() => gardenLayout(records), [records])
  const days = useMemo(() => groupMemoriesByDay(records) as { day: string; records: MemoryRecord[] }[], [records])

  if (!records.length) return <p className="memory-view-empty">这个筛选下还没有记忆。</p>

  return <>
    {view === 'stars' && <div className="memory-sky-wrap">
      <div className="memory-sky">
        <div className="memory-sky-dust" aria-hidden="true"/>
        {stars.map(star => <button type="button" key={star.record.id}
          className={'memory-star' + (star.record.lifecycle === 'candidate' ? ' is-candidate' : '')}
          style={{ left: star.left + '%', top: star.top + '%', color: star.color, animationDelay: star.delay + 's' }}
          onClick={() => setDetail(star.record)}
          title={star.record.title}
          aria-label={'记忆：' + star.record.title}>
          <StarShape size={star.size}/>
        </button>)}
        <div className="memory-legend">
          {LEGEND.map(category => <span key={category}><i style={{ background: categoryColor(category) }}/>{category}</span>)}
        </div>
        {records.length > stars.length && <span className="memory-sky-more">还有 {records.length - stars.length} 条未展示</span>}
      </div>
    </div>}

    {view === 'garden' && <div className="memory-garden-wrap">
      <div className="memory-garden">
        {flowers.map(flower => <button type="button" key={flower.record.id} className="memory-flower"
          onClick={() => setDetail(flower.record)} title={flower.record.title} aria-label={'记忆：' + flower.record.title}>
          <span className="memory-flower-art" style={{ transform: `rotate(${flower.rotate}deg)`, animationDelay: flower.delay + 's' }}>
            <FlowerShape color={flower.color} petals={flower.petals} size={flower.size}/>
          </span>
          <span className="memory-flower-label">{flower.record.title}</span>
        </button>)}
        {records.length > flowers.length && <span className="memory-garden-more">还有 {records.length - flowers.length} 条未开花</span>}
      </div>
    </div>}

    {view === 'diary' && <div className="memory-diary">
      {days.map(group => <section className="memory-diary-day" key={group.day}>
        <header><b>{formatDay(group.day)}</b><small>{group.records.length} 条</small></header>
        {group.records.map(record => <button type="button" className={'memory-diary-entry lifecycle-' + record.lifecycle} key={record.id}
          onClick={() => setDetail(record)}>
          <i aria-hidden="true"/>
          <span><b>{record.title}</b><small>{record.content.replace(/\s+/g, ' ').slice(0, 64)}</small></span>
          <em>{LIFECYCLE_LABEL[record.lifecycle]}</em>
        </button>)}
      </section>)}
    </div>}

    {detail && <MemoryRecordSheet record={detail} onClose={() => setDetail(null)} onTransition={onTransition}/>}
  </>
}

export { MEMORY_VIEWS, normalizeMemoryView }
