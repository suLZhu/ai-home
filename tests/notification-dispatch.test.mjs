import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SYSTEM_CHANNEL_ID, SYSTEM_CHANNEL_NAME, NOTIFIED_STORAGE_KEY, NOTIFIED_TTL_MS,
  safeChannelPart, assistantChannelId, channelIdFor, channelNameFor, channelPlan,
  notificationKey, notificationPayload, summarize,
  loadNotified, pruneNotified, markNotified, shouldNotify, decideNotification,
  routeFromNotificationOpen,
} from '../src/notificationDispatch.mjs'

const YWX = 'assistant-yanweixi'
const YS = 'assistant-yanshuo'
const AVATAR = 'data:image/jpeg;base64,AAAA'

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

// 与 App.tsx notifyAfterWrite 同构的链路模拟：写回聊天 → 决策 → 发通知 → 记去重键。
function makeChain(opts = {}) {
  const storage = opts.storage || memStorage()
  const sent = []
  const delivered = () => (opts.nativeDelivered ? opts.nativeDelivered() : [])
  function afterWrite(input, view = {}) {
    const payload = notificationPayload(input)
    const decision = decideNotification({
      payload,
      activePerson: view.activePerson || '',
      activeConversationId: view.activeConversationId || '',
      page: view.page || '',
      chatOpen: view.chatOpen || false,
      visible: view.visible === undefined ? true : view.visible,
      notified: loadNotified(storage),
      nativeDelivered: delivered(),
    })
    if (!decision.notify) return { decision, payload }
    sent.push(payload)
    markNotified(storage, payload.key, Date.now())
    return { decision, payload }
  }
  return { storage, sent, afterWrite }
}

test('通知渠道：系统渠道 + 两位助手相互隔离，新增助手自动扩展', () => {
  const plan = channelPlan([YWX, YS], (id) => (id === YWX ? '晏未晞' : '言朔'), () => AVATAR)
  assert.equal(plan.length, 3)
  assert.deepEqual(plan.map(p => p.id), ['system', YWX, YS])
  assert.equal(plan[0].channelId, SYSTEM_CHANNEL_ID)
  assert.equal(plan[0].channelName, SYSTEM_CHANNEL_NAME)
  assert.equal(plan[1].channelId, 'aihome.msg.assistant-yanweixi')
  assert.equal(plan[2].channelId, 'aihome.msg.assistant-yanshuo')
  assert.notEqual(plan[1].channelId, plan[2].channelId)
  assert.equal(plan[1].channelName, '晏未晞消息')
  assert.equal(plan[2].channelName, '言朔消息')
  assert.equal(plan[1].avatar, AVATAR)

  const more = channelPlan([YWX, YS, 'assistant-003'], () => '', () => '')
  assert.equal(more.length, 4, '第三位助手不需要改原生代码')
  // 重复 / 空 id 不产生多余渠道
  assert.equal(channelPlan([YWX, YWX, '', null]).length, 2)
})

test('渠道归属：任务走系统渠道，普通主动消息走助手渠道', () => {
  assert.equal(channelIdFor('task', YWX), SYSTEM_CHANNEL_ID)
  assert.equal(channelIdFor('task_result', YWX), SYSTEM_CHANNEL_ID)
  assert.equal(channelIdFor('test', YWX), SYSTEM_CHANNEL_ID)
  assert.equal(channelIdFor('system', YWX), SYSTEM_CHANNEL_ID)
  assert.equal(channelIdFor('message', YWX), assistantChannelId(YWX))
  assert.equal(channelIdFor('message', ''), SYSTEM_CHANNEL_ID)
  assert.equal(channelNameFor('task', YWX, '晏未晞'), SYSTEM_CHANNEL_NAME)
  assert.equal(channelNameFor('message', YWX, '晏未晞'), '晏未晞消息')
  assert.equal(assistantChannelId(''), '')
  assert.equal(safeChannelPart('Some 中文 / ID!'), 'some-id')
  assert.equal(safeChannelPart(''), 'unknown')
})

test('通知内容：助手名 / 摘要 / 展开正文 / 时间 / 头像 / 会话参数齐全', () => {
  const long = '记得去洗衣服哦，'.repeat(500)
  const payload = notificationPayload({
    kind: 'message', person: YWX, label: '晏未晞', text: long,
    conversationId: 'conv-1', at: 1730000000000, avatar: AVATAR,
    messageId: 'inbox-1',
  })
  assert.equal(payload.key, 'inbox:inbox-1')
  assert.equal(payload.title, '晏未晞')
  assert.equal(payload.channelId, assistantChannelId(YWX))
  assert.equal(payload.assistantId, YWX)
  assert.equal(payload.conversationId, 'conv-1')
  assert.equal(payload.at, 1730000000000)
  assert.equal(payload.avatar, AVATAR)
  assert.equal(payload.body.length, 3600, '长正文保留给 BigTextStyle 展开')
  assert.ok(payload.summary.length <= 111 && payload.summary.endsWith('…'))
  assert.equal(summarize('  多行\n空白  '), '多行 空白')

  const task = notificationPayload({ kind: 'task', person: YS, runId: 'local-t1-100', text: '⏰ 洗衣', label: '言朔' })
  assert.equal(task.key, 'task:local-t1-100')
  assert.equal(task.channelId, SYSTEM_CHANNEL_ID)
  assert.equal(task.title, '言朔 · 定时任务')
  assert.equal(task.assistantId, YS)
  // 非图像 / 超长头像不进 Intent（避免 Binder 事务过大）
  assert.equal(notificationPayload({ person: YWX, text: 'x', avatar: 'https://x/a.png' }).avatar, '')
  assert.equal(notificationPayload({ person: YWX, text: 'x', avatar: 'data:image/png;base64,' + 'a'.repeat(300000) }).avatar, '')
})

test('稳定 ID：runId 优先，其次 messageId，兜底内容哈希恒定', () => {
  assert.equal(notificationKey({ runId: 'local-t1-100', messageId: 'inbox-1' }), 'task:local-t1-100')
  assert.equal(notificationKey({ messageId: 'inbox-1', person: YWX }), 'inbox:inbox-1')
  const a = notificationKey({ person: YWX, text: '洗衣服', at: 1 })
  const b = notificationKey({ person: YWX, text: '洗衣服', at: 1 })
  assert.equal(a, b)
  assert.match(a, /^msg:/)
  assert.notEqual(a, notificationKey({ person: YWX, text: '洗衣服', at: 2 }))
})

test('本机去重集合：TTL、上限、损坏数据容错、重复标记返回 false', () => {
  const now = 1_800_000_000_000
  const storage = memStorage()
  assert.equal(markNotified(storage, 'task:a', now), true)
  assert.equal(markNotified(storage, 'task:a', now), false)
  assert.equal(markNotified(storage, 'inbox:b', now), true)
  assert.deepEqual([...loadNotified(storage, now)].sort(), ['inbox:b', 'task:a'])
  assert.deepEqual(loadNotified(storage, now + NOTIFIED_TTL_MS + 1), new Set(), '过期键自动失效')
  assert.equal(markNotified(storage, 'task:c', now + NOTIFIED_TTL_MS + 1), true)
  assert.deepEqual([...loadNotified(storage, now + NOTIFIED_TTL_MS + 1)], ['task:c'])

  const broken = memStorage({ [NOTIFIED_STORAGE_KEY]: '{bad json' })
  assert.deepEqual(loadNotified(broken), new Set())
  const weird = memStorage({ [NOTIFIED_STORAGE_KEY]: JSON.stringify({ good: now, stale: 1, nope: 'x' }) })
  assert.deepEqual([...loadNotified(weird, now)], ['good'])
  assert.deepEqual(pruneNotified(new Set(['a', '', null, 3])), ['a'])
  assert.equal(pruneNotified(new Set(Array.from({ length: 500 }, (_, i) => 'k' + i))).length, 400)
  assert.equal(markNotified({ getItem: () => null, setItem: () => { throw new Error('quota') } }, 'x', now), false)
})

test('用户正在该助手的对应会话里时不弹；其它会话 / 别的助手 / 后台都要弹', () => {
  const payload = notificationPayload({ kind: 'message', person: YWX, text: '记得去洗衣服哦', conversationId: 'conv-1', messageId: 'm1' })
  const currentChat = { activePerson: YWX, activeConversationId: 'conv-1', page: 'room', chatOpen: true, visible: true }
  assert.deepEqual(shouldNotify({ payload, ...currentChat, notified: new Set() }), { notify: false, reason: 'current_chat' })
  assert.equal(shouldNotify({ payload, ...currentChat, visible: false, notified: new Set() }).notify, true, '锁屏/后台必须弹')
  assert.equal(shouldNotify({ payload, ...currentChat, page: 'settings', notified: new Set() }).notify, true)
  assert.equal(shouldNotify({ payload, ...currentChat, chatOpen: false, notified: new Set() }).notify, true)
  assert.equal(shouldNotify({ payload, ...currentChat, activePerson: YS, notified: new Set() }).notify, true, '在别的助手会话里要弹')
  assert.equal(shouldNotify({ payload, ...currentChat, activeConversationId: 'conv-2', notified: new Set() }).notify, true)
  // 消息没有绑定会话时，只要停在该助手聊天就不重复弹
  const noConv = notificationPayload({ kind: 'message', person: YWX, text: 'x', messageId: 'm2' })
  assert.equal(shouldNotify({ payload: noConv, ...currentChat, notified: new Set() }).notify, false)
  assert.equal(shouldNotify({ payload: { ...payload, body: '' }, ...currentChat, notified: new Set() }).reason, 'invalid')
  assert.equal(shouldNotify({ payload, ...currentChat, notified: new Set(['inbox:m1']) }).reason, 'duplicate')
})

test('点击通知：只认仍存在的 assistantId，会话 id 原样透传', () => {
  assert.deepEqual(routeFromNotificationOpen({ assistantId: YWX, conversationId: 'conv-9' }, [YWX, YS]), { person: YWX, conversationId: 'conv-9' })
  assert.deepEqual(routeFromNotificationOpen({ person: YS }, [YWX, YS]), { person: YS, conversationId: '' })
  assert.equal(routeFromNotificationOpen({ assistantId: 'assistant-deleted' }, [YWX, YS]), null)
  assert.equal(routeFromNotificationOpen({ assistantId: 'x'.repeat(65) }, [YWX, YS]), null)
  assert.equal(routeFromNotificationOpen(null, [YWX]), null)
  assert.deepEqual(routeFromNotificationOpen({ assistantId: YWX, conversationId: 'c1' }, []), { person: YWX, conversationId: 'c1' })
})

test('链路 1：定时任务写回聊天只产生一条系统通知，重复轮询不再弹', () => {
  const chain = makeChain()
  const input = { kind: 'task', person: YWX, runId: 'local-t1-100', text: '记得去洗衣服哦……', conversationId: 'conv-1', at: Date.now() }
  const first = chain.afterWrite(input, { activePerson: YS, page: 'home', visible: false })
  assert.equal(first.decision.notify, true)
  assert.equal(chain.sent.length, 1)
  assert.equal(chain.sent[0].key, 'task:local-t1-100')
  assert.equal(chain.sent[0].assistantId, YWX)
  assert.equal(chain.sent[0].conversationId, 'conv-1')
  assert.equal(chain.sent[0].channelId, SYSTEM_CHANNEL_ID)
  const second = chain.afterWrite(input, { visible: false })
  assert.equal(second.decision.reason, 'duplicate')
  assert.equal(chain.sent.length, 1, '恢复前台后不能重复通知')
  const route = routeFromNotificationOpen(chain.sent[0], [YWX, YS])
  assert.deepEqual(route, { person: YWX, conversationId: 'conv-1' })
})

test('链路 2：锁屏期间原生闹钟已投递 → App 回前台补写聊天时不弹第二条', () => {
  const native = ['task:local-t2-200']
  const chain = makeChain({ nativeDelivered: () => native })
  const result = chain.afterWrite(
    { kind: 'task', person: YS, runId: 'local-t2-200', text: '⏰ 交报告' },
    { activePerson: YWX, page: 'home', visible: false },
  )
  assert.equal(result.decision.notify, false)
  assert.equal(result.decision.reason, 'duplicate')
  assert.equal(chain.sent.length, 0)
  // 另一条任务不受影响
  const other = chain.afterWrite({ kind: 'task', person: YS, runId: 'local-t3-300', text: '⏰ 买菜' }, { visible: false })
  assert.equal(other.decision.notify, true)
  assert.equal(chain.sent.length, 1)
})

test('链路 3：当前会话前台不弹、退到后台同一条消息仍不重复', () => {
  const chain = makeChain()
  const input = { kind: 'message', person: YWX, text: '想你了', conversationId: 'conv-1', messageId: 'inbox-7' }
  const current = { activePerson: YWX, activeConversationId: 'conv-1', page: 'room', chatOpen: true, visible: true }
  const skipped = chain.afterWrite(input, current)
  assert.equal(skipped.decision.reason, 'current_chat')
  assert.equal(chain.sent.length, 0)
  // 前台已看过 → 不写入去重键；切到后台后同一条仍不弹（没有新内容，不制造噪音）
  assert.equal(chain.afterWrite(input, { ...current, visible: false }).decision.notify, true, '退到后台可作为新通知投递')
  assert.equal(chain.sent.length, 1)
  assert.equal(chain.afterWrite(input, { ...current, visible: false }).decision.reason, 'duplicate')
})

test('链路 4：两位助手渠道隔离，且本地任务与云端任务结果共用 runId 只弹一次', () => {
  const chain = makeChain()
  const a = chain.afterWrite({ kind: 'message', person: YWX, label: '晏未晞', text: '洗衣服', messageId: 'i1' }, { visible: false })
  const b = chain.afterWrite({ kind: 'message', person: YS, label: '言朔', text: '早点睡', messageId: 'i2' }, { visible: false })
  assert.equal(a.payload.channelId, assistantChannelId(YWX))
  assert.equal(b.payload.channelId, assistantChannelId(YS))
  assert.notEqual(a.payload.channelId, b.payload.channelId)
  const local = chain.afterWrite({ kind: 'task', person: YWX, runId: 'local-t9-900', text: '完成' }, { visible: false })
  const cloud = chain.afterWrite({ kind: 'task', person: YWX, runId: 'local-t9-900', text: '完成', messageId: 'cloud-result' }, { visible: false })
  assert.equal(local.decision.notify, true)
  assert.equal(cloud.decision.reason, 'duplicate', '同一 runId 的 task_notice / task_result 不弹两次')
  assert.equal(chain.sent.length, 3)
})

test('decideNotification 合并原生已投递键，且不污染传入的 Set', () => {
  const payload = notificationPayload({ kind: 'task', person: YWX, runId: 'r1', text: 'x' })
  const store = new Set()
  const decision = decideNotification({ payload, notified: store, nativeDelivered: ['task:r1'], visible: false })
  assert.equal(decision.reason, 'duplicate')
  assert.equal(store.size, 0)
})
