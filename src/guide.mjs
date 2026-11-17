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
3. **外观与聊天**：主题（字体、圆角、字号、导入 JSON/ZIP 美化包）、聊天展示；
4. **工作区**：助手工具、本机文件（读写 / Git / 命令）；
5. **系统与权限**：权限状态、应用锁、备份与数据、关于、本说明。

### 4.5 更新补充\n\n- **订阅账号**：登录 ChatGPT / Claude / Grok 后，先在「选择模型」里勾选要启用的模型；未勾选的模型不会进入聊天模型池。候选模型不代表账号实际可用。\n- **美化包**：设置 → 外观与聊天 → 主题 → 全局主题 → 美化包，可导入 \`.json\` 或 \`.zip\`；未导入时显示「还没有安装」。\n- **应用更新**：设置 → 系统与权限 → 关于 → 应用更新，可检查 APK 更新和界面更新；支持恢复内置界面。\n- **自动界面更新**：启动时可按更新清单检查更高版本；不会主动降级。\n- **最近的请求**：聊天加号菜单中查看最近 30 条请求的 token、缓存、耗时和生成速度；旧「黑匣子」诊断面板已移除。\n- **前情摘要**：长对话压缩后，聊天顶部显示「前情 · 已压缩 N 条」，点击查看摘要。\n\n### 4.8 更新补充\n\n- **默认本地模式**：不填服务器地址也能用，聊天、设置、记忆、备份全部存在本机；填了服务器地址才走同源/云端同步。\n- **供应商设置重做**：顶部「供应商 / 订阅账号」同级，「＋ 添加 / 隐藏」在右；隐藏只做筛选；每行显示 Key 数 · 模型数。详情页分「配置 / 模型」两个底部 tab。\n- **模型页**：点卡片进「编辑模型」，长按进多选；多选条是 全选 / 测试 / 删除 / 退出。\n- **模型测试**：多选后点「测试」弹出小卡片，按 文本 / 图片 / 工具 三项真打请求，逐项 ✓ / ✗，失败带原因，单项 25 秒超时。\n- **记忆库本地可用**：自动整理不再依赖服务器，打开面板时按「轮数 / 字数 / 天数」用当前模型整理；记忆模型可分「整理模型」和「向量模型」两槽，向量模型可用时聊天召回按余弦相似度排序，不可用自动退回关键词。\n- **AI 整理记忆库**：记忆治理标题旁的「AI 整理」把已有记忆合并去重、改写清楚，被合并的源条目归档。\n- **美化包铺到整机**：包背景铺满页面，侧边栏/设置/首页都吃包的颜色与线条；卡片全部平铺，只用细线分隔；图标换成同风格的线性 SVG（不再用 emoji 符号）。\n- **背景取色**：包里只给背景色/背景图时，自动推导强调色与深浅（暗背景自动转浅字），可用 tokens 覆盖。\n\n\n## 三、房间是开放场景

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

### 助手改房间的工具

- 「room_get_layout」：读取当前房间布局（JSON）；
- 「room_set_layout」：把设计好的 layout 保存并立即生效；
- 先读再改，在原 items 上增删；没有 action 的物件就是装饰，不会被误当成入口。

## 四、内置浏览器

- 助手调用 「open_web_page」 会在 App 内打开网页，用户可随时关闭；
- 顶部有地址栏（输入网址或搜索，自动补 https）、后退 / 前进 / 刷新 / 回首页；
- 页面标题显示在导航行，加载时有进度条；
- 下载交给系统下载器，完成会出通知；
- 非 http(s) 链接（tel / mailto / 自定义 scheme）会交给对应 App；
- 部分站点禁止被 iframe 嵌入，此时点右上角「↗」用系统浏览器打开。

## 五、世界书 / MCP / 技能

- **世界书**：条目可设置关键词、注入位置（system 顶部/尾部）、绑定助手；命中后进入提示词。
- **MCP**：按助手绑定服务，可测试连通。
- **技能**：导入 SKILL.md（带 YAML frontmatter 的 name/description），启用后自动进入系统提示；技能太多时会自动截断。

## 六、记忆

- 每个助手独立记忆库；记忆面板可搜索、置顶、删除；
- 聊天时自动召回相关记忆，写入长期记忆库。

## 七、应用锁（Android）

- 需要无障碍权限；只监听前台应用切换，不读屏、不模拟点击；
- 勾选要锁的应用，打开时显示 PIN 解锁页，支持 5 分钟临时解锁。

## 八、提醒与定时

- 直接对助手说「几点提醒我…」，会创建定时任务；
- 提醒会发进聊天；本地模式也支持，不依赖云端；
- 也可在 菜单 → 助手工具 → 主动任务 里手动管理。

## 九、给 AI 的提示

- 需要完整说明时读取 window.AiHomeGuide（本页 markdown）；
- 修改房间前先调用 「room_get_layout」（或 AiHomeRoom.get()），在原有 items 上增删，别整份覆盖；
- 房间布局按助手隔离，存储键 ai-home.roomLayout.<person>；
- 可用工具：「room_get_layout」 / 「room_set_layout」（房间）、「theme_pack_list」 / 「theme_pack_apply」 / 「theme_pack_save」（美化包）、「web_search」 / 「open_web_page」（联网与内置浏览器）、「scheduled_task_list/create/manage」（提醒）、「widget_*」（房间小组件）、「memory_search/add」、「worldbook_*」、「ledger_*」、「conversation_search」。

## 十、美化包（Theme Pack）

- 位置：设置 → 外观与聊天 → 主题 → 美化包；
- 一个包可以是单个 .json，也可以是 .zip（根目录 pack.json + bg.png / font.ttf 等资源，自动转 data URL）；导入后出现在列表里，点一下应用、点 × 删除；
- 助手可以直接改：用「theme_pack_list」查看已安装的包、「theme_pack_apply」按名字切换、「theme_pack_save」提交一份新包并立即生效；
- 包里可以一次换掉：色调 tokens、聊天背景、气泡颜色、可选图标。

\`\`\`json
{
  "format": "qijian-theme-pack",
  "version": 1,
  "name": "海盐",
  "author": "you",
  "tokens": { "accent": "#5b8fb9", "surface": "#f4f8fb",
              "field": "#ffffff", "ink": "#33414d", "line": "#dbe6ee" },
  "background": { "color": "#eaf4fb" },
  "bubble": { "style": "soft", "me": "#dcecf7", "ai": "#ffffff" },
  "icons": { "world": "📚", "chat": "💬" }
}
\`\`\`

- tokens 支持 accent / accentSoft / surface / field / ink / muted / line / danger / ok；不给 tokens 时按 background 自动取色；
- background 支持 color 或 image（https 或 data:image），opacity 0.1–1；背景会铺满整机（首页、设置、侧边栏、聊天），不只聊天窗口；
- bubble.style 选 soft / outlined / bare / letter / frame / glass / comic / note / quill / pixel，me/ai 是气泡底色；
- font 支持 family（系统字体名）或 src（data:font/… 内嵌字体，< 2MB）；应用后全站字体切换。
- icons 可用键：world / chat / mcp / skill / memory / settings / assistant / models / appearance / workspace / system，显示为对应 emoji 或图片；
- 激活美化包时，页面卡片改成平铺 + 细线分隔，写作「像手机主题一样整机换皮」。

## 十一、应用更新

- 位置：设置 → 系统与权限 → 关于 → 应用更新；
- 填后端清单地址并保存；清单 JSON：versionCode / versionName / apkUrl / notes；
- 点「检查更新」：发现 versionCode 更大时弹窗，确认后下载并拉起系统安装器；
- 这一步仍需要系统安装确认；完全免安装的热更新要后续接入 Live Update。

### Live Update（4.0 起）

- 清单可同时带 webVersion / webUrl / webChecksum：只替换网页资源，不用装 APK；
- dist.zip 里 index.html 必须在最外层；压缩包内路径必须是 /（Windows 右键压缩会产生反斜杠，插件会报 Unzip failed: Windows path not supported）；
- 服务器需允许跨域（Access-Control-Allow-Origin: *），尽量用 HTTPS；http 仅用于本地调试；
- 下载完成后自动重载；出问题可在「应用更新」里点「恢复内置界面」；
- 版本约定：4.0 为当前原生壳，以后页面/逻辑改动发 4.1、4.2…（只发 dist.zip + 清单），原生部分变了才发新 APK。

`

export const GUIDE_BRIEF = `【栖间速查】应用有 主页/房间/聊天 三块；菜单在左上角，含历史聊天、助手工具和设置。设置分 助手设定（世界书/MCP/技能/记忆）、模型与费用、外观与聊天、工作区、系统与权限。房间是开放场景，可用工具 room_get_layout / room_set_layout 读取和设计（background + items，x/y/w/h 百分比、style、emoji/text、action∈chat/world/mcp/skill/memory/settings）。内置浏览器：web_search 搜索、open_web_page 打开（有地址栏、前进后退、刷新、下载）。完整说明见 设置→系统与权限→说明，或 window.AiHomeGuide。`
