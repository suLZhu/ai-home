// 上下文压缩：只压早段、摘要之后的消息必须全部保留、AI 能检索原文。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTEXT_LIMITS, planCompaction, buildSummaryPrompt,
  buildSummarySystemMessage, searchHistory, searchMessageList,
} from '../src/contextCompression.mjs'

const messages = (n, role = 'user', text = '一段对话') =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : role, content: text + ' ' + (i + 1), at: new Date(Date.now() - (n - i) * 60000).toISOString(), id: 'm' + i }))

test('短对话不压缩', () => {
  assert.deepEqual(planCompaction(messages(10)), { needed: false, cut: 0 })
})

test('超过 32 条：压掉最旧的，保留最近 20 条', () => {
  const plan = planCompaction(messages(40))
  assert.equal(plan.needed, true)
  assert.equal(plan.cut, 20)
})

test('条数没超但字数超预算，也会从最旧的开始压', () => {
  const long = messages(30, 'user', '字'.repeat(2000))
  const plan = planCompaction(long)
  assert.equal(plan.needed, true)
  assert.ok(plan.cut > 0)
  const kept = long.slice(plan.cut)
  assert.ok(kept.reduce((n, m) => n + m.content.length, 0) <= CONTEXT_LIMITS.maxChars)
  assert.ok(kept.length >= 1)
})

test('摘要提示词合并已有摘要与新增旧对话', () => {
  const prompt = buildSummaryPrompt('旧摘要：用户喜欢桂花茶。', messages(3))
  assert.equal(prompt[0].role, 'system')
  assert.match(prompt[0].content, /对话压缩器/)
  assert.match(prompt[1].content, /【已有摘要】/)
  assert.match(prompt[1].content, /用户喜欢桂花茶/)
  assert.match(prompt[1].content, /【新增旧对话】/)
  assert.match(prompt[1].content, /一段对话 3/)
})

test('前情提要消息告诉模型覆盖了多少条、可以回顾原文', () => {
  const text = buildSummarySystemMessage('摘要正文', 12)
  assert.match(text, /更早的 12 条对话已压缩/)
  assert.match(text, /摘要正文/)
  assert.match(text, /conversation_search/)
})



test('当前聊天窗旧原文召回优先找与本轮相关的细节', () => {
  const old = [
    { role: 'user', content: '周六去桂花茶店，下午三点见。', at: '2026-11-14T10:00:00.000Z' },
    { role: 'assistant', content: '记住了，三点到楼下等你。', at: '2026-11-14T10:01:00.000Z' },
    { role: 'user', content: '客厅的灯以后换成暖色。', at: '2026-11-14T10:02:00.000Z' },
  ]
  const hits = searchMessageList(old, '桂花茶三点那个安排还记得吗', 4)
  assert.ok(hits.length >= 1)
  assert.match(hits[0].content, /桂花茶|三点/)
  assert.ok(!hits.some(hit => /暖色/.test(hit.content) && hit.score >= hits[0].score))
})

test('当前聊天窗召回对空查询不返回内容', () => {
  assert.deepEqual(searchMessageList(messages(10), ''), [])
})

test('conversation_search 检索原始消息并隔离助手', () => {
  const conversations = {
    'assistant-yanweixi': [
      { id: 'c1', title: '桂花茶', messages: [
        { role: 'user', content: '周六去桂花茶店吧', at: '2026-11-14T10:00:00.000Z' },
        { role: 'assistant', content: '好呀，三点到楼下等你', at: '2026-11-14T10:01:00.000Z' },
      ] },
      { id: 'c2', title: '新家', messages: [{ role: 'user', content: '客厅的灯换成暖色', at: '2026-11-13T10:00:00.000Z' }] },
    ],
    'assistant-yanshuo': [{ id: 'c3', title: '别的助手', messages: [{ role: 'user', content: '桂花茶只有我知道', at: '2026-11-14T11:00:00.000Z' }] }],
  }
  const hits = searchHistory(conversations, 'assistant-yanweixi', '桂花茶')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].conversationId, 'c1')
  assert.ok(!JSON.stringify(hits).includes('别的助手'))
  assert.equal(searchHistory(conversations, 'assistant-yanweixi', '桂花茶', 1).length, 1)
  assert.deepEqual(searchHistory(conversations, 'assistant-yanweixi', ''), [])
})
