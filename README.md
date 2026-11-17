# 栖间 · 私人 AI 前端（4.8）

React + TypeScript + Vite + Capacitor 的安卓优先 App。**默认本地模式**：不填服务器地址也能完整使用，聊天、设置、记忆、备份都只存在这台设备；填了服务器地址才走同源 / 云端同步。

- 当前版本：**4.8**（`package.json` 4.8.0 / `android/app/build.gradle` versionName 4.8、versionCode 49）
- 分支约定：`main` 是主支，功能改动直接在主支提交；发布打 tag（`v4.7`、`v4.8`…）

## 已实现（按模块）

### 聊天
- 全屏对话、流式输出、多会话、消息搜索、长按菜单（复制/编辑/重发/删除）
- 上下文压缩：早段压成「前情提要」，原文保留；顶部「前情 · 已压缩 N 条」可展开
- 富文本：Markdown 表格 / 折叠块 / 代码块 / 列表，安全白名单过滤颜色与字号
- 附件：相册选图、文件、文本读取；表情包支持本地上传与图床直链
- 15 种气泡样式（旧信纸、像素、花框、新艺术等），可按助手单独设置

### 模型与供应商
- 供应商中心：OpenAI 兼容 / Google / Claude 三类；每个供应商可存多把 Key（备用优先、主号兜底）
- 配置页：「隐藏 / 启用」同一行，多 Key 模式内联展开；连接设置收窄
- 模型页：点卡片进「编辑模型」，长按进多选；多选条为 全选 / 测试 / 删除 / 退出
- **模型测试小卡片**：文本 / 图片 / 工具三项真打请求，逐项 ✓ / ✗，失败写原因，单项 25 秒超时
- 模型编辑：基本设置 / 高级设置 / 内置工具三页；上下文 128K / 200K / 1M / 自定义
- 订阅账号登录（ChatGPT / Claude / Grok），统一模型线路 + 自动 fallback

### 记忆
- 记忆治理：候选 → 生效 → 归档 / 拒绝（墓碑去重），可跳回来源会话
- **本地 AI 整理**：打开记忆面板时按「轮数 / 字数 / 天数」任一满足，用当前模型把新对话整理成记忆；可选「整理后自动生效」
- **记忆专用模型**：整理模型、向量模型各一个槽位；向量模型可用时聊天召回按余弦相似度排序，不可用自动退回关键词
- **AI 整理记忆库**：把已有记忆合并去重、改写清楚，被合并的源条目归档
- 记忆可视化：星空 / 花园 / 日记本 / 列表四种视图

### 外观
- 美化包（Theme Pack）：单 JSON 或 ZIP（pack.json + 图片/字体），导入即用；助手也能用 `theme_pack_*` 工具切换
- 包能换：tokens、背景（色/图）、气泡样式、字体、图标
- **整机皮肤**：包背景铺满首页 / 设置 / 侧边栏 / 聊天；卡片平铺、只用细线分隔
- **背景取色**：包只给背景色/背景图时自动推导强调色与明暗（暗背景转浅字），tokens 可覆盖
- 图标：统一 24×24 线性 SVG 图标集（`src/icons.tsx`），不再混用 emoji 符号

### 工具与自动化
- 统一 Agent Runner（服务端模式）：聊天 / 定时任务 / 主动触发共用 ≤5 轮工具循环
- 工具策略 auto / ask / deny；审批挂起与超时；工具调用看板（7 态状态机 + SSE）
- MCP：远程 Streamable HTTP，按人物隔离，Token 服务端加密
- 本机工作区：读写文件 / 搜索 / Git / 命令，根目录强制限制，写操作逐次确认
- 房间小组件：AI 可用 HTML/CSS/JS 设计小组件，数据走 `qijian` 数据桥持久化
- 提醒：AlarmManager 到点触发（App 关闭 / 锁屏也可），锁屏全屏提醒，开机恢复
- 联网搜索（DuckDuckGo）与内置浏览器

### 数据
- 分类备份：模型 / 记忆 / 聊天 / 世界书 / MCP / 整体，固定存到「下载/栖间/」
- 本地存储：聊天、设置、记忆都在本机浏览器存储；快照上限 4.5 MB
- 应用更新：APK 更新 + 界面热更新（dist.zip + 清单），可恢复内置界面

## 目录结构

```
src/
  App.tsx            主界面与业务逻辑（房间、聊天、设置、供应商、记忆面板入口）
  MemoryPanel.tsx    记忆面板（整理策略、记忆模型、治理）
  MemoryGovernancePanel.tsx / memoryGovernance.ts  记忆治理与轮询
  memoryLocalOrganize.mjs  本地自动整理 / AI 整理记忆库
  memoryModels.mjs   整理模型 / 向量模型设置与 embedding
  themePack.mjs      美化包解析、应用、背景取色
  icons.tsx          统一线性图标集
  localBackend.mjs   本地模式的后端垫片（/api/* 全部在本机应答）
  server.mjs         可选的服务端（Express 风格 HTTP + SQLite）
  server/agent/      统一 Agent Runner / 工具注册 / 记忆存储
android/             Capacitor 安卓壳
docs/                真机验收清单等
```

## 开发与构建

```bash
npm install
npm run dev        # 浏览器开发
npm run build      # tsc -b && vite build
npm run lint       # oxlint
npm test           # node:test 全量验收
```

安卓打包（Windows，含本地工具链路径时按实际环境替换）：

```bash
node node_modules/vite/bin/vite.js build
npx cap sync android
cd android && gradlew assembleDebug "-Pandroid.aapt2FromMavenOverride="
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

**发版动版本号的地方**：`package.json` 的 `version`、`android/app/build.gradle` 的 `versionName` / `versionCode`。

## 测试

`npm test` 覆盖 Agent 验收、任务投递、时间上下文、记忆自动整理、消息清理、备份、订阅登录、模型线路、附件持久化、本地后端等 60+ 项。

## 已知限制

- 向量检索需要供应商提供 OpenAI 兼容的 `/v1/embeddings`；没有就退关键词
- 本机后台调度依赖 App 打开（记忆整理在打开面板时触发）；真正的定时靠 AlarmManager 的提醒
- 系统状态栏颜色只能改图标亮暗，下拉通知面板无法被 App 主题化
- 服务端模式的 MCP Token / API Key 使用 AES-256-GCM 加密，密钥丢失后无法解密
