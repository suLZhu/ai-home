// 图片附件的稳定引用判定与引用扫描（纯函数，storage/网络无关，便于单测）。
//
// 背景：消息里的 preview 历史上是 blob: URL（App.tsx:1498 创建、随消息持久化），
// 刷新即死链。改造后图片字节存后端，preview 持久化为 /api/attachments/<id> 稳定 URL，
// 另有 assetId 作为标识。本模块负责：
//   1) 判断一个 preview 是否已经是持久可靠的引用
//   2) 删除消息/移除附件时扫描全局引用，算出真正可安全删除的 assetId

// preview 是否为「刷新后依然有效」的持久引用。
// - /api/attachments/<id>：新数据，后端存字节
// - data:：图片表情包，本就随消息持久（本仓既有能力，不改）
// - blob: / 缺失：不可靠，刷新即失效
export function isStablePreview(preview) {
  if (typeof preview !== 'string' || !preview) return false
  return preview.startsWith('/api/attachments/') || preview.startsWith('data:')
}

// 渲染分类，用于给出「明确的不可用状态」而不是伪装成正常图片。
//   remote/data → 正常加载；stale → 需展示失效态（blob: 死链）；none → 文件名占位
export function classifyPreview(preview) {
  if (typeof preview !== 'string' || !preview) return 'none'
  if (preview.startsWith('data:')) return 'data'
  if (preview.startsWith('/api/attachments/')) return 'remote'
  if (preview.startsWith('http://') || preview.startsWith('https://')) return 'remote'
  return 'stale'
}

// 该附件是否需要在进消息前上传换取稳定引用（图片、且当前 preview 不可靠）。
// dataUrl 是上传的唯一字节来源：没有它就无从上传，历史消息里只剩文件名的图片
// 标记为待上传只会制造一次必然失败的假警报，因此直接判定为不需要。
export function needsUpload(attachment) {
  if (!attachment || typeof attachment !== 'object') return false
  if (!attachment.type || !String(attachment.type).startsWith('image/')) return false
  if (attachment.assetId) return false
  if (!attachment.dataUrl) return false
  return !isStablePreview(attachment.preview)
}

// 从一批消息中提取所有 assetId。
export function assetIdsOfMessages(list) {
  const ids = new Set()
  if (!Array.isArray(list)) return ids
  for (const m of list) {
    for (const a of (m && m.attachments) || []) {
      if (a && a.assetId) ids.add(a.assetId)
    }
  }
  return ids
}

// 全局引用扫描：会话（含全部助手）+ 视图镜像 + 待发送队列，三者并集。
// 删除前必须以「全局仍被引用」为准，否则会误删其他消息还在用的文件。
// excludeMessageIds：这些消息即将被删除，它们持有的引用不算数——否则会把
// 「只有待删消息在用」的文件误判成仍被引用而漏删，或反过来。
export function collectReferencedAssetIds({ conversations, messages, pendingSends, excludeMessageIds } = {}) {
  const used = new Set()
  const skip = excludeMessageIds instanceof Set ? excludeMessageIds : new Set(excludeMessageIds || [])
  const visit = (list) => {
    for (const m of assetIdsOfMessages(list)) used.add(m)
  }
  const visitKeeping = (list) => {
    if (!Array.isArray(list)) return
    visit(list.filter(m => !(m && m.id && skip.has(m.id))))
  }
  for (const convs of Object.values(conversations || {})) {
    for (const conv of convs || []) visitKeeping(conv && conv.messages)
  }
  for (const list of Object.values(messages || {})) visitKeeping(list)
  for (const item of Object.values(pendingSends || {})) {
    if (!item || !Array.isArray(item.attachments)) continue
    // 待发送卡片尚未进聊天记录：把它当一条带附件的虚拟消息纳入引用扫描。
    visitKeeping([{ id: item.id, attachments: item.attachments }])
  }
  return used
}

// 差集：本次被移除、且全局已无人引用的 assetId —— 只有这些才允许调 DELETE。
export function releasedAssetIds(removedAssetIds, stillReferenced) {
  const referenced = stillReferenced instanceof Set ? stillReferenced : new Set(stillReferenced || [])
  const out = []
  for (const id of removedAssetIds instanceof Set ? removedAssetIds : (removedAssetIds || [])) {
    if (id && !referenced.has(id)) out.push(id)
  }
  return out
}
