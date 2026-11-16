// 模型请求诊断（黑匣子）验收：只旁路观察、不改请求、不记凭证、异常不阻断聊天。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAG_STORAGE_KEY, MAX_DIAG_LOGS,
  redactDataUrl, redactPayload, sanitizeMessage, sanitizeMessages,
  summarizeMessages, extractParameters, extractTools,
  buildDiagSnapshot, appendDiagLog, loadDiagLogs, saveDiagLogs, formatDiagSummary,
} from '../src/requestDiag.mjs'

// ───────────────────────── 测试数据 ─────────────────────────

const A = 'assistant-001'
const B = 'assistant-002'

function requestBody(extra = {}) {
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: '你是小月，说话温柔。' },
      { role: 'user', content: '晚上好' },
      { role: 'assistant', content: '晚上好呀，今天过得怎么样？' },
      { role: 'user', content: '还不错' },
    ],
    stream: true,
    stream_options: { include_usage: true },
    ...extra,
  }
}

function snapshotOf(input = {}) {
  return buildDiagSnapshot({
    requestBody: requestBody(),
    assistantId: A, conversationId: 'conv-1',
    trigger: 'normal', round: 1,
    provider: 'openai-compatible', endpoint: 'https://api.example.com/v1/chat/completions?token=SECRET',
    requestChars: 1234,
    memoryNote: '角色设定+补充提示+长期记忆+记忆库召回+世界书 均拼进首条 system',
    ...input,
  })
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    _map: map,
  }
}

// ───────────────────────── 1. 正常发送产生快照 ─────────────────────────

test('正常发送一次 → 产生一条完整快照（时间/助手/会话/触发/模型/endpoint/消息/参数）', () => {
  const s = snapshotOf()
  assert.ok(s.id.startsWith('diag-'), '有诊断 id')
  assert.ok(!Number.isNaN(Date.parse(s.at)), 'at 是合法 ISO 时间')
  assert.equal(s.assistantId, A)
  assert.equal(s.conversationId, 'conv-1')
  assert.equal(s.trigger, 'normal')
  assert.equal(s.round, 1)
  assert.equal(s.provider, 'openai-compatible')
  assert.equal(s.model, 'gpt-4o-mini')
  assert.equal(s.messagesTotal, 4)
  assert.deepEqual(s.roles, { system: 1, user: 2, assistant: 1 })
  assert.equal(s.requestChars, 1234)
  assert.equal(s.stream, true)
  assert.ok(Array.isArray(s.messages) && s.messages.length === 4, '保留全部消息')
  assert.ok(Array.isArray(s.serverInjects) && s.serverInjects.length === 1, '标注服务端时间注入')
  assert.ok(s.memoryNote, '有 memory 注入说明')
})

// ───────────────────────── 2. 重新生成 / 续轮触发类型 ─────────────────────────

test('重新生成与工具续轮 → trigger/round 如实标记', () => {
  const regen = snapshotOf({ trigger: 'regenerate' })
  assert.equal(regen.trigger, 'regenerate')
  const follow = snapshotOf({ trigger: 'follow-up', round: 2 })
  assert.equal(follow.trigger, 'follow-up')
  assert.equal(follow.round, 2)
})

// ───────────────────────── 3. 不修改原始 payload ─────────────────────────

test('buildDiagSnapshot 不修改原 requestBody（深比较）', () => {
  const body = requestBody({ temperature: 0.6 })
  const before = JSON.stringify(body)
  buildDiagSnapshot({ requestBody: body, assistantId: A, conversationId: 'conv-1' })
  assert.equal(JSON.stringify(body), before, '原对象序列化后完全一致')
})

// ───────────────────────── 4. 敏感字段过滤 ─────────────────────────

test('endpoint 的 query 被隐藏；payload 里 api_key/authorization/cookie/token 变 [REDACTED]', () => {
  const s = snapshotOf({ endpoint: 'https://api.example.com/v1/chat/completions?api_key=sk-12345&x=1' })
  assert.ok(!s.endpoint.includes('sk-12345'), 'endpoint 不含 query 密钥')
  assert.ok(s.endpoint.startsWith('https://api.example.com'), '保留 origin')

  const dirty = redactPayload({ api_key: 'sk-abc', Authorization: 'Bearer xyz', Cookie: 'sid=1', nested: { access_token: 'tok', safe: 'ok' }, stream: true })
  assert.equal(dirty.api_key, '[REDACTED]')
  assert.equal(dirty.Authorization, '[REDACTED]')
  assert.equal(dirty.Cookie, '[REDACTED]')
  assert.equal(dirty.nested.access_token, '[REDACTED]')
  assert.equal(dirty.nested.safe, 'ok', '非敏感字段保留')
  assert.equal(dirty.stream, true)

  // 快照 raw 里也不含任何原始密钥串
  const rawText = JSON.stringify(s.raw)
  assert.ok(!/sk-12345/.test(rawText), 'raw 不含 endpoint 密钥')
})

// ───────────────────────── 5. 图片 Base64 省略 ─────────────────────────

test('多模态图片 data URL → [image data omitted: N KB]，不再是大块 Base64', () => {
  const bigBase64 = 'A'.repeat(4 * 1024 * 3) // ≈12KB 图片
  const m = sanitizeMessage({
    role: 'user',
    content: [
      { type: 'text', text: '看这张图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + bigBase64 } },
    ],
  })
  const part = m.content[1]
  assert.equal(part.type, 'image_url')
  assert.match(part.image_url.url, /^\[image data omitted: [\d.]+ (KB|MB|B); image\/png\]$/, '占位而非 Base64')
  assert.ok(!part.image_url.url.includes('AAAA'), '不含原始 Base64')

  // 非 data URL 的普通图片地址原样保留
  assert.equal(redactDataUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
})

// ───────────────────────── 6. 环形保留上限 ─────────────────────────

test('appendDiagLog 只保留最近 MAX_DIAG_LOGS 条，最新在最前', () => {
  let list = []
  for (let i = 1; i <= MAX_DIAG_LOGS + 5; i++) {
    list = appendDiagLog(list, snapshotOf({ conversationId: 'conv-' + i }))
  }
  assert.equal(list.length, MAX_DIAG_LOGS, '不超过上限')
  assert.equal(list[0].conversationId, 'conv-' + (MAX_DIAG_LOGS + 5), '最新在最前')
  assert.equal(list[list.length - 1].conversationId, 'conv-6', '最旧的被挤出')
})

// ───────────────────────── 7. 清空 / 持久化 ─────────────────────────

test('saveDiagLogs/loadDiagLogs 落盘读取；清空（存空数组）后读回为空', () => {
  const storage = memoryStorage()
  // 用 appendDiagLog 组装（真实链路同款：新记录 unshift 到最前）
  let logs = appendDiagLog([], snapshotOf({ conversationId: 'conv-1' }))
  logs = appendDiagLog(logs, snapshotOf({ conversationId: 'conv-2' }))
  saveDiagLogs(storage, logs)
  assert.ok(storage._map.has(DIAG_STORAGE_KEY), '写入独立诊断键')
  const back = loadDiagLogs(storage)
  assert.equal(back.length, 2)
  assert.equal(back[0].conversationId, 'conv-2', '保持最新在前')

  saveDiagLogs(storage, [])
  assert.deepEqual(loadDiagLogs(storage), [], '清空后为空数组')
})

// ───────────────────────── 8. 不进云端快照 ─────────────────────────

test('诊断数据只写 DIAG_STORAGE_KEY，不影响其他存储键（模拟 /api/state 快照源）', () => {
  const storage = memoryStorage({ 'ai-home.conversations': '{"version":2}' })
  saveDiagLogs(storage, [snapshotOf()])
  assert.equal(storage.getItem('ai-home.conversations'), '{"version":2}', '其他键原封不动')
  assert.equal(storage._map.size, 2, '只新增了诊断键')
  // getSnapshot 的键列表（version/conversations/messages/...）里没有任何 diag 键
  assert.ok(!DIAG_STORAGE_KEY.startsWith('ai-home.messages'))
  assert.ok(!DIAG_STORAGE_KEY.startsWith('ai-home.conversations'))
})

// ───────────────────────── 9/10. 多助手 / 多会话归属 ─────────────────────────

test('多助手、多会话：assistantId 与 conversationId 各归各位', () => {
  const s1 = snapshotOf({ assistantId: A, conversationId: 'conv-a' })
  const s2 = snapshotOf({ assistantId: B, conversationId: 'conv-b' })
  assert.equal(s1.assistantId, A)
  assert.equal(s1.conversationId, 'conv-a')
  assert.equal(s2.assistantId, B)
  assert.equal(s2.conversationId, 'conv-b')
})

// ───────────────────────── 11. 消息顺序保留 ─────────────────────────

test('messages 保持真实发送顺序（system→user→assistant→user）', () => {
  const s = snapshotOf()
  assert.deepEqual(s.messages.map(m => m.role), ['system', 'user', 'assistant', 'user'])
})

// ───────────────────────── 12. 未设置参数不伪造默认值 ─────────────────────────

test('未发送的采样参数不出现（不伪造 0.8 等默认值）；发送的参数原样记录', () => {
  const withTemp = extractParameters({ model: 'm', stream: true, temperature: 0.6 })
  assert.equal(withTemp.temperature, 0.6)
  const without = extractParameters({ model: 'm', stream: true })
  assert.ok(!('temperature' in without), '未发送 temperature 就没有该键')
  assert.ok(!('top_p' in without))
  assert.ok(!('max_tokens' in without))
  assert.ok(!('reasoning_effort' in without))
  // 实际聊天链路：只发 model/messages/stream/stream_options(+tools)，采样参数全不发
  const real = extractParameters(requestBody())
  assert.ok(!('temperature' in real) && !('top_p' in real), '真实链路无采样参数')
})

// ───────────────────────── 13. 诊断异常不阻断请求 ─────────────────────────

test('存储抛异常时 saveDiagLogs/loadDiagLogs 静默降级（模拟 recordDiagLog 的 try/catch 行为）', () => {
  const broken = {
    getItem: () => { throw new Error('storage broken') },
    setItem: () => { throw new Error('storage broken') },
  }
  assert.deepEqual(loadDiagLogs(broken), [], '读失败返回空数组')
  assert.doesNotThrow(() => saveDiagLogs(broken, [snapshotOf()]), '写失败不抛出')
  // 损坏的 JSON 也不抛出
  const corrupt = memoryStorage({ [DIAG_STORAGE_KEY]: '{not json' })
  assert.deepEqual(loadDiagLogs(corrupt), [], '损坏 JSON 返回空数组')
})

// ───────────────────────── 附：摘要与工具提取 ─────────────────────────

test('formatDiagSummary 输出纯文本摘要（含角色结构/参数/未设置标记），不含完整聊天正文', () => {
  const text = formatDiagSummary(snapshotOf())
  assert.equal(typeof text, 'string')
  assert.match(text, /消息总数：4/)
  assert.match(text, /system×1/)
  assert.match(text, /gpt-4o-mini/)
  assert.ok(!text.includes('晚上好呀，今天过得怎么样？'), '摘要不带完整聊天正文')
})

test('extractTools 提取工具名与数量；无 tools 时为 0', () => {
  const tools = extractTools(requestBody({
    tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }],
    tool_choice: 'auto',
  }))
  assert.equal(tools.count, 1)
  assert.deepEqual(tools.names, ['get_weather'])
  assert.equal(tools.toolChoice, 'auto')
  assert.equal(extractTools(requestBody()).count, 0)
})

test('summarizeMessages 对非数组输入安全返回空统计', () => {
  assert.deepEqual(summarizeMessages(null), { total: 0, roles: {} })
  assert.deepEqual(sanitizeMessages(undefined), [])
})
