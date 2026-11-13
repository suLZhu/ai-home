// 工具权限页面的中文显示层（P1-8）。
// 只负责「显示」：内部 mode（auto/ask/deny）与工具 ID 一律保持不变，
// 服务端 ToolPolicy.mjs 的校验值、请求体、落库字段完全不受影响。

export const POLICY_MODES = ['auto', 'ask', 'deny']

export const POLICY_LABELS = {
  auto: '自动执行',
  ask: '执行前询问',
  deny: '禁止执行',
}

export function policyLabel(mode) {
  return POLICY_LABELS[String(mode)] || String(mode || '')
}

// 顶部说明：整段中文化，不再出现 auto / ask / deny 这类开发者术语。
export const POLICY_HELP = '自动执行：工具直接运行 · 执行前询问：每次先等你批准 · 禁止执行：一律拒绝。权限由服务端强制生效，模型无法绕过。'

// 工具 ID → 中文用途。ID 原样保留在页面上（便于对照日志），中文用途只是辅助说明。
const TOOL_PURPOSES = {
  ledger_add: '共享记账 · 记一笔',
  ledger_add_entry: '共享记账 · 记一笔',
  ledger_list: '共享记账 · 查看账目',
  memory_search: '搜索长期记忆',
  memory_add: '新增长期记忆',
  worldbook_search: '搜索世界书',
  worldbook_create_entry: '世界书 · 新增条目',
  worldbook_update_entry: '世界书 · 更新条目',
  worldbook_search_entries: '世界书 · 搜索条目',
  scheduled_task_create: '创建定时任务',
  scheduled_task_list: '查看定时任务',
  scheduled_task_manage: '管理定时任务',
}

export function toolPurpose(toolId) {
  const id = String(toolId || '')
  if (TOOL_PURPOSES[id]) return TOOL_PURPOSES[id]
  // 未登记的工具（含 MCP 动态工具）不编造用途：返回空串，UI 只显示原始 ID。
  return ''
}
