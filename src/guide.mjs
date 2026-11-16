// 《栖间使用说明》——给用户看，也给 AI 读。
// 展示在 设置 → 系统与权限 → 说明；运行时挂在 window.AiHomeGuide。
// 助手系统提示里只注入 BRIEF 摘要，完整说明按需读取，避免每次占上下文。

export const GUIDE_MARKDOWN = `# 栖间使用说明

## 一、页面结构

- **主页**：时钟、日期、问候、两位助手的未读与上次聊天、今天的事（认识第几天 / 日程 / 记忆新增）。
- **房间**：插画式场景，物件就是入口——书架=世界书、显示器=聊天、路由器=MCP、相框=技能、地毯=记忆、台灯=设置。
- **聊天**：全屏对话，返回依次是 聊天 → 房间 → 主页 → 退出。
- **菜单（左上角）**：历史聊天、助手工具（主动任务 / 自主行动）、主页 / 房间切换、最底部设置。

## 二、设置（5 个一级）

1. **助手设定**：世界书 / MCP / 技能 / 记忆（按助手隔离）；
2. **模型与费用**：供应商、用量统计；
3. **外观与聊天**：主题（目前一套默认外观，可调字体/圆角/字号）、聊天展示；
4. **工作区**：助手工具、本机文件（读写 / Git / 命令）；
5. **系统与权限**：权限状态、应用锁、备份与数据、关于、本说明。

## 三、房间是开放场景

房间布局是一份 JSON，AI 或用户都可以改，想画成公园、星空、太空都可以：

\`\`\`js
AiHomeRoom.get()      // 读取当前布局
AiHomeRoom.set(layout) // 保存并立即生效
AiHomeRoom.reset()    // 恢复默认小家模板
AiHomeRoom.template   // 只读模板
\`\`\`

布局结构：

\`\`\`json
{
  "name": "星空",
  "background": { "css": "radial-gradient(circle at 30% 20%, #1b2340, #070a17 70%)" },
  "items": [
    { "id": "moon", "kind": "visual", "x": 70, "y": 8, "w": 18, "h": 18,
      "style": { "borderRadius": "50%", "background": "#f7e7b2" } },
    { "id": "chat", "kind": "hotspot", "action": "chat", "label": "聊天",
      "x": 18, "y": 48, "w": 30, "h": 10, "style": { "color": "#fff" } }
  ]
}
\`\`\`

- 位置与尺寸都是百分比（x/y/w/h），适配任意屏幕；
- style 支持任意 CSS：圆角、渐变、描边、字号、阴影；
- 带 action 的物件可点：chat / world / mcp / skill / memory / settings；
- 不带 action 就是纯装饰。

## 四、世界书 / MCP / 技能

- **世界书**：条目可设置关键词、注入位置（system 顶部/尾部）、绑定助手；命中后进入提示词。
- **MCP**：按助手绑定服务，可测试连通。
- **技能**：导入 SKILL.md（带 YAML frontmatter 的 name/description），启用后自动进入系统提示；技能太多时会自动截断。

## 五、记忆

- 每个助手独立记忆库；记忆面板可搜索、置顶、删除；
- 聊天时自动召回相关记忆，写入长期记忆库。

## 六、应用锁（Android）

- 需要无障碍权限；只监听前台应用切换，不读屏、不模拟点击；
- 勾选要锁的应用，打开时显示 PIN 解锁页，支持 5 分钟临时解锁。

## 七、提醒与定时

- 直接对助手说「几点提醒我…」，会创建定时任务；
- 提醒会发进聊天；本地模式也支持，不依赖云端；
- 也可在 菜单 → 助手工具 → 主动任务 里手动管理。

## 八、给 AI 的提示

- 需要完整说明时读取 window.AiHomeGuide（本页 markdown）；
- 修改房间前先 AiHomeRoom.get()，在原有 items 上增删，别整份覆盖；
- 房间布局按助手隔离，存储键 ai-home.roomLayout.<person>。
`

export const GUIDE_BRIEF = `【栖间速查】应用有 主页/房间/聊天 三块；菜单在左上角，含历史聊天、助手工具和设置。设置分 助手设定（世界书/MCP/技能/记忆）、模型与费用、外观与聊天、工作区、系统与权限。房间是开放场景：window.AiHomeRoom.get()/set(layout)/reset()，layout 用 background + items（x/y/w/h 百分比、style、emoji/text、action∈chat/world/mcp/skill/memory/settings）。完整说明见 设置→系统与权限→说明，或 window.AiHomeGuide。`
