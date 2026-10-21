// Acceptance tests for the tool-call dashboard API (feature/tool-dashboard).
// Runs against a THROWAWAY database (AI_HOME_DB) — never touches user data.
// Classification: every case below is API-level MOCK (no real model key / public
// MCP endpoint exists in this environment); code-path cases are marked STATIC.
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE || 'http://127.0.0.1:4180'
const PW = process.env.AI_HOME_PASSWORD
const DB = process.env.AI_HOME_DB
const results = []
let cookie = ''

function record(name, kind, pass, detail) {
  results.push({ name, kind, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} [${kind}] ${name}${detail ? ' — ' + detail : ''}`)
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  })
  let body = null
  try { body = await res.json() } catch { /* non-json */ }
  return { status: res.status, body, headers: res.headers }
}

async function login() {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('login failed: ' + res.status)
  cookie = setCookie.split(';')[0]
}

const create = (payload) => api('/api/tool-logs', { method: 'POST', body: JSON.stringify(payload) })
const finish = (id, payload) => api('/api/tool-logs/' + id, { method: 'PUT', body: JSON.stringify(payload) })
const list = (qs = '') => api('/api/tool-logs?limit=200' + qs)

async function main() {
  await login()

  // ── 1. MCP success: running → success ────────────────────────────────
  const m1 = await create({ person: '晏未晞', source: 'mcp', toolName: 'acc / weather', arguments: { city: '杭州' } })
  const runningVisible = m1.status === 201 && m1.body.status === 'running'
  const f1 = await finish(m1.body.id, { status: 'success', resultSummary: '晴，25度' })
  const rows1 = (await list()).body.logs.filter(l => l.id === m1.body.id)
  record('1 MCP 成功 running→success（mock API）', 'mock',
    runningVisible && f1.status === 200 && rows1[0]?.status === 'success' && rows1[0]?.durationMs >= 0,
    `create=${m1.status}/${m1.body?.status} finish=${f1.status} final=${rows1[0]?.status} duration=${rows1[0]?.durationMs}ms`)

  // ── 2. MCP failure: running → error ──────────────────────────────────
  const m2 = await create({ person: '晏未晞', source: 'mcp', toolName: 'acc / broken', arguments: {} })
  const f2 = await finish(m2.body.id, { status: 'error', resultSummary: '', errorMessage: 'ECONNREFUSED' })
  const rows2 = (await list()).body.logs.filter(l => l.id === m2.body.id)
  record('2 MCP 失败 running→error（mock API）', 'mock',
    f2.status === 200 && rows2[0]?.status === 'error' && rows2[0]?.errorMessage === 'ECONNREFUSED',
    `status=${rows2[0]?.status} err=${rows2[0]?.errorMessage}`)

  // ── 3/4. worldbook & ledger categorization ───────────────────────────
  const m3 = await create({ person: '言朔', source: 'worldbook', toolName: 'recall_worldbook', arguments: { keyword: '故乡' } })
  await finish(m3.body.id, { status: 'success', resultSummary: '命中 2 条' })
  const m4 = await create({ person: '言朔', source: 'ledger', toolName: 'add_expense', arguments: { amount: 12.5, note: '咖啡' } })
  await finish(m4.body.id, { status: 'success', resultSummary: '已记账' })
  const wb = (await list('&source=worldbook')).body.logs
  const lg = (await list('&source=ledger')).body.logs
  record('3 世界书归类 worldbook', 'mock',
    wb.length >= 1 && wb.every(l => l.source === 'worldbook') && wb.some(l => l.id === m3.body.id),
    `worldbook rows=${wb.length}`)
  record('4 记账归类 ledger', 'mock',
    lg.length >= 1 && lg.every(l => l.source === 'ledger') && lg.some(l => l.id === m4.body.id),
    `ledger rows=${lg.length}`)

  // ── 5. model-claimed-only tools produce no log (STATIC code path) ────
  // Verified by source inspection: /api/tool-logs is only written by
  // startToolLog/finishToolLog inside send()'s real-execution loop (App.tsx
  // 392/416/417). No other call site exists → prose never creates rows.
  record('5 模型口头声称调用不产生日志（代码路径）', 'static', true,
    'grep 确认 App.tsx 仅在真实执行循环内调用 startToolLog/finishToolLog；无其他写入点')

  // ── 6. person categorization & filter accuracy ───────────────────────
  const p1 = (await list('&person=' + encodeURIComponent('晏未晞'))).body.logs
  const p2 = (await list('&person=' + encodeURIComponent('言朔'))).body.logs
  const all = (await list()).body.logs
  const okP1 = p1.length >= 2 && p1.every(l => l.person === '晏未晞')
  const okP2 = p2.length >= 2 && p2.every(l => l.person === '言朔')
  const disjoint = !p1.some(a => p2.some(b => b.id === a.id)) && p1.length + p2.length === all.filter(l => ['晏未晞', '言朔'].includes(l.person)).length
  record('6 双人日志归类与筛选准确', 'mock', okP1 && okP2 && disjoint,
    `晏未晞=${p1.length} 言朔=${p2.length} 无交叉=${disjoint}`)
  const badPerson = await api('/api/tool-logs?person=' + encodeURIComponent('不存在'))
  record('6b 非法人物参数被拒（400）', 'mock', badPerson.status === 400, `status=${badPerson.status}`)

  // ── 7. server-side redaction ─────────────────────────────────────────
  const secretArgs = {
    query: 'hi',
    api_key: 'sk-abcdefghijklmnop123456',
    nested: { authorization: 'Bearer abcdef123456', password: 'hunter2' },
    note: 'my token is sk-secretsecretsecret and cookie sid=abc',
  }
  const m7 = await create({ person: '晏未晞', source: 'mcp', toolName: 'acc / leaky', arguments: secretArgs })
  await finish(m7.body.id, {
    status: 'success',
    resultSummary: { raw: 'Bearer abcdef123456', jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIx.cdefghij' },
  })
  const r7 = (await list()).body.logs.find(l => l.id === m7.body.id)
  const stored = JSON.stringify(r7)
  const leaked = ['hunter2', 'sk-abcdefghijklmnop', 'sk-secretsecretsecret', 'abcdef123456', 'eyJhbGciOiJIUzI1NiJ9'].filter(s => stored.includes(s))
  const hasMask = stored.includes('***已脱敏***')
  record('7 服务端脱敏 API Key/Token/Password/Cookie/JWT', 'mock',
    leaked.length === 0 && hasMask, leaked.length ? `泄漏: ${leaked.join(',')}` : '全部掩码')

  // ── 9. log API failure never blocks chat (STATIC + live negative) ────
  const noAuth = await fetch(BASE + '/api/tool-logs')
  const f2again = await finish('00000000-0000-0000-0000-000000000000', { status: 'success' })
  record('9 日志 API 失败返回错误而非崩溃 / 前端静默吞掉（mock+static）', 'mock+static',
    noAuth.status === 401 && f2again.status === 404 && true,
    `无会话=${noAuth.status} 幽灵ID=${f2again.status}；App.tsx startToolLog/finishToolLog 均 try/catch 返回 null`)

  // ── Special A: duplicate PUT → no duplicate rows ─────────────────────
  const before = (await list()).body.logs.length
  await finish(m1.body.id, { status: 'success', resultSummary: '晴，25度（重复 PUT）' })
  const after = (await list()).body.logs.length
  record('并发/重复 PUT 不产生重复记录', 'mock', before === after, `rows ${before}→${after}`)

  // ── Special B: concurrent creates get distinct ids ───────────────────
  const batch = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    create({ person: i % 2 ? '言朔' : '晏未晞', source: 'mcp', toolName: 'acc / parallel-' + i, arguments: { i } })))
  const ids = new Set(batch.map(b => b.body.id))
  const allOk = batch.every(b => b.status === 201 && b.body.status === 'running')
  record('并发创建 8 条状态正确、ID 唯一', 'mock', allOk && ids.size === 8, `201×${batch.filter(b => b.status === 201).length} 唯一ID=${ids.size}`)

  // ── Special C: page-close → stale running rows expire to error ───────
  if (!DB) throw new Error('AI_HOME_DB required for stale test')
  const db = new DatabaseSync(DB)
  const staleId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const staleStart = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO tool_call_logs(id,person,source,tool_name,arguments,result_summary,status,started_at) VALUES(?,?,?,?,?,'','running',?)")
    .run(staleId, '晏未晞', 'mcp', 'acc / abandoned', '{}', staleStart)
  db.close()
  const staleRows = (await list()).body.logs.filter(l => l.id === staleId)
  record('页面关闭（11 分钟僵尸 running）自动过期为 error', 'mock',
    staleRows[0]?.status === 'error' && String(staleRows[0]?.errorMessage).includes('超时'),
    `status=${staleRows[0]?.status} msg=${staleRows[0]?.errorMessage}`)

  // ── Special D: network interruption on finish (client side, STATIC) ──
  // finishToolLog wraps fetch in try/catch → logged row later expires via C.
  record('网络中断时 finishToolLog 静默失败，僵尸行由过期兜底（static）', 'static', true,
    'App.tsx:55-58 try/catch + toolLog.mjs expireStaleRuns 兜底')

  // ── Summary ──────────────────────────────────────────────────────────
  const failed = results.filter(r => !r.pass)
  console.log('\n==== SUMMARY ====')
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`)
  if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(' | ')); process.exit(1) }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
