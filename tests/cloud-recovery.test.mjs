// 云端恢复链验收（第八阶段：数据安全）。
// 核心规则：有数据的一侧不能被空数据的一侧覆盖；
// 云端优先恢复是既有产品行为，覆盖前对本地做差异备份。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RECOVERY_BACKUP_KEY, classifyCloudLoadError, conversationsHaveData,
  countConversationMessages, decideCloudLoadAction, shouldBackupBeforeApply,
  buildRecoveryBackup, pickActiveConversationIds, pickActiveMessagesFromSnapshot,
} from '../src/cloudRecovery.mjs'

// ───────────────────────── 测试数据 ─────────────────────────

const A = 'assistant-1'
const B = 'assistant-2'

function msg(role, content, extra = {}) {
  return { role, content, id: 'm-' + role + '-' + content.length + '-' + Math.random().toString(36).slice(2, 8), ...extra }
}

function conv(id, messages, extra = {}) {
  return { id, title: '会话 ' + id, messages, updatedAt: '2026-10-31T00:00:00.000Z', ...extra }
}

// 双助手、多会话、带附件引用的完整云端快照（模拟服务器已有数据）
function cloudSnapshot() {
  return {
    version: 2,
    conversations: {
      [A]: [
        conv('conv-a1', [msg('user', '今晚吃什么'), msg('assistant', '火锅如何', { id: 'ai-reply-1' })]),
        conv('conv-a2', [msg('user', '第二会话消息', { id: 'u-a2-1' })]),
      ],
      [B]: [conv('conv-b1', [msg('user', '讲个故事', { id: 'u-b1-1' })])],
    },
    activeConversationIds: { [A]: 'conv-a1', [B]: 'conv-b1' },
  }
}

// 本地有消息的状态（模拟老设备 localStorage）
function localState() {
  return {
    conversations: {
      [A]: [conv('conv-local', [msg('user', '本地独有的消息', { id: 'local-1' })])],
      [B]: [],
    },
    activeConversationIds: { [A]: 'conv-local', [B]: '' },
  }
}

// ───────────────────────── 1-4：启动决策 ─────────────────────────

test('本地空 + 云端有数据 → apply-cloud（恢复云端）', () => {
  const action = decideCloudLoadAction({ cloudState: cloudSnapshot() })
  assert.equal(action, 'apply-cloud')
})

test('本地有数据 + 云端空 → upload-local（保留本地并迁移，不清空本地）', () => {
  const local = localState()
  const action = decideCloudLoadAction({ cloudState: null, localHasData: conversationsHaveData(local.conversations) })
  assert.equal(action, 'upload-local')
})

test('本地有数据 + 云端请求失败(network) → offline-keep-local（保留本地，不触碰云端）', () => {
  for (const status of [undefined, 500, 502, 503, 0]) {
    const action = decideCloudLoadAction({ error: { status } })
    assert.equal(action, 'offline-keep-local', 'status=' + status)
  }
})

test('初始化空状态不能覆盖非空云端：云端有快照时决策恒为 apply-cloud，PUT 分支不可达', () => {
  // 无论本地是否为空，云端有数据就不会走 upload-local（上传会覆盖云端）
  for (const localHasData of [true, false, undefined]) {
    const action = decideCloudLoadAction({ cloudState: cloudSnapshot(), localHasData })
    assert.equal(action, 'apply-cloud')
  }
  // 仅主题配置的快照同样不被初始状态覆盖
  assert.equal(decideCloudLoadAction({ cloudState: { themePrefs: { theme: 'night' } } }), 'apply-cloud')
  // legacy messages-only 快照也走 apply
  assert.equal(decideCloudLoadAction({ cloudState: { messages: { [A]: [msg('user', '旧格式')] } } }), 'apply-cloud')
})

test('凭证失效(401/403) → sign-out：唯一允许打断进入的分支', () => {
  assert.equal(decideCloudLoadAction({ error: { status: 401 } }), 'sign-out')
  assert.equal(decideCloudLoadAction({ error: { status: 403 } }), 'sign-out')
  assert.equal(classifyCloudLoadError(401), 'auth')
  assert.equal(classifyCloudLoadError(403), 'auth')
  assert.equal(classifyCloudLoadError(500), 'network')
  assert.equal(classifyCloudLoadError(undefined), 'network')
})

// ───────────────────────── 5-7：恢复保真 ─────────────────────────

test('恢复后 message IDs 保持不变（快照提取不改写任何消息字段）', () => {
  const snap = cloudSnapshot()
  const view = pickActiveMessagesFromSnapshot(snap.conversations, snap.activeConversationIds)
  const restored = view[A]
  assert.equal(restored.length, 2)
  assert.equal(restored[0].id, snap.conversations[A][0].messages[0].id)
  assert.equal(restored[1].id, 'ai-reply-1')
  // 恢复的是原始对象引用链上的内容：JSON 往返（localStorage/云端同构）后 id 仍一致
  const roundTripped = JSON.parse(JSON.stringify(view))
  assert.equal(roundTripped[A][1].id, 'ai-reply-1')
})

test('assistantId / conversationId 保持不变', () => {
  const snap = cloudSnapshot()
  const ids = pickActiveConversationIds(snap.conversations, snap.activeConversationIds)
  assert.deepEqual(ids, { [A]: 'conv-a1', [B]: 'conv-b1' })
  assert.deepEqual(Object.keys(snap.conversations), [A, B], '助手键原样')
  assert.equal(snap.conversations[A][0].id, 'conv-a1', '会话 id 原样')
})

test('附件 assetId / 稳定 URL 引用保持不变', () => {
  const attachment = { name: 'photo.png', type: 'image/png', size: 1234, assetId: 'asset-uuid-1', preview: '/api/attachments/asset-uuid-1' }
  const snap = cloudSnapshot()
  snap.conversations[A][0].messages[0].attachments = [attachment]
  const view = pickActiveMessagesFromSnapshot(snap.conversations, snap.activeConversationIds)
  const restoredAttachment = view[A][0].attachments[0]
  assert.equal(restoredAttachment.assetId, 'asset-uuid-1')
  assert.equal(restoredAttachment.preview, '/api/attachments/asset-uuid-1')
  // 模拟「清空本地 → 云端恢复 → 再落盘 localStorage」全链路往返
  const persisted = JSON.parse(JSON.stringify({ conversations: snap.conversations, activeConversationIds: snap.activeConversationIds }))
  const view2 = pickActiveMessagesFromSnapshot(persisted.conversations, persisted.activeConversationIds)
  assert.equal(view2[A][0].attachments[0].assetId, 'asset-uuid-1')
})

// ───────────────────────── 8：恢复后继续保存 ─────────────────────────

test('恢复完成后后续新消息仍可正常保存（快照+新消息 JSON 往返保真）', () => {
  const snap = cloudSnapshot()
  const view = pickActiveMessagesFromSnapshot(snap.conversations, snap.activeConversationIds)
  // 恢复后用户发了一条新消息 + 一条 AI 回复（含附件引用）——模拟进入保存链
  view[A] = [...view[A], msg('user', '新消息', { id: 'new-1' }), msg('assistant', '新回复', { id: 'new-2', attachments: [{ name: 'x.png', type: 'image/png', size: 1, assetId: 'asset-2', preview: '/api/attachments/asset-2' }] })]
  const nextSnapshot = { ...snap, conversations: { ...snap.conversations, [A]: snap.conversations[A].map(c => c.id === 'conv-a1' ? { ...c, messages: view[A] } : c) } }
  // PUT 载荷 → GET 读回（服务端原样存储 JSON）
  const served = JSON.parse(JSON.stringify(nextSnapshot))
  const restoredView = pickActiveMessagesFromSnapshot(served.conversations, served.activeConversationIds)
  assert.equal(restoredView[A].length, 4)
  assert.equal(restoredView[A][2].id, 'new-1')
  assert.equal(restoredView[A][3].attachments[0].assetId, 'asset-2')
})

// ───────────────────────── 9-10：多助手 / 多会话隔离 ─────────────────────────

test('多 Assistant 数据不能串：各自视图只含自己的会话消息', () => {
  const snap = cloudSnapshot()
  const view = pickActiveMessagesFromSnapshot(snap.conversations, snap.activeConversationIds)
  assert.ok(view[A].some(m => m.content === '今晚吃什么'))
  assert.ok(!view[A].some(m => m.content === '讲个故事'), 'B 的消息不能出现在 A')
  assert.ok(view[B].some(m => m.content === '讲个故事'))
  assert.ok(!view[B].some(m => m.content === '今晚吃什么'), 'A 的消息不能出现在 B')
})

test('多 Conversation 数据不能串：视图只含活跃会话，非活跃会话消息不混入', () => {
  const snap = cloudSnapshot()
  const view = pickActiveMessagesFromSnapshot(snap.conversations, snap.activeConversationIds)
  assert.ok(!view[A].some(m => m.content === '第二会话消息'), '非活跃 conv-a2 不混入视图')
  // 切换活跃会话 → 视图跟着换，且不动其他助手
  const switched = pickActiveMessagesFromSnapshot(snap.conversations, { [A]: 'conv-a2', [B]: 'conv-b1' })
  assert.ok(switched[A].some(m => m.content === '第二会话消息'))
  assert.equal(switched[B], view[B] || switched[B])
  assert.ok(switched[B].some(m => m.content === '讲个故事'))
})

test('活跃 id 失效（云端会话被删/改）→ 回退该助手第一个会话，视图与列表一致', () => {
  const snap = cloudSnapshot()
  const view = pickActiveMessagesFromSnapshot(snap.conversations, { [A]: 'ghost-id', [B]: 'conv-b1' })
  const ids = pickActiveConversationIds(snap.conversations, { [A]: 'ghost-id', [B]: 'conv-b1' })
  assert.equal(ids[A], 'conv-a1', '回退到第一个会话')
  assert.ok(view[A].some(m => m.content === '今晚吃什么'), '视图显示回退会话的消息（不再空窗）')
})

// ───────────────────────── 覆盖前备份 ─────────────────────────

test('conversationsHaveData / countConversationMessages：空与非空判定', () => {
  assert.equal(conversationsHaveData(null), false)
  assert.equal(conversationsHaveData({}), false)
  assert.equal(conversationsHaveData({ [A]: [] }), false)
  assert.equal(conversationsHaveData({ [A]: [conv('c', [])] }), false, '无消息会话不算有数据')
  assert.equal(conversationsHaveData({ [A]: [conv('c', [msg('user', 'x')])] }), true)
  assert.equal(countConversationMessages({ [A]: [conv('c1', [msg('user', 'x'), msg('assistant', 'y')])], [B]: [conv('c2', [msg('user', 'z')])] }), 3)
})

test('shouldBackupBeforeApply：本地空不备份；本地持有云端没有的内容才备份', () => {
  const local = localState()
  const cloud = cloudSnapshot().conversations
  assert.equal(shouldBackupBeforeApply({}, cloud), false, '本地空 → 不备份')
  assert.equal(shouldBackupBeforeApply(null, cloud), false)
  assert.equal(shouldBackupBeforeApply(local.conversations, local.conversations), false, '两边一致 → 不备份')
  assert.equal(shouldBackupBeforeApply(local.conversations, {}), true, '云端空且本地有数据 → 备份')
  assert.equal(shouldBackupBeforeApply(local.conversations, cloud), false, '云端更丰富（正常恢复方向）→ 不备份')
  // 本地消息比云端更多（上次会话末尾保存失败的窗口）→ 必须备份
  const localMore = { [A]: [conv('c1', [msg('user', '1'), msg('assistant', '2'), msg('user', '3'), msg('assistant', '4'), msg('user', '5')])], [B]: [] }
  assert.equal(shouldBackupBeforeApply(localMore, cloud), true)
  // 总数相同但本地有云端没有的会话 → 也要备份
  const cloudSame = { [A]: [conv('c1', [msg('user', '1'), msg('assistant', '2')])], [B]: [] }
  const localExtraConv = { [A]: [conv('c1', [msg('user', '1'), msg('assistant', '2')]), conv('orphan', [msg('user', '只有本地有的会话')])], [B]: [] }
  assert.equal(shouldBackupBeforeApply(localExtraConv, cloudSame), true)
})

test('buildRecoveryBackup：结构完整、JSON 往返保真（键名固定）', () => {
  const local = localState()
  const backup = buildRecoveryBackup(local.conversations, local.activeConversationIds)
  assert.equal(backup.version, 1)
  assert.ok(backup.backedUpAt, '含备份时间戳')
  const roundTripped = JSON.parse(JSON.stringify(backup))
  assert.equal(roundTripped.conversations[A][0].messages[0].id, 'local-1', '本地消息 id 备份后可取回')
  assert.equal(roundTripped.activeConversationIds[A], 'conv-local')
  assert.equal(RECOVERY_BACKUP_KEY, 'ai-home.recoveryBackup.v1')
})

test('快照字段守卫：缺 conversations 的部分快照不会清掉本地对应部分', () => {
  // applySnapshot 的行为是「有才设」；这里锁定纯函数层对缺字段输入的稳健性
  const ids = pickActiveConversationIds(undefined, {})
  assert.deepEqual(ids, {})
  const view = pickActiveMessagesFromSnapshot(undefined, {})
  assert.deepEqual(view, {})
})
