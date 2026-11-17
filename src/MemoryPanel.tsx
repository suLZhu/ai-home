// 记忆面板：自动整理策略 + 待整理进度 + 候选/生效记忆的确认。
//
// 把原先埋在「工具调用看板」里的记忆治理搬到助手自己的长期记忆入口，
// 并接上服务端每 5 分钟一次的自动整理：这里只负责展示和手动触发，
// 「要不要整理」由服务端规则决定，避免模型自己决定何时记忆。
import { useEffect, useRef, useState } from 'react'
import './ToolDashboard.css'
import './MemoryPanel.css'
import { isLocalMode } from './apiBase.mjs'
import { SoftSelect } from './SoftSelect'
import { MemoryGovernancePanel } from './MemoryGovernancePanel'
import { saveAutoOrganize, runAutoOrganize, useAutoOrganize, type AutoOrganizeStatus } from './memoryGovernance'
import { localTrigger, pendingStats, readLocalAuto, writeLocalAuto, type LocalAuto } from './memoryLocalOrganize.mjs'
import { readMemoryModels, writeMemoryModels } from './memoryModels.mjs'

const RUN_STATUS_TEXT: Record<string, string> = {
  running: '进行中', succeeded: '已完成', failed: '失败', cancelled: '已取消', timed_out: '超时',
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '还没整理过'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

// 三个阈值是「或」关系：说清楚还差什么，而不是假装要同时满足。
function pendingText(status: AutoOrganizeStatus): string {
  if (!status.enabled) return '自动整理已关闭，仍可手动整理。'
  if (status.runningRunId) return '正在整理，完成后候选会出现在下面。'
  if (status.triggerReason === 'messages' || status.triggerReason === 'chars' || status.triggerReason === 'days') {
    return '已经攒够，等下一次扫描（最多 5 分钟）就会自动整理。'
  }
  if (status.triggerReason === 'no_new_messages') return '还没有新的对话。'
  const parts: string[] = []
  if (status.pendingMessages < status.minMessages) parts.push(`${status.minMessages - status.pendingMessages} 条对话`)
  if (status.pendingChars < status.minChars) parts.push(`${status.minChars - status.pendingChars} 字`)
  if (status.daysSinceLast < status.minDays) parts.push(`${(status.minDays - status.daysSinceLast).toFixed(1)} 天`)
  return parts.length ? `再攒够任意一项就会整理：${parts.join(' / ')}` : '已经攒够，等下一次扫描。'
}

function AutoOrganizeCard({ person }: { person: string }) {
  const { status, error, loading, refresh, apply } = useAutoOrganize(person)
  // edited 为 null 时直接跟随服务端值；用户一动手就切到本地草稿，轮询不会覆盖。
  type AutoDraft = { minMessages: string; minChars: string; minDays: string; autoConfirm: boolean; rules: string }
  const [edited, setEdited] = useState<AutoDraft | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const shown: AutoDraft = edited ?? (status
    ? { minMessages: String(status.minMessages), minChars: String(status.minChars), minDays: String(status.minDays), autoConfirm: status.autoConfirm, rules: status.rules }
    : { minMessages: '', minChars: '', minDays: '', autoConfirm: true, rules: '' })
  const draftValid = [shown.minMessages, shown.minChars, shown.minDays].every(value => Number(value) >= 1)

  async function toggle() {
    if (!status || busy) return
    const next = !status.enabled
    setBusy('toggle')
    setActionError('')
    setNotice('')
    apply({ enabled: next })
    try {
      const saved = await saveAutoOrganize(person, { enabled: next })
      apply({ enabled: saved.enabled })
      setNotice(next ? '已开启自动整理。' : '已关闭自动整理。')
      await refresh()
    } catch (e) {
      apply({ enabled: status.enabled })
      setActionError(e instanceof Error ? e.message : '开关保存失败')
    } finally { setBusy('') }
  }

  async function save() {
    if (!draftValid || busy) return
    setBusy('save')
    setActionError('')
    setNotice('')
    try {
      const saved = await saveAutoOrganize(person, {
        minMessages: Math.round(Number(shown.minMessages)),
        minChars: Math.round(Number(shown.minChars)),
        minDays: Math.round(Number(shown.minDays)),
        autoConfirm: shown.autoConfirm,
        rules: shown.rules,
      })
      apply({ minMessages: saved.minMessages, minChars: saved.minChars, minDays: saved.minDays, autoConfirm: saved.autoConfirm, rules: saved.rules, lastRunAt: saved.lastRunAt })
      setEdited(null)
      setNotice('策略已保存，下一次扫描按新阈值判断。')
      await refresh()
    } catch (e) { setActionError(e instanceof Error ? e.message : '策略保存失败') }
    finally { setBusy('') }
  }

  async function run() {
    if (busy) return
    setBusy('run')
    setActionError('')
    setNotice('')
    try {
      const result = await runAutoOrganize(person)
      setNotice(`已开始整理：${result.messages ?? 0} 条对话、${result.chars ?? 0} 字，完成后候选会出现在下面。`)
      await refresh()
    } catch (e) { setActionError(e instanceof Error ? e.message : '整理启动失败') }
    finally { setBusy('') }
  }

  if (loading && !status) return <section className="memory-auto" aria-label="自动整理"><p className="tool-dash-note">正在读取自动整理状态…</p></section>
  if (!status) return <section className="memory-auto" aria-label="自动整理">
    <p className="tool-dash-error" role="alert">{error || '自动整理状态不可用'}</p>
  </section>

  const last = status.lastRun
  return <section className="memory-auto" aria-label="自动整理">
    <div className="memory-auto-head">
      <div>
        <b>自动整理</b>
        <small>每 5 分钟检查一次：轮数、字数、天数任一满足，就让助手把新对话整理成记忆。</small>
      </div>
      <label className="memory-auto-switch">
        <span className="memory-auto-state">{status.enabled ? '已开启' : '已关闭'}</span>
        <input type="checkbox" checked={status.enabled} disabled={!!busy} onChange={() => void toggle()} aria-label="自动整理开关" />
        <span aria-hidden="true" />
      </label>
    </div>

    {error && <p className="tool-dash-error" role="alert">{error}</p>}
    {actionError && <p className="tool-dash-error" role="alert">{actionError}</p>}
    {notice && <p className="tool-dash-note" role="status">{notice}</p>}

    <div className="memory-auto-fields">
      <label className="memory-auto-field">轮数
        <input type="number" inputMode="numeric" min={2} max={500} value={shown.minMessages} disabled={!!busy}
          onChange={e => setEdited({ ...shown, minMessages: e.target.value })} aria-label="最少对话轮数" />
        <span>攒够 N 条对话</span>
      </label>
      <label className="memory-auto-field">字数
        <input type="number" inputMode="numeric" min={200} max={200000} value={shown.minChars} disabled={!!busy}
          onChange={e => setEdited({ ...shown, minChars: e.target.value })} aria-label="最少字数" />
        <span>攒够 N 个字</span>
      </label>
      <label className="memory-auto-field">天数
        <input type="number" inputMode="numeric" min={1} max={365} value={shown.minDays} disabled={!!busy}
          onChange={e => setEdited({ ...shown, minDays: e.target.value })} aria-label="最少天数" />
        <span>每 N 天至少一次</span>
      </label>
    </div>

    <label className="memory-auto-option">
      <span className="memory-auto-option-text">
        <b>整理后自动生效</b>
        <small>打开后，整理出的记忆直接生效、不再逐条确认；仍可在下面归档或拒绝。</small>
      </span>
      <span className="memory-auto-switch">
        <span className="memory-auto-state">{shown.autoConfirm ? '已开启' : '已关闭'}</span>
        <input type="checkbox" checked={shown.autoConfirm} disabled={!!busy}
          onChange={e => setEdited({ ...shown, autoConfirm: e.target.checked })} aria-label="整理后自动生效" />
        <span aria-hidden="true" />
      </span>
    </label>

    <label className="memory-auto-rules">整理规则（可选）
      <textarea rows={2} maxLength={500} value={shown.rules} disabled={!!busy}
        onChange={e => setEdited({ ...shown, rules: e.target.value })}
        placeholder="例如：只记约定和偏好，不记日常寒暄；提到的人名一定要记。" />
      <span>{shown.rules.length}/500</span>
    </label>

    <div className="memory-auto-status">
      <b>待整理 {status.pendingMessages} 条 · {status.pendingChars} 字</b>
      <small>{pendingText(status)}</small>
      {last && <small>上次整理：{formatWhen(last.finishedAt || status.lastRunAt)} · {RUN_STATUS_TEXT[last.status] || last.status}{last.error ? '（' + last.error + '）' : ''}</small>}
      {!last && <small>还没有自动整理过。</small>}
    </div>

    <div className="memory-auto-actions">
      <button type="button" onClick={() => void save()} disabled={!edited || !draftValid || !!busy}>{busy === 'save' ? '保存中…' : '保存策略'}</button>
      <button type="button" className="memory-auto-run" onClick={() => void run()} disabled={!!busy || !!status.runningRunId}>
        {busy === 'run' ? '启动中…' : status.runningRunId ? '整理中…' : '立即整理'}
      </button>
    </div>
  </section>
}

// 记忆专用模型：整理模型 / 向量模型各一个槽位，和聊天模型解耦。
// 留空分别表示「跟随聊天模型」和「不做向量检索（退回关键词）」。
function MemoryModelCard({ options }: { options: { vendorId: string; model: string; label: string }[] }) {
  const [models, setModels] = useState(() => readMemoryModels())
  const [notice, setNotice] = useState('')
  const encode = (slot: { vendorId: string; model: string }) => (slot.model ? slot.vendorId + '::' + slot.model : '')
  const decode = (value: string) => {
    const [vendorId, model] = String(value || '').split('::')
    return { vendorId: vendorId || '', model: model || '' }
  }
  const picks = options.map(option => ({ value: option.vendorId + '::' + option.model, label: option.label }))
  return <section className="memory-auto memory-models" aria-label="记忆模型">
    <div className="memory-auto-head">
      <div>
        <b>记忆模型</b>
        <small>整理和向量可以各用各的模型，不必跟聊天模型挤在一起。整理留空＝跟随聊天模型；向量留空＝不做语义检索，退回关键词。</small>
      </div>
    </div>
    {notice && <p className="tool-dash-note" role="status">{notice}</p>}
    <div className="memory-auto-fields memory-model-fields">
      <label className="memory-auto-field">整理模型
        <SoftSelect ariaLabel="整理模型" value={encode(models.organize)} onChange={value => setModels(old => ({ ...old, organize: decode(value) }))} options={[{ value: '', label: '跟随聊天模型' }, ...picks]} />
        <span>整理对话、生成记忆条目用</span>
      </label>
    </div>
    <div className="memory-auto-fields memory-model-fields">
      <label className="memory-auto-field">向量模型
        <SoftSelect ariaLabel="向量模型" value={encode(models.embed)} onChange={value => setModels(old => ({ ...old, embed: decode(value) }))} options={[{ value: '', label: '不使用向量' }, ...picks]} />
        <span>写入记忆时算 embedding，聊天召回按相似度排序</span>
      </label>
    </div>
    <div className="memory-auto-actions">
      <button type="button" onClick={() => { writeMemoryModels(models); setNotice('记忆模型已保存。') }}>保存模型设置</button>
    </div>
    <p className="tool-dash-note">向量模型要供应商提供 OpenAI 兼容的 <code>/v1/embeddings</code>，并且先在该供应商的「模型」里加上它（例如 text-embedding-3-small）才能选到；不支持的供应商会自动退回关键词匹配，记忆本身照常保存。</p>
  </section>
}

// 本地模式的自动整理：没有服务器，就在这台设备上用当前模型跑一次。
// 交互和服务器版保持一致（阈值 / 自动生效 / 规则 / 立即整理），只是调度换成「打开面板时触发」。
function LocalAutoCard({ personMessages, onRun }: {
  personMessages: unknown[]
  onRun?: (cfg: LocalAuto) => Promise<{ created: number; scanned: number; duplicate: number }>
}) {
  const [cfg, setCfg] = useState<LocalAuto>(() => readLocalAuto())
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const autoRan = useRef(false)
  const stats = pendingStats(personMessages, cfg.lastRunAt)
  const trigger = localTrigger(cfg, stats)
  const patch = (next: Partial<LocalAuto>) => setCfg(old => ({ ...old, ...next }))

  async function run(current: LocalAuto) {
    if (!onRun || busy) return
    setBusy('run'); setError(''); setNotice('')
    try {
      const result = await onRun(current)
      setCfg(readLocalAuto())
      setNotice(result.scanned === 0
        ? '上次整理之后没有新的对话。'
        : `看了 ${result.scanned} 条对话，新增 ${result.created} 条记忆${result.duplicate ? `（${result.duplicate} 条重复已跳过）` : ''}。`)
    } catch (e) { setError(e instanceof Error ? e.message : '整理失败') }
    finally { setBusy('') }
  }

  // 打开面板时如果已经攒够，就自动跑一次；每个挂载周期只跑一次，避免反复请求模型。
  useEffect(() => {
    if (autoRan.current || !onRun || busy) return
    if (trigger === 'messages' || trigger === 'chars' || trigger === 'days') {
      autoRan.current = true
      void run(cfg)
    }
  }, [trigger])

  const pending = trigger === 'disabled' ? '自动整理已关闭，仍可手动整理。'
    : busy === 'run' ? '正在整理，稍等…'
    : trigger === 'no_new_messages' ? '上次整理之后还没有新对话。'
    : trigger === 'messages' || trigger === 'chars' || trigger === 'days' ? '已经攒够，打开记忆面板会自动整理；也可以点「立即整理」。'
    : `再攒够任意一项就会整理：${Math.max(0, cfg.minMessages - stats.pendingMessages)} 条对话 / ${Math.max(0, cfg.minChars - stats.pendingChars)} 字 / ${Math.max(0, cfg.minDays - stats.daysSinceLast).toFixed(1)} 天`

  return <section className="memory-auto" aria-label="自动整理">
    <div className="memory-auto-head">
      <div>
        <b>自动整理</b>
        <small>本地模式：打开记忆面板且攒够条件时，用当前模型把新对话整理成记忆。只在本机执行，不上传。</small>
      </div>
      <label className="memory-auto-switch">
        <span className="memory-auto-state">{cfg.enabled ? '已开启' : '已关闭'}</span>
        <input type="checkbox" checked={cfg.enabled} onChange={() => patch({ enabled: !cfg.enabled })} aria-label="自动整理开关" />
        <span aria-hidden="true" />
      </label>
    </div>

    {error && <p className="tool-dash-error" role="alert">{error}</p>}
    {notice && <p className="tool-dash-note" role="status">{notice}</p>}

    <div className="memory-auto-fields">
      <label className="memory-auto-field">轮数
        <input type="number" inputMode="numeric" min={2} max={500} value={cfg.minMessages}
          onChange={e => patch({ minMessages: Math.round(Number(e.target.value)) || 0 })} aria-label="最少对话轮数" />
        <span>攒够 N 条对话</span>
      </label>
      <label className="memory-auto-field">字数
        <input type="number" inputMode="numeric" min={100} max={200000} value={cfg.minChars}
          onChange={e => patch({ minChars: Math.round(Number(e.target.value)) || 0 })} aria-label="最少字数" />
        <span>攒够 N 个字</span>
      </label>
      <label className="memory-auto-field">天数
        <input type="number" inputMode="numeric" min={1} max={365} value={cfg.minDays}
          onChange={e => patch({ minDays: Math.round(Number(e.target.value)) || 0 })} aria-label="最少天数" />
        <span>每 N 天至少一次</span>
      </label>
    </div>

    <label className="memory-auto-option">
      <span className="memory-auto-option-text">
        <b>整理后自动生效</b>
        <small>打开后整理出的记忆直接生效；关掉则先进候选区，由你逐条确认。</small>
      </span>
      <span className="memory-auto-switch">
        <span className="memory-auto-state">{cfg.autoConfirm ? '已开启' : '已关闭'}</span>
        <input type="checkbox" checked={cfg.autoConfirm} onChange={() => patch({ autoConfirm: !cfg.autoConfirm })} aria-label="整理后自动生效" />
        <span aria-hidden="true" />
      </span>
    </label>

    <label className="memory-auto-rules">整理规则（可选）
      <textarea rows={2} maxLength={500} value={cfg.rules} onChange={e => patch({ rules: e.target.value })}
        placeholder="例如：只记约定和偏好，不记日常寒暄；提到的人名一定要记。" />
      <span>{cfg.rules.length}/500</span>
    </label>

    <div className="memory-auto-status">
      <b>待整理 {stats.pendingMessages} 条 · {stats.pendingChars} 字</b>
      <small>{pending}</small>
      {cfg.lastRun?.finishedAt
        ? <small>上次整理：{formatWhen(cfg.lastRun.finishedAt)}{cfg.lastRun.error ? '（' + cfg.lastRun.error + '）' : cfg.lastRun.created != null ? ` · 新增 ${cfg.lastRun.created} 条` : ''}</small>
        : <small>还没有整理过。</small>}
    </div>

    <div className="memory-auto-actions">
      <button type="button" onClick={() => { writeLocalAuto(cfg); setCfg(readLocalAuto()); setNotice('策略已保存。') }}>{busy === 'save' ? '保存中…' : '保存策略'}</button>
      <button type="button" className="memory-auto-run" onClick={() => void run(cfg)} disabled={!!busy || !onRun}>
        {busy === 'run' ? '整理中…' : '立即整理'}
      </button>
    </div>
  </section>
}

export function MemoryPanel({ person, personLabel, onJumpToSource, personMessages, modelOptions, onRunOrganize, onTidyMemories }: {
  person: string
  personLabel?: string
  onJumpToSource?: (conversationId: string, messageId?: string) => void
  personMessages?: unknown[]
  modelOptions?: { vendorId: string; model: string; label: string }[]
  onRunOrganize?: (cfg: LocalAuto) => Promise<{ created: number; scanned: number; duplicate: number }>
  onTidyMemories?: (records: unknown[]) => Promise<{ created: number; archived: number; scanned: number }>
}) {
  return <div className="memory-panel">
    <header className="memory-panel-head">
      <h3>{personLabel ? personLabel + ' 的记忆' : '记忆面板'}</h3>
      <p>助手记下来的事默认先进候选区；打开「整理后自动生效」后会直接进入记忆库。你随时可以归档或拒绝，拒绝过的内容会留下墓碑，不会再被重复提议。</p>
    </header>
    {isLocalMode() && !!modelOptions?.length && <MemoryModelCard options={modelOptions} />}
    {isLocalMode()
      ? <LocalAutoCard personMessages={personMessages || []} onRun={onRunOrganize} />
      : <AutoOrganizeCard person={person} />}
    <MemoryGovernancePanel person={person} onJumpToSource={onJumpToSource} onTidy={onTidyMemories} />
  </div>
}
