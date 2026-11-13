// 输入栏工具分组（P2-2）：高频常驻输入栏，低频收进「+」Bottom Sheet。
// 只描述「显示分组」：工具 id 与真实行为完全不变，任何工具都不会因为瘦身而失去入口。
// 纯数据 + 纯函数，便于单测校验「两组互斥且覆盖全部工具」。

/** 输入栏常驻高频工具（保持在输入框旁边）。 */
export const PRIMARY_TOOLS = [
  { id: 'emoji', label: '表情' },
  { id: 'model', label: '模型' },
]

/** 「+」Bottom Sheet 里的低频工具与附件入口。action 决定点击后的落地方式。 */
export const MORE_TOOLS = [
  { id: 'image', label: '发送图片', desc: '从相册选择图片', action: 'file' },
  { id: 'file', label: '发送文件', desc: '选择文件作为附件', action: 'file' },
  { id: 'world', label: '世界书', desc: '本次会话绑定的条目', action: 'tray' },
  { id: 'mcp', label: 'MCP', desc: 'MCP 服务与工具', action: 'tray' },
  { id: 'tools', label: '工具', desc: '聊天快捷工具', action: 'tray' },
  { id: 'search', label: '查找聊天记录', desc: '在本会话里搜索', action: 'search' },
]

/** 原输入栏的六个工具 id，用于回归校验「没有工具被瘦身掉」。 */
export const LEGACY_TOOL_IDS = ['emoji', 'model', 'world', 'mcp', 'search', 'tools']

export function composeToolGroups() {
  const primary = PRIMARY_TOOLS.map(t => t.id)
  const more = MORE_TOOLS.map(t => t.id)
  return {
    primary,
    more,
    allIds: [...primary, ...more],
    // 两组不得出现同一个 id，否则「+」里会出现重复入口 / 输入栏依然拥挤。
    duplicates: primary.filter(id => more.includes(id)),
    // 原六个工具里没被任何一组覆盖的（应恒为空）。
    missing: LEGACY_TOOL_IDS.filter(id => !primary.includes(id) && !more.includes(id)),
  }
}
