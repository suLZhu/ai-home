// 会话内消息搜索验收：匹配（中英文数字/大小写）、预览、结果定位标识、上一条/下一条循环、会话隔离。
// chatSearch.mjs 是纯函数模块，直接单测（与 attachmentRefs 同模式）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeQuery, snippetAround,
  searchMessages, stepMatchIndex,
} from '../src/chatSearch.mjs'

function msg(id, role, content) {
  return { id, role, content }
}

// ───────────────────────── 关键词与匹配 ─────────────────────────

test('规范化：去首尾空白 + 英文忽略大小写', () => {
  assert.equal(normalizeQuery('  Hello  '), 'hello')
  assert.equal(normalizeQuery('晚餐'), '晚餐')
  assert.equal(normalizeQuery(undefined), '')
  assert.equal(normalizeQuery(null), '')
})

test('中文关键词：子串命中，跨消息各自统计', () => {
  const list = [
    msg('m1', 'user', '今晚吃什么？'),
    msg('m2', 'assistant', '今晚吃火锅怎么样'),
    msg('m3', 'user', '明天再说'),
  ]
  const r = searchMessages(list, '今晚')
  assert.equal(r.total, 2)
  assert.deepEqual(r.items.map(x => x.messageId), ['m1', 'm2'])
  assert.equal(r.items[0].role, 'user')
  assert.equal(r.items[1].role, 'assistant')
})

test('英文关键词：忽略大小写', () => {
  const list = [msg('m1', 'assistant', 'Hello World'), msg('m2', 'user', 'say hello again')]
  const r = searchMessages(list, 'HeLLo')
  assert.equal(r.total, 2)
  assert.equal(r.items[0].count, 1)
  assert.equal(r.items[1].count, 1)
})

test('数字关键词：命中且统计同条消息内多处', () => {
  const list = [msg('m1', 'user', '订单 12345 已发货，单号 12345'), msg('m2', 'assistant', '好的')]
  const r = searchMessages(list, '12345')
  assert.equal(r.total, 1)
  assert.equal(r.items[0].count, 2)
})

test('空关键词 / 空列表 / 空消息：不产生任何结果', () => {
  assert.deepEqual(searchMessages([msg('m1', 'user', 'abc')], '   '), { total: 0, items: [] })
  assert.deepEqual(searchMessages([], 'abc'), { total: 0, items: [] })
  assert.deepEqual(searchMessages(null, 'abc'), { total: 0, items: [] })
  assert.deepEqual(searchMessages(undefined, 'abc'), { total: 0, items: [] })
  // 无 content 的消息（如纯图片消息）不参与匹配、不报错
  assert.deepEqual(searchMessages([{ id: 'm1', role: 'user', attachments: [] }], 'abc'), { total: 0, items: [] })
})

test('关键词是正则特殊字符时按字面匹配，不抛错', () => {
  const list = [msg('m1', 'user', '价格是 (100) 元 [特惠]'), msg('m2', 'user', '价格是一百元')]
  const r = searchMessages(list, '(100)')
  assert.equal(r.total, 1)
  assert.equal(r.items[0].messageId, 'm1')
  const r2 = searchMessages(list, '[特惠]')
  assert.equal(r2.total, 1)
})

// ───────────────────────── 预览片段 ─────────────────────────

test('预览：以关键词为中心截取，超长两端省略号', () => {
  const long = '前'.repeat(80) + '关键词' + '后'.repeat(80)
  const s = snippetAround(long, '关键词')
  assert.ok(s.includes('关键词'))
  assert.ok(s.startsWith('…'), '截断了开头应有前省略号')
  assert.ok(s.endsWith('…'), '截断了结尾应有后省略号')
  assert.ok(s.length < long.length)
})

test('预览：开头命中不加前省略号；换行压成空格', () => {
  const s = snippetAround('关键词在开头\n第二行', '关键词')
  assert.ok(!s.startsWith('…'))
  assert.ok(!s.includes('\n'), '预览应为单行')
  assert.ok(s.includes('第二行'))
})

// ───────────────────────── 结果定位标识 ─────────────────────────

test('定位标识：每条结果带真实 messageId 与消息位置 index', () => {
  const list = [msg('m1', 'user', '你好'), msg(undefined, 'assistant', '你好呀'), msg('m3', 'user', '再见')]
  const r = searchMessages(list, '你好')
  assert.equal(r.total, 2)
  // 有 id 的消息：messageId 直接可用于 DOM 查询
  assert.equal(r.items[0].messageId, 'm1')
  // 无 id 的历史消息：messageId 为空串，index 供展示「第 N 条」，定位时跳过
  assert.equal(r.items[1].messageId, '')
  assert.equal(r.items[1].index, 1)
  assert.equal(r.items[0].index, 0)
})

test('limit 截断：total 仍为全量命中数，items 只到 limit', () => {
  const list = Array.from({ length: 50 }, (_, i) => msg('m' + i, 'user', '关键词 ' + i))
  const r = searchMessages(list, '关键词', 10)
  assert.equal(r.total, 50)
  assert.equal(r.items.length, 10)
})

// ───────────────────────── 上一条 / 下一条 ─────────────────────────

test('下一条：从 -1 起步到第 0 条，末尾循环回首条', () => {
  assert.equal(stepMatchIndex(-1, 5, 1), 0)
  assert.equal(stepMatchIndex(0, 5, 1), 1)
  assert.equal(stepMatchIndex(4, 5, 1), 0)
})

test('上一条：从 -1 起步到最后一条，首条循环回末条', () => {
  assert.equal(stepMatchIndex(-1, 5, -1), 4)
  assert.equal(stepMatchIndex(0, 5, -1), 4)
  assert.equal(stepMatchIndex(4, 5, -1), 3)
})

test('无结果：返回 -1（UI 显示空态提示，不跳转）', () => {
  assert.equal(stepMatchIndex(-1, 0, 1), -1)
  assert.equal(stepMatchIndex(3, 0, -1), -1)
})

// ───────────────────────── 会话隔离 ─────────────────────────

test('会话隔离：搜索只作用于传入的当前会话消息列表', () => {
  // 模拟两个助手各自的会话消息；搜索函数只接收当前会话列表，
  // 另一助手的内容根本不在入参里——结构性保证不会混入。
  const ywxConversation = [msg('a1', 'user', '今晚散步吗'), msg('a2', 'assistant', '今晚散步好啊')]
  const ysConversation = [msg('b1', 'user', '今晚加班'), msg('b2', 'assistant', '辛苦了')]
  const r = searchMessages(ywxConversation, '今晚')
  assert.equal(r.total, 2)
  assert.ok(r.items.every(x => x.messageId.startsWith('a')), '结果只来自当前会话，不含另一助手的消息')
  assert.ok(!r.items.some(x => ysConversation.some(o => o.id === x.messageId)), '另一助手会话的消息 id 不出现在结果中')
})

test('会话内用户消息与 AI 回复都被搜索到', () => {
  const list = [msg('m1', 'user', '推荐一家餐厅'), msg('m2', 'assistant', '推荐海底捞'), msg('m3', 'user', '好的谢谢')]
  const r = searchMessages(list, '推荐')
  assert.deepEqual(r.items.map(x => x.role), ['user', 'assistant'])
})
