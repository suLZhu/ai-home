import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDuration, summarizeTokenUsage, summarizeToolResult, groupToolCalls,
  needsChineseTranslation, buildTranslationMessages,
} from '../src/messagePresentation.mjs'

// ── P1-6 Token 汇总 ──

test('Token 汇总：总数 = 输入 + 输出，默认标签简洁', () => {
  const s = summarizeTokenUsage({ promptTokens: 556, completionTokens: 88 })
  assert.equal(s.total, 644)
  assert.equal(s.label, 'Token 644')
  assert.deepEqual(s.rows, [{ label: '输入', value: 556 }, { label: '输出', value: 88 }])
  assert.equal(s.hasCache, false)
})

test('Token 汇总：有缓存才出现「缓存」行，永不显示「缓存 0」', () => {
  const withCache = summarizeTokenUsage({ promptTokens: 556, completionTokens: 88, cachedTokens: 275 })
  assert.equal(withCache.hasCache, true)
  assert.ok(withCache.rows.some(r => r.label === '缓存' && r.value === 275))
  const noCache = summarizeTokenUsage({ promptTokens: 556, completionTokens: 88, cachedTokens: 0, cacheReadTokens: 0 })
  assert.equal(noCache.hasCache, false)
  assert.ok(!noCache.rows.some(r => r.label === '缓存'))
  const absent = summarizeTokenUsage({ promptTokens: 10, completionTokens: 5 })
  assert.ok(!absent.rows.some(r => r.label === '缓存'))
})

test('Token 汇总：速度 / 耗时按中文标签展开，缓存不会超过输入', () => {
  const s = summarizeTokenUsage({ promptTokens: 100, completionTokens: 20, cacheReadTokens: 999, tokensPerSecond: 6.9, elapsedMs: 12800 })
  assert.equal(s.rows.find(r => r.label === '缓存').value, 100)
  assert.equal(s.rows.find(r => r.label === '速度').value, '6.9 tok/s')
  assert.equal(s.rows.find(r => r.label === '耗时').value, '12.8s')
})

test('Token 汇总：脏数据（NaN/负数/字符串/null）不产生 NaN 或不存在的行', () => {
  const s = summarizeTokenUsage({ promptTokens: 'abc', completionTokens: -5, cachedTokens: NaN, tokensPerSecond: 'x', elapsedMs: null })
  assert.equal(s.total, 0)
  assert.equal(s.label, 'Token 0')
  assert.deepEqual(s.rows, [{ label: '输入', value: 0 }, { label: '输出', value: 0 }])
  assert.equal(summarizeTokenUsage(null).total, 0)
  assert.equal(summarizeTokenUsage(undefined).total, 0)
})

test('formatDuration：毫秒 / 秒 / 非法值', () => {
  assert.equal(formatDuration(820), '820 ms')
  assert.equal(formatDuration(5500), '5.5s')
  assert.equal(formatDuration(12800), '12.8s')
  assert.equal(formatDuration(-1), '—')
  assert.equal(formatDuration('abc'), '—')
})

// ── P1-4 工具卡分组 ──

const call = (over = {}) => ({
  key: 'k1', displayName: '定时任务 · 创建', toolName: 'scheduled_task_create',
  status: 'succeeded', arguments: { title: '喝水提醒' },
  resultSummary: { title: '喝水提醒', ok: true }, serverName: '',
  startedAt: '2026-11-13T08:00:00.000Z', finishedAt: '2026-11-13T08:00:01.200Z',
  durationMs: 1200, ...over,
})

test('工具卡分组：全成功 → ✓ 已完成 N 个工具', () => {
  const g = groupToolCalls([call(), call({ key: 'k2', displayName: '世界书 · 新增条目' })])
  assert.equal(g.total, 2)
  assert.equal(g.succeeded, 2)
  assert.equal(g.failed, 0)
  assert.equal(g.icon, '✓')
  assert.equal(g.label, '✓ 已完成 2 个工具')
})

test('工具卡分组：有失败 / 进行中时用对应图标与文案', () => {
  const failed = groupToolCalls([call(), call({ key: 'k2', status: 'failed', errorMessage: '未绑定' })])
  assert.equal(failed.icon, '⚠')
  assert.equal(failed.failed, 1)
  assert.match(failed.label, /1 失败/)
  const active = groupToolCalls([call({ status: 'running' })])
  assert.equal(active.active, 1)
  assert.equal(active.icon, '⋯')
  assert.match(active.label, /正在执行/)
})

test('工具卡分组：一级是业务化短语，技术细节只留在 detail', () => {
  const g = groupToolCalls([call()])
  const item = g.items[0]
  assert.equal(item.label, '定时任务 · 创建')
  assert.equal(item.outcome, '喝水提醒')
  assert.equal(item.statusLabel, '已完成')
  assert.equal(item.durationMs, 1200)
  assert.equal(item.detail.toolName, 'scheduled_task_create')
  assert.deepEqual(item.detail.arguments, { title: '喝水提醒' })
  assert.equal(item.detail.durationMs, 1200)
})

test('工具卡分组：结构化结果不把 JSON 摊到一级，失败取错误信息', () => {
  assert.equal(groupToolCalls([call({ resultSummary: { id: 'x', ok: true } })]).items[0].outcome, '执行成功')
  assert.equal(groupToolCalls([call({ status: 'failed', errorMessage: '没有绑定到当前人物' })]).items[0].outcome, '没有绑定到当前人物')
  assert.equal(groupToolCalls([call({ status: 'running' })]).items[0].outcome, '执行中')
})

test('工具卡分组：空 / 脏输入返回空分组（UI 完全不显示）', () => {
  for (const v of [null, undefined, [], [null, 3, 'x']]) {
    const g = groupToolCalls(v)
    assert.equal(g.total, 0)
    assert.deepEqual(g.items, [])
  }
})

test('summarizeToolResult：字符串结果 / 截断 / 未知状态', () => {
  assert.equal(summarizeToolResult('已创建 3 条', 'succeeded'), '已创建 3 条')
  assert.ok(summarizeToolResult('x'.repeat(200), 'succeeded').endsWith('…'))
  assert.equal(summarizeToolResult(null, 'cancelled'), '已取消')
})

// ── P1-5 思考过程翻译判定与请求构造 ──

test('非中文判定：英文需要翻译，中文不需要，空/非字符串为 false', () => {
  assert.equal(needsChineseTranslation('Let me think about the user request step by step.'), true)
  assert.equal(needsChineseTranslation('我需要先确认用户想要什么，再决定怎么回答。'), false)
  assert.equal(needsChineseTranslation(''), false)
  assert.equal(needsChineseTranslation(null), false)
  assert.equal(needsChineseTranslation(123), false)
})

test('非中文判定：少量中文夹大量英文仍提供翻译按钮，中英均衡不误判', () => {
  assert.equal(needsChineseTranslation('先 check the API response and then parse the JSON payload carefully'), true)
  assert.equal(needsChineseTranslation('这个 API 返回 JSON 数据，我们需要解析后才能展示给用户'), false)
})

test('翻译请求：system 要求只输出译文，user 原文完整保留，不改原文', () => {
  const raw = 'First line\n\nSecond line with <tags> & symbols'
  const messages = buildTranslationMessages(raw)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /只输出译文/)
  assert.equal(messages[1].role, 'user')
  assert.equal(messages[1].content, raw)
  assert.deepEqual(buildTranslationMessages(null)[1], { role: 'user', content: '' })
})
