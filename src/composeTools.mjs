// 输入栏工具：微信式一排小图标，不再把低频入口收进「+」Bottom Sheet。
// 这里只描述「显示意图」，真实行为仍在 App 里按 id 分支；图标用 public/msg-icons 下的位图，
// 避免部分 Android WebView 画不出内联 SVG。

/** 输入栏一排工具（顺序即显示顺序）。 */
export const COMPOSE_TOOLS = [
  { id: 'emoji', label: '表情', icon: 'emoji' },
  { id: 'model', label: '模型', icon: 'model' },
  { id: 'bind', label: '世界书 / MCP', icon: 'bind' },
  { id: 'attach', label: '图片 / 文件', icon: 'attach' },
  { id: 'tools', label: '工具', icon: 'tools' },
  { id: 'search', label: '查找聊天记录', icon: 'search' },
]

/** 工具 id 列表（回归测试与角标逻辑共用）。 */
export const COMPOSE_TOOL_IDS = COMPOSE_TOOLS.map(t => t.id)

/** 每个工具都必须有中文标签与位图图标名，且 id 不重复。 */
export function composeToolGroups() {
  const ids = COMPOSE_TOOL_IDS
  return {
    allIds: ids,
    duplicates: ids.filter((id, i) => ids.indexOf(id) !== i),
    missingIcon: COMPOSE_TOOLS.filter(t => !t.label || !t.icon).map(t => t.id),
  }
}
