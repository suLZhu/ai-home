# 私人 AI 前端 · 空房子原型

独立于 Kelivo 的 React + TypeScript + Vite 安卓优先网页原型，后端使用 Node.js 与 SQLite。

## 当前已实现
- 书页风格首页、房间目录与底部导航
- 晏未晞、言朔（`assistant-yanweixi` / `assistant-yanshuo`，显示名可改、数据归属不随显示名漂移）各自独立聊天记录、人物设定、长期记忆和世界书
- 世界书关键词匹配与常驻条目注入当前轮提示词
- OpenAI 兼容 Chat Completions 流式聊天；API Key 经 AES-256-GCM 加密保存在服务端
- 图片/文件选择与附件预览；常见文本文件读取
- 登录保护、服务端 SQLite 云端状态保存
- 远程 MCP Streamable HTTP 配置，Bearer Token 服务端加密保存；MCP 服务按人物隔离
- **统一 Agent Runner（服务端）**：聊天/定时任务/主动触发共用同一条最多 5 轮的工具循环；AbortController 取消、工具失败以 `role=tool` 回传模型、写操作不自动重试、读操作一次重试、身份由服务端从运行记录确定
- **工具调用看板**：真实执行记录（7 态状态机）、Agent 运行卡片、SSE 实时推送、运行取消
- **工具权限策略**：auto / ask / deny；ask 挂起等待用户批准/拒绝，审批超时或重启后不可重放
- **定时任务接入 Runner**：到期任务原子认领、绑定原 conversationId、经统一工具循环执行
- **Jiwen 积温主动触发**：热量按真实流逝时间累积，满温经统一 Runner 真实执行，答案投递收件箱；沉默/失败绝不假造消息；遵守免打扰
- **记忆治理（DuduLove 风格轻量版）**：模型提议先进 `candidate`，用户确认后才 `active`；拒绝留墓碑防重复提议；Recall Ledger 30 分钟窗口内同一会话不重复注入；看板可跳回来源会话
- **Fake MCP + 自动化测试**：`npm test` 跑 15 项验收（工具成功/失败回传/并行对应/MCP 掉线/审批/取消/幂等/隔离/会话绑定/迁移）

## 框架状态与下一步
详细模块边界、接口与未完成项见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 尚未实现或仍需验证
- 使用真实远程 MCP 与真实模型完成端到端自动工具调用验证（自动化测试用脚本化模型 + 进程内 Fake MCP）
- Serein/其他记忆引擎的正式接入（已预留 MemoryProvider 接口，当前为 SQLiteMemoryProvider）
- PocketBase/服务端共享存储、实时客厅/群聊（目前客厅仅为留言原型）
- 内嵌浏览器、相册、播放器等娱乐房模块
- 图片和普通文件的持久化云端上传
- 主动消息的 PWA/ntfy 推送通道（当前走应用内收件箱）

## 本地运行
```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

后端需要设置 `AI_HOME_PASSWORD`（至少 16 字符）与 `AI_HOME_SECRET_KEY`（32 字节十六进制密钥）。可选设置 `AI_HOME_DB` 和 `AI_HOME_ALLOWED_ORIGIN`。服务默认监听 `127.0.0.1:4180`，应通过 HTTPS 反向代理对外提供访问。

### Android 局域网一键启动（npm start）
```bash
npm start    # scripts/start-server.mjs
```
脚本自动完成：读取 `.ai-home.env`（缺 `AI_HOME_PASSWORD` 则生成 24 位密码并保存）→ 以
`AI_HOME_BIND=0.0.0.0` + `AI_HOME_ALLOWED_ORIGIN=https://localhost` 启动服务 →
探测局域网 IP（排除 Clash fake-IP/链路本地等不可达地址）→ 打印手机端要粘贴的 API 地址与登录密码。

手机装好 APK 后，在「设置 → 开发者 → API 服务器地址」填入打印的 `http://<局域网IP>:4180`，
输入打印的密码登录即可（7 天免登）。登录凭证由服务端以 token 返回，客户端自动附加
（JSON 走 `Authorization: Bearer`，图片与 SSE 走 `?token=`），跨源 http 不依赖 Cookie，
无需 HTTPS 反向代理。多网卡时可在 `.ai-home.env` 加 `AI_HOME_LAN_IP=<你的局域网IP>` 强制指定。

不修改 Kelivo，不占用现有 PocketBase 服务。
