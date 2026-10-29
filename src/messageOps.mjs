// 消息操作辅助（纯函数，便于单测）：
// - resolveRegenerateContext：定位「重新生成」的目标 AI 回复与触发它的用户消息
// - alignMessageIds：给缺 id 的历史消息补 id，并把视图侧 id 与持久化侧对齐
//   （编辑 / 删除 / 重新生成都按 id 定位；同一份消息在 messages 视图与
//    conversations 持久化里必须拿到同一个 id，修改才能同时写进两边）。

// 仅会话里「最新一条」AI 回复可以重新生成：必须是最后一条消息、
// 且它前面能找到触发它的用户消息；定时任务结果（taskRunId）不参与。
export function resolveRegenerateContext(list, assistantId) {
  if (!Array.isArray(list)) return null
  const idx = list.findIndex(m => m && m.id === assistantId)
  if (idx < 0) return null
  const target = list[idx]
  if (!target || target.role !== 'assistant' || target.taskRunId) return null
  if (idx !== list.length - 1) return null
  let i = idx - 1
  while (i >= 0 && list[i] && list[i].role !== 'user') i--
  if (i < 0) return null
  if (!list[i] || typeof list[i].content !== 'string') return null
  return { userIndex: i, assistantIndex: idx, userMessage: list[i], original: target }
}

// 给缺 id 的消息补稳定 id；无缺失时返回原数组引用（effect 依赖它才能收敛、不循环）。
function patchIds(list) {
  const arr = Array.isArray(list) ? list : []
  let changed = false
  const out = arr.map(m => {
    if (m && !m.id) {
      changed = true
      return { ...m, id: crypto.randomUUID() }
    }
    return m
  })
  return changed ? { list: out, changed: true } : { list: arr, changed: false }
}

function sameContent(a, b) {
  return a.length === b.length && a.every((m, i) => m && b[i] && m.role === b[i].role && m.content === b[i].content)
}

// viewList = 当前视图（messages 状态）里这条会话的消息；convList = conversations 持久化侧。
// 返回 { view, conv, changed }：
// - 持久化侧是 id 的权威：内容逐条一致时，视图直接采用持久化侧的 id；
// - 内容不一致（两份数据漂移）时各自独立补齐，绝不覆盖任何一侧的内容；
// - 两边都无缺失且已对齐时返回原引用，changed=false。
export function alignMessageIds(viewList, convList) {
  const conv = patchIds(convList)
  let view = Array.isArray(viewList) ? viewList : null
  let viewChanged = false
  if (view) {
    if (sameContent(view, conv.list)) {
      let diff = false
      for (let i = 0; i < view.length; i++) {
        if (!view[i] || view[i].id !== conv.list[i].id) { diff = true; break }
      }
      if (diff) {
        view = view.map((m, i) => ({ ...m, id: conv.list[i].id }))
        viewChanged = true
      }
    } else {
      const patched = patchIds(view)
      view = patched.list
      viewChanged = patched.changed
    }
  }
  return { view, conv: conv.list, changed: conv.changed || viewChanged }
}
