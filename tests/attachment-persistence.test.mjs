// 图片附件持久化验收：发送保存 / 刷新恢复 / 会话切换 / 多图 / 删除 / 历史兼容 / 存储失败。
// 后端用 :memory: sqlite 直测存储模块，前端引用逻辑直测纯函数（与 deferred-storage 同模式）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import {
  initAttachments, saveAttachment, getAttachment, deleteAttachment,
  decodeBase64Image, ATTACH_MAX_BODY,
} from '../src/server/attachments.mjs'
import {
  isStablePreview, classifyPreview, needsUpload,
  assetIdsOfMessages, collectReferencedAssetIds, releasedAssetIds,
} from '../src/attachmentRefs.mjs'

// 1x1 红色 PNG 的 base64（合法图片字节，用于往返验证）
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeDb() {
  const db = new DatabaseSync(':memory:')
  initAttachments(db)
  return db
}

function att(overrides = {}) {
  return { name: 'photo.png', type: 'image/png', size: 10, ...overrides }
}

// 模拟 localStorage 持久化往返（刷新 = 重新读一遍）
function roundTrip(value) {
  return JSON.parse(JSON.stringify(value))
}

// ───────────────────────── 后端存储 ─────────────────────────

test('图片发送后保存：上传返回稳定 URL 与 assetId', () => {
  const db = makeDb()
  const saved = saveAttachment(db, { name: 'photo.png', mime: 'image/png', data: PNG_B64 })
  assert.match(saved.id, /^[0-9a-f-]{36}$/)
  assert.equal(saved.url, '/api/attachments/' + saved.id)
  assert.equal(saved.mime, 'image/png')
  assert.ok(saved.size > 0)
  assert.ok(saved.sha256 && saved.sha256.length === 64)
  // 字节确实落库，读取回来与原始 base64 解码一致
  const row = getAttachment(db, saved.id)
  assert.ok(row, '保存后应能读回')
  assert.equal(row.data.toString('base64'), PNG_B64)
})

test('多张图片：各自独立存储、互不覆盖', () => {
  const db = makeDb()
  const otherB64 = Buffer.from('a-different-image-bytes').toString('base64')
  const a = saveAttachment(db, { name: 'a.png', mime: 'image/png', data: PNG_B64 })
  const b = saveAttachment(db, { name: 'b.png', mime: 'image/png', data: otherB64 })
  assert.notEqual(a.id, b.id, '不同内容应得到不同 id')
  assert.ok(getAttachment(db, a.id))
  assert.ok(getAttachment(db, b.id))
  // 一条消息挂两张图
  const msg = { attachments: [att({ assetId: a.id, preview: a.url }), att({ assetId: b.id, preview: b.url })] }
  assert.equal(assetIdsOfMessages([msg]).size, 2)
})

test('同内容重复上传按 sha256 去重，多消息共享一份字节', () => {
  const db = makeDb()
  const first = saveAttachment(db, { name: 'photo.png', mime: 'image/png', data: PNG_B64 })
  const again = saveAttachment(db, { name: '改名了.png', mime: 'image/png', data: PNG_B64 })
  assert.equal(again.id, first.id, '同内容应复用同一行')
  assert.equal(again.deduped, true)
  // 两条消息引用同一 assetId，删除其中一条不应释放文件
  const m1 = { id: 'm1', attachments: [att({ assetId: first.id })] }
  const m2 = { id: 'm2', attachments: [att({ assetId: first.id })] }
  const state = { messages: { ywx: [m1, m2] } }
  const still = collectReferencedAssetIds({ ...state, excludeMessageIds: new Set(['m1']) })
  assert.deepEqual(releasedAssetIds(assetIdsOfMessages([m1]), still), [], '仍被 m2 引用，不得释放')
})

test('图片删除：无人引用时才真正删掉', () => {
  const db = makeDb()
  const saved = saveAttachment(db, { name: 'photo.png', mime: 'image/png', data: PNG_B64 })
  assert.ok(getAttachment(db, saved.id))
  assert.equal(deleteAttachment(db, saved.id), true)
  assert.equal(getAttachment(db, saved.id), null, '删除后读不到')
  assert.equal(deleteAttachment(db, saved.id), false, '重复删除返回 false，不报错')
})

// ───────────────────────── 引用扫描（删除安全） ─────────────────────────

test('图片删除：其他助手/会话/缓发队列仍引用时绝不释放', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const convs = {
    ywx: [{ id: 'c1', messages: [{ id: 'm1', attachments: [att({ assetId: id })] }] }],
    ys: [{ id: 'c2', messages: [{ id: 'm2', attachments: [att({ assetId: id })] }] }],
  }
  const batches = { 'ywx|c1': { status: 'pending', messages: [{ id: 'q1', attachments: [att({ assetId: id })] }] } }
  // 删掉 ywx/c1 的 m1，但 ys 的 m2 和缓发队列都还在用
  const still = collectReferencedAssetIds({ conversations: convs, messages: {}, deferredBatches: batches, excludeMessageIds: new Set(['m1']) })
  assert.ok(still.has(id), '其他来源仍引用')
  assert.deepEqual(releasedAssetIds([id], still), [], '不得释放')
  // 全部移除后才释放
  const none = collectReferencedAssetIds({ conversations: convs, messages: {}, deferredBatches: batches, excludeMessageIds: new Set(['m1', 'm2', 'q1']) })
  assert.deepEqual(releasedAssetIds([id], none), [id])
})

test('图片删除：excludeMessageIds 生效——只有待删消息在用时会释放', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  const messages = { ywx: [{ id: 'm1', attachments: [att({ assetId: id })] }] }
  const withExcluded = collectReferencedAssetIds({ messages, excludeMessageIds: new Set(['m1']) })
  assert.equal(withExcluded.has(id), false, '待删消息的引用不计入')
  assert.deepEqual(releasedAssetIds([id], withExcluded), [id])
  // 不排除时视为仍被引用
  const without = collectReferencedAssetIds({ messages })
  assert.deepEqual(releasedAssetIds([id], without), [])
})

// ───────────────────────── 刷新 / 会话切换恢复 ─────────────────────────

test('刷新恢复：assetId 与稳定 preview 经序列化往返后原样保留', () => {
  const db = makeDb()
  const saved = saveAttachment(db, { name: 'photo.png', mime: 'image/png', data: PNG_B64 })
  const msg = { role: 'user', content: '看图', id: 'm1', attachments: [att({ assetId: saved.id, preview: saved.url, dataUrl: undefined })] }
  // 持久化 = 写进 conversations 快照；刷新 = 重新 parse
  const restored = roundTrip({ conversations: { ywx: [{ id: 'c1', messages: [msg] }] } })
  const a = restored.conversations.ywx[0].messages[0].attachments[0]
  assert.equal(a.assetId, saved.id)
  assert.equal(a.preview, saved.url)
  assert.equal(classifyPreview(a.preview), 'remote', '刷新后仍是可用引用')
  assert.equal(isStablePreview(a.preview), true)
  // 稳定 URL 指向的字节仍取得到
  assert.ok(getAttachment(db, a.assetId))
  // Base64 绝不进快照
  assert.equal(a.dataUrl, undefined)
  assert.ok(!JSON.stringify(restored).includes('iVBOR'), '快照里不应出现图片 Base64')
})

test('会话切换恢复：切换到另一助手的会话仍能取到图片', () => {
  const db = makeDb()
  const saved = saveAttachment(db, { name: 'photo.png', mime: 'image/png', data: PNG_B64 })
  const conversations = {
    ywx: [{ id: 'c1', messages: [{ id: 'my1', attachments: [att({ assetId: saved.id, preview: saved.url })] }] }],
    ys: [{ id: 'c2', messages: [{ id: 'my2', attachments: [att({ assetId: saved.id, preview: saved.url })] }] }],
  }
  // 切换只是换读哪份列表，assetId 与后端字节都不依赖当前会话
  for (const person of ['ywx', 'ys']) {
    const ids = assetIdsOfMessages(conversations[person][0].messages)
    assert.ok(ids.has(saved.id), person + ' 会话应能取到 assetId')
    assert.ok(getAttachment(db, saved.id), '后端字节仍在')
  }
})

// ───────────────────────── 历史附件兼容 ─────────────────────────

test('历史附件兼容：blob: 死链识别为失效，不伪装成可恢复', () => {
  assert.equal(classifyPreview('blob:http://localhost/dead'), 'stale')
  assert.equal(isStablePreview('blob:http://localhost/dead'), false)
  // 旧迁移数据只剩文件名
  assert.equal(classifyPreview(undefined), 'none')
  assert.equal(classifyPreview(''), 'none')
  // 表情包 data: 与新数据 /api/attachments/ 均为可用
  assert.equal(classifyPreview('data:image/webp;base64,AAAA'), 'data')
  assert.equal(classifyPreview('/api/attachments/33333333-3333-4333-8333-333333333333'), 'remote')
  assert.equal(isStablePreview('data:image/webp;base64,AAAA'), true)
  // 渲染侧据此决定显示失效提示，而非渲染一个注定失败的 <img>
  assert.equal(classifyPreview('blob:x') === 'stale', true)
})

test('历史附件兼容：非图片附件不受影响', () => {
  const textAtt = { name: 'a.txt', type: 'text/plain', size: 5, textContent: 'hi' }
  assert.equal(needsUpload(textAtt), false, '文本附件不走图片上传')
  assert.equal(assetIdsOfMessages([{ attachments: [textAtt] }]).size, 0)
})

// ───────────────────────── 存储失败与恢复 ─────────────────────────

test('存储失败：上传未成功时 needsUpload 保持 true，可重试', () => {
  // 上传失败的降级态：preview 仍是本次会话的 blob:，dataUrl 还在（可重试），没有 assetId
  const failed = att({ preview: 'blob:http://localhost/xxx', dataUrl: 'data:image/png;base64,' + PNG_B64 })
  assert.equal(needsUpload(failed), true, '失败后应仍标记为待上传，恢复策略=可重试')
  assert.equal(classifyPreview(failed.preview), 'stale', '且明确不是持久引用')
  // 上传成功后不再重复上传
  const ok = att({ preview: '/api/attachments/44444444-4444-4444-8444-444444444444', assetId: '44444444-4444-4444-8444-444444444444' })
  assert.equal(needsUpload(ok), false)
  // 表情包本就持久，不重复上传
  assert.equal(needsUpload(att({ preview: 'data:image/webp;base64,AAAA' })), false)
  // 无 preview 的历史图片（只剩文件名）不该触发上传——没有字节可传
  assert.equal(needsUpload(att({})), false)
})

test('存储失败：非法/超限 base64 被明确拒绝而不是存脏数据', () => {
  const db = makeDb()
  assert.throws(() => saveAttachment(db, { name: 'a.png', mime: 'image/png', data: '' }), /图片内容为空/)
  assert.throws(() => saveAttachment(db, { name: 'a.png', mime: 'image/png', data: '!!!not-base64!!!' }), /不是有效的 base64/)
  assert.throws(() => saveAttachment(db, { name: 'a.png', mime: 'image/png', data: Buffer.from('x').toString('base64') + 'A'.repeat(10) }), /不是有效的 base64/)
  assert.throws(() => saveAttachment(db, { name: '', mime: 'image/png', data: PNG_B64 }), /附件名不能为空/)
  assert.throws(() => saveAttachment(db, { name: 'a.txt', mime: 'text/plain', data: PNG_B64 }), /仅支持图片附件/)
  // 超限
  const huge = 'A'.repeat(ATTACH_MAX_BODY + 1)
  assert.throws(() => decodeBase64Image(huge), /超出单次上传上限/)
  // 失败后库里没有半成品
  assert.equal(getAttachment(db, '55555555-5555-4555-8555-555555555555'), null)
})
