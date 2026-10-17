# 私人 AI 前端 · 空房子原型

独立于 Kelivo 的 React + TypeScript + Vite 安卓优先网页原型，后端使用 Node.js 与 SQLite。

## 当前已实现
- 书页风格首页、房间目录与底部导航
- 晏未晞、言朔各自独立聊天记录、人物设定、长期记忆和世界书
- 世界书关键词匹配与常驻条目注入当前轮提示词
- OpenAI 兼容 Chat Completions 流式聊天（API Key 目前只保存在当前页面会话中）
- 图片/文件选择与附件预览；常见文本文件读取
- 登录保护、服务端 SQLite 云端状态保存
- 远程 MCP Streamable HTTP 配置，Bearer Token 服务端 AES-256-GCM 加密保存
- MCP 服务按人物隔离；可查看工具、手动调用工具
- 聊天请求按当前人物获取其 MCP 工具，并支持兼容 OpenAI tool calling 的模型自动调用；每轮最多 5 次模型回合
- MCP 工具列表默认折叠

## 尚未实现或仍需验证
- 使用真实远程 MCP 与真实模型完成端到端自动工具调用验证
- 定时任务的后台调度与触发执行（目前只有基础任务列表）
- Serein/其他记忆引擎的正式接入
- PocketBase 实时客厅/群聊
- 内嵌浏览器、相册、播放器等娱乐房模块
- 图片和普通文件的持久化云端上传
- 全局 UI 主题与 MCP 设置页插画/图案（待统一设计）

## 本地运行
```bash
npm install
npm run dev
npm run build
npm run lint
```

后端需要设置 `AI_HOME_PASSWORD`（至少 16 字符）与 `AI_HOME_SECRET_KEY`（32 字节十六进制密钥）。可选设置 `AI_HOME_DB` 和 `AI_HOME_ALLOWED_ORIGIN`。服务默认监听 `127.0.0.1:4180`，应通过 HTTPS 反向代理对外提供访问。

不修改 Kelivo，不占用现有 PocketBase 服务。
