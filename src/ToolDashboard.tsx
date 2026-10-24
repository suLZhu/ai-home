import { useCallback, useEffect, useState } from 'react'
import './ToolDashboard.css'
import {
  useAgentRuns, useAgentRunDetail, startRun, cancelRun, subscribeAgentEvents,
  RUN_STATUS_LABEL, RUN_SOURCE_LABEL, isRunActive, type AgentRun,
} from './agentRuns'

type ToolLogStatus = 'queued' | 'awaiting_confirmation' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
type ToolLog = {
  id: string; person: string; source: string; toolName: string
  serverName?: string; runId?: string | null; conversationId?: string | null; messageId?: string | null
  errorCode?: string | null
  arguments: unknown; resultSummary: unknown; status: ToolLogStatus
  errorMessage?: string | null; durationMs?: number | null
  startedAt: string; finishedAt?: string | null
}

const SOURCE_LABEL: Record<string, string> = { mcp: 'MCP', worldbook: '世界书', ledger: '记账' }
const STATUS_LABEL: Record<ToolLogStatus, string> = {
  queued: '排队中', awaiting_confirmation: '等待确认', running: '执行中',
  succeeded: '成功', failed: '失败', cancelled: '已取消', timed_out: '已超时',
}
const ACTIVE_STATUSES: ToolLogStatus[] = ['queued', 'awaiting_confirmation', 'running']
// 状态筛选值同时接受旧写法（success/error），由后端归一化。
const STATUS_FILTERS = [
  { key: '全部', text: '全部状态' },
  { key: 'running', text: '执行中' },
  { key: 'succeeded', text: '成功' },
  { key: 'failed', text: '失败' },
  { key: 'timed_out', text: '超时' },
]

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
function formatDuration(ms?: number | null, status?: string): string {
  if (status && ACTIVE_STATUSES.includes(status as ToolLogStatus)) return '进行中'
  if (ms == null || !Number.isFinite(ms)) return '—'
  return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'
}
function brief(value: unknown, max = 90): string {
  let text = ''
  try { text = typeof value === 'string' ? value : JSON.stringify(value ?? '') } catch { text = String(value) }
  if (!text) text = '（空）'
  return text.length > max ? text.slice(0, max) + '…' : text
}

// 工作区看板：按助手隔离——只看这位助手的调用记录，人物筛选不开放。
export function ToolDashboard({ person, personLabel }: { person: string; personLabel?: string }) {
  const [logs, setLogs] = useState<ToolLog[]>([])
  const [source, setSource] = useState('全部')
  const [status, setStatus] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [auto, setAuto] = useState(true)
  const [today, setToday] = useState(() => new Date().toLocaleDateString('en-CA'))
  // Agent 运行区：由服务端 Runner 执行的后台任务（与聊天里前端直发的工具调用并列展示）。
  const { runs, error: runsError, refresh: refreshRuns } = useAgentRuns(person)
  const [runPrompt, setRunPrompt] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(null)

  const refresh = useCallback(async (isAlive: () => boolean = () => true) => {
    // 仅首屏显示骨架（loading 初值 true）；筛选与自动刷新时保留旧列表，
    // 避免每 5 秒整表闪烁，也避免在 effect 中同步 setState。
    const params = new URLSearchParams({ limit: '200', person })
    if (source !== '全部') params.set('source', source)
    if (status !== '全部') params.set('status', status)
    try {
      const response = await fetch('/api/tool-logs?' + params.toString(), { credentials: 'same-origin' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '读取调用记录失败')
      // 过期响应守卫：快速切换筛选时，慢的旧请求不得覆盖新结果。
      if (!isAlive()) return
      setLogs(Array.isArray(data.logs) ? data.logs : [])
      setToday(new Date().toLocaleDateString('en-CA'))
      setError('')
    } catch (e) {
      if (!isAlive()) return
      setError(e instanceof Error ? e.message : '读取调用记录失败')
    } finally { if (isAlive()) setLoading(false) }
  }, [person, source, status])

  useEffect(() => {
    let alive = true
    // 首次拉取推迟到微任务：effect 内不同步触发任何状态更新。
    queueMicrotask(() => { if (alive) void refresh(() => alive) })
    return () => { alive = false }
  }, [refresh])
  useEffect(() => {
    if (!auto) return
    const timer = window.setInterval(() => {
      // Android 后台标签页暂停轮询，回到前台后下一次 tick 自动恢复。
      if (!document.hidden) void refresh()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [auto, refresh])

  // SSE 实时推送：服务端一有工具事件就刷新，比 5 秒轮询先看到状态翻转。
  // 节流 600ms 合并连发事件；订阅失败静默降级回轮询。
  useEffect(() => {
    let timer = 0
    let disposed = false
    try {
      const unsubscribe = subscribeAgentEvents(event => {
        if (disposed || !event.type.startsWith('tool_') && !event.type.startsWith('run_')) return
        if (timer) return
        timer = window.setTimeout(() => {
          timer = 0
          if (disposed || document.hidden) return
          void refresh()
          refreshRuns()
        }, 600)
      })
      return () => { disposed = true; if (timer) window.clearTimeout(timer); unsubscribe() }
    } catch { return () => { disposed = true; if (timer) window.clearTimeout(timer) } }
  }, [refresh, refreshRuns])

  async function handleStartRun() {
    const prompt = runPrompt.trim()
    if (!prompt || starting) return
    setStarting(true)
    setStartError('')
    try {
      await startRun(person, prompt)
      setRunPrompt('')
      refreshRuns()
    } catch (e) { setStartError(e instanceof Error ? e.message : '创建任务失败') }
    finally { setStarting(false) }
  }
  async function handleCancelRun(runId: string) {
    try { await cancelRun(runId); refreshRuns() } catch { /* 已结束则无效果 */ }
  }

  const counts = { active: 0, succeeded: 0, failed: 0, timedOut: 0 }
  for (const log of logs) {
    if (ACTIVE_STATUSES.includes(log.status)) counts.active++
    else if (log.status === 'succeeded') counts.succeeded++
    else if (log.status === 'failed' || log.status === 'cancelled') counts.failed++
    else if (log.status === 'timed_out') counts.timedOut++
  }
  const todayCount = logs.filter(l => String(l.startedAt).slice(0, 10) === today).length

  const chipRow = (label: string, value: string, setValue: (v: string) => void, options: { key: string; text: string }[]) =>
    <div className="tool-dash-chip-row" role="group" aria-label={label}>
      {options.map(option => <button type="button" key={option.key} className={'tool-dash-chip' + (value === option.key ? ' active' : '')} aria-pressed={value === option.key} onClick={() => setValue(option.key)}>{option.text}</button>)}
    </div>

  return <section className="tool-dashboard">
    <header className="tool-dash-heading">
      <div><h3>工具调用看板{personLabel ? ' · ' + personLabel : ''}</h3><p>只记录这位助手真实执行的 MCP、世界书与记账工具调用；模型口头描述不会出现在这里。助手之间互相隔离。</p></div>
      <label className="tool-dash-auto"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/> 自动刷新</label>
    </header>
    <div className="tool-dash-stats">
      <div><small>当前筛选</small><b>{logs.length}</b></div>
      <div className="stat-running"><small>进行中</small><b>{counts.active}</b></div>
      <div className="stat-success"><small>成功</small><b>{counts.succeeded}</b></div>
      <div className="stat-error"><small>失败/取消</small><b>{counts.failed}</b></div>
      <div className="stat-error"><small>超时</small><b>{counts.timedOut}</b></div>
      <div><small>今日调用</small><b>{todayCount}</b></div>
    </div>
    <div className="tool-dash-filters">
      {chipRow('工具类型筛选', source, setSource, [{ key: '全部', text: '全部类型' }, { key: 'mcp', text: 'MCP' }, { key: 'worldbook', text: '世界书' }, { key: 'ledger', text: '记账' }])}
      {chipRow('状态筛选', status, setStatus, STATUS_FILTERS)}
    </div>

    {/* ── Agent 运行：服务端 Runner 执行的后台任务 ── */}
    <section className="tool-dash-runs" aria-label="Agent 运行任务">
      <header className="tool-dash-runs-head">
        <div><b>Agent 运行</b><small>任务由服务端 Runner 执行（最多 5 轮工具循环），关掉页面也会继续跑完。</small></div>
      </header>
      <div className="tool-dash-run-input">
        <textarea
          value={runPrompt}
          onChange={e => setRunPrompt(e.target.value)}
          placeholder={'给当前助手布置一个任务，例如：\n看看这个月的记账，把咖啡相关的支出汇总告诉我'}
          rows={2}
          maxLength={20000}
          aria-label="任务内容"
        />
        <button type="button" className="tool-dash-run-start" disabled={starting || !runPrompt.trim()} onClick={() => void handleStartRun()}>
          {starting ? '提交中…' : '开始运行'}
        </button>
      </div>
      {startError && <p className="tool-dash-error" role="alert">{startError}</p>}
      {runsError && <p className="tool-dash-error" role="alert">{runsError}</p>}
      {runs.length === 0
        ? <p className="tool-dash-note">还没有运行记录。在上面输入任务即可让当前助手在服务端执行。</p>
        : <ul className="tool-dash-run-list">{runs.map(run => <RunCard key={run.id} run={run} personLabel={personLabel} open={openRun === run.id}
            onToggle={() => setOpenRun(old => old === run.id ? null : run.id)}
            onCancel={() => void handleCancelRun(run.id)} />)}</ul>}
    </section>
    {error && <p className="tool-dash-error" role="alert" aria-live="polite">{error}</p>}
    {loading ? <div className="tool-dash-skeletons" aria-label="正在读取调用记录"><div className="tool-dash-skeleton"><i/><i/><i/></div><div className="tool-dash-skeleton"><i/><i/><i/></div><div className="tool-dash-skeleton"><i/><i/><i/></div></div>
      : logs.length === 0 ? <div className="tool-dash-empty"><span>⚡</span><b>还没有符合条件的调用记录</b><small>在聊天中让助手使用 MCP、世界书或记账工具后，这里会出现真实的执行记录。</small></div>
      : <ul className="tool-dash-list">{logs.map(log => {
        const open = expanded.includes(log.id)
        // CSS 只有 running/success/error 三组配色，新状态归并到最近的一组。
        const cssStatus = ACTIVE_STATUSES.includes(log.status) ? 'running' : log.status === 'succeeded' ? 'success' : 'error'
        const isActive = ACTIVE_STATUSES.includes(log.status)
        return <li className={'tool-dash-item status-' + cssStatus} key={log.id}>
          <div className="tool-dash-item-top">
            <span className={'tool-dash-badge ' + cssStatus}>{STATUS_LABEL[log.status] || log.status}</span>
            <b className="tool-dash-person">{personLabel || log.person}</b>
            <span className="tool-dash-source">{SOURCE_LABEL[log.source] || log.source}</span>
            <code className="tool-dash-name" title={log.serverName ? log.serverName + ' / ' + log.toolName : log.toolName}>{log.serverName ? log.serverName + ' / ' + log.toolName : log.toolName}</code>
          </div>
          <div className="tool-dash-item-meta">
            <span>{formatTime(log.startedAt)}</span>
            <span>{formatDuration(log.durationMs, log.status)}</span>
            {log.errorCode && <span className="tool-dash-error-code">{log.errorCode}</span>}
          </div>
          <p className="tool-dash-args">参数：{brief(log.arguments)}</p>
          {!isActive && <p className={'tool-dash-result' + (log.status === 'failed' || log.status === 'timed_out' ? ' is-error' : '')}>结果：{log.errorMessage ? log.errorMessage : brief(log.resultSummary)}</p>}
          <button type="button" className="tool-dash-expand" aria-expanded={open} onClick={() => setExpanded(old => open ? old.filter(x => x !== log.id) : [...old, log.id])}>{open ? '收起详情 ↑' : '展开详情 ↓'}</button>
          {open && <pre className="tool-dash-detail">{JSON.stringify({ 参数: log.arguments, 结果: log.resultSummary, ...(log.errorMessage ? { 错误: log.errorMessage } : {}), ...(log.errorCode ? { 错误码: log.errorCode } : {}), 服务: log.serverName || '—', 会话: log.conversationId || '—', 开始时间: log.startedAt, 结束时间: log.finishedAt || '—' }, null, 2)}</pre>}
        </li>
      })}</ul>}
    <p className="tool-dash-note">记录保存在私人云服务器 SQLite 中；参数与结果已自动脱敏（API Key、Token、Cookie 等会被掩码）。超过 10 分钟未完成的记录会自动标记为失败。</p>
  </section>
}

// 单个 Agent 运行卡片：状态、轮次、工具数、答案；展开后显示工具时间线。
function RunCard({ run, personLabel, open, onToggle, onCancel }: {
  run: AgentRun; personLabel?: string; open: boolean; onToggle: () => void; onCancel: () => void
}) {
  const { logs, loading } = useAgentRunDetail(open ? run.id : null)
  const active = isRunActive(run.status)
  const cssStatus = active ? 'running' : run.status === 'succeeded' ? 'success' : 'error'
  const usage = run.usage || {}
  return <li className={'tool-dash-item status-' + cssStatus + ' tool-run-card'}>
    <div className="tool-dash-item-top">
      <span className={'tool-dash-badge ' + cssStatus}>{RUN_STATUS_LABEL[run.status] || run.status}</span>
      <b className="tool-dash-person">{personLabel || run.assistantId}</b>
      <span className="tool-dash-source">{RUN_SOURCE_LABEL[run.source] || run.source}</span>
      <span className="tool-dash-run-rounds">第 {run.rounds} 轮 · {run.toolCalls} 次工具</span>
      {active && <button type="button" className="tool-dash-run-cancel" onClick={onCancel}>取消</button>}
    </div>
    <p className="tool-dash-args">任务：{run.prompt}</p>
    {run.status === 'failed' && run.errorMessage && <p className="tool-dash-result is-error">{run.errorCode ? `[${run.errorCode}] ` : ''}{run.errorMessage}</p>}
    {run.status === 'succeeded' && run.answer && <p className="tool-dash-result">回答：{run.answer}</p>}
    <div className="tool-dash-item-meta">
      <span>{formatTime(run.createdAt)}</span>
      {run.model && <span>{run.model}</span>}
      {usage.calls ? <span>{usage.promptTokens || 0}+{usage.completionTokens || 0} tokens</span> : null}
      {run.finishedAt && <span>耗时 {formatDuration(Date.parse(run.finishedAt) - Date.parse(run.createdAt))}</span>}
    </div>
    <button type="button" className="tool-dash-expand" aria-expanded={open} onClick={onToggle}>{open ? '收起详情 ↑' : '展开详情 ↓'}</button>
    {open && <div className="tool-dash-run-detail">
      {loading && <p className="tool-dash-note">正在读取工具时间线…</p>}
      {!loading && logs.length === 0 && <p className="tool-dash-note">这次运行没有调用工具（模型直接回答）。</p>}
      {logs.length > 0 && <ol className="tool-dash-run-timeline">{logs.slice().reverse().map(log =>
        <li key={log.id} className={'is-' + (ACTIVE_STATUSES.includes(log.status) ? 'running' : log.status === 'succeeded' ? 'success' : 'error')}>
          <span className="tool-dash-badge running" data-status={log.status}>{STATUS_LABEL[log.status as ToolLogStatus] || log.status}</span>
          <code>{log.serverName ? log.serverName + ' / ' + log.toolName : log.toolName}</code>
          <span className="tool-dash-run-timeline-meta">{formatDuration(log.durationMs, log.status)}</span>
          <p className="tool-dash-args">参数：{brief(log.arguments)}</p>
          {!ACTIVE_STATUSES.includes(log.status) && <p className={'tool-dash-result' + (log.status === 'failed' || log.status === 'timed_out' ? ' is-error' : '')}>{log.errorMessage || brief(log.resultSummary)}</p>}
        </li>)}</ol>}
    </div>}
  </li>
}
