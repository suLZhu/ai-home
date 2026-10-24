// Local Fake MCP server for automated tests and manual demos.
//
// Six deterministic tools covering every behaviour the agent loop must handle:
//   echo              — trivial success
//   delayed_success   — read tool that is slow but succeeds (retry/timeout path)
//   always_fail       — always throws (failure -> role=tool feedback)
//   write_once        — write tool; second call with same key is a no-op (idempotency)
//   requires_approval — write tool meant to run under policy=ask
//   large_result      — returns a big payload (truncation / redaction path)
//
// It is an IN-PROCESS fake: tests inject `list`/`call` into the runner context,
// so no port, no TLS and no network flakiness. server.mjs never loads this
// module in production — the real MCP transport stays the only path there.
import { randomUUID } from 'node:crypto'

export const FAKE_MCP_TOOLS = [
  { name: 'echo', description: '原样回显输入文本', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'delayed_success', description: '延迟 delayMs 毫秒后成功返回（模拟慢读工具）', inputSchema: { type: 'object', properties: { delayMs: { type: 'integer' }, text: { type: 'string' } } } },
  { name: 'always_fail', description: '总是失败（模拟不可用的远端工具）', inputSchema: { type: 'object', properties: { reason: { type: 'string' } } } },
  { name: 'write_once', description: '按 key 幂等写入；相同 key 第二次调用不重复执行', inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key'] } },
  { name: 'requires_approval', description: '写操作，适合用来验证 ask 审批流', inputSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] } },
  { name: 'large_result', description: '返回约 bytes 字节的大结果（验证截断）', inputSchema: { type: 'object', properties: { bytes: { type: 'integer' } } } },
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Creates a fresh fake server instance. State (write_once keys, call journal)
// is per-instance so tests never leak into each other.
export function createFakeMcpServer() {
  const writes = new Map() // key -> value
  const calls = []        // journal: { tool, args, at }

  async function call(name, args = {}) {
    const entry = { tool: name, args, at: new Date().toISOString(), id: randomUUID() }
    calls.push(entry)
    switch (name) {
      case 'echo':
        return { echoed: String(args.text || ''), callId: entry.id }
      case 'delayed_success': {
        const delayMs = Math.min(2000, Math.max(0, Number(args.delayMs) || 200))
        await sleep(delayMs)
        return { ok: true, waitedMs: delayMs, text: String(args.text || 'done'), callId: entry.id }
      }
      case 'always_fail':
        throw Object.assign(new Error(String(args.reason || 'fake MCP 工具故意失败')), { code: 'FAKE_FAIL' })
      case 'write_once': {
        const key = String(args.key || '').trim()
        if (!key) throw Object.assign(new Error('缺少 key'), { status: 400 })
        if (writes.has(key)) return { ok: true, duplicate: true, key, callId: entry.id }
        writes.set(key, String(args.value ?? ''))
        return { ok: true, duplicate: false, key, callId: entry.id }
      }
      case 'requires_approval':
        return { ok: true, action: String(args.action || ''), callId: entry.id }
      case 'large_result': {
        const bytes = Math.min(64 * 1024, Math.max(16, Number(args.bytes) || 4096))
        return { payload: 'x'.repeat(bytes), bytes, callId: entry.id }
      }
      default:
        throw Object.assign(new Error('fake MCP 未知工具：' + name), { status: 404 })
    }
  }

  return {
    serverName: 'fake-mcp',
    calls,
    writes,
    // Shape expected by createToolRegistry's mcpList(row)
    list: async () => FAKE_MCP_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    // Shape expected by createToolRegistry's mcpCall(row, name, args)
    call,
  }
}

// Convenience: bind a fake server to one connection row so the registry sees
// it exactly like a real MCP connection (namespacing, policy, logging).
export function fakeMcpConnection(db, person, fake) {
  const id = 'fmcp' + randomUUID().slice(0, 8)
  db.prepare('INSERT INTO mcp_connections (id,person,name,url,transport,enabled,token_enc,updated_at) VALUES (?,?,?,?,?,1,?,?)')
    .run(id, person, fake.serverName, 'https://fake-mcp.invalid/mcp', 'streamablehttp', '', new Date().toISOString())
  return { row: db.prepare('SELECT * FROM mcp_connections WHERE id=?').get(id), id }
}
