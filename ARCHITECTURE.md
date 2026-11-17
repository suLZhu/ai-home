# 空房子框架说明（Agent 化后，4.8）

## 本地模式（4.8 起默认）

`apiFetch()`（`src/apiBase.mjs`）在没有配置服务器地址时，把 `/api/*` 直接交给浏览器内的 `src/localBackend.mjs` 应答，**不发网络请求**：

```
/api/chat          直连上游 OpenAI 兼容接口（流式透传 + 时间注入 + 多 Key 换用）
/api/models        直连上游模型列表
/api/state         本地快照（localStorage，上限 4.5 MB）
/api/memory/*      记忆检索 + 治理记录（candidate/active/archived/rejected）+ transition + PATCH
/api/workspace/*   本机工作区
其他 /api/*        同源服务器的等价实现或明确报错
```

配置了服务器地址后自动回到「云端代理模式」，行为与之前一致；两种模式的数据互不影响。

本地模式下额外接了两块：

- `memoryLocalOrganize.mjs`：按「轮数 / 字数 / 天数」判断是否整理，用当前模型把新对话提炼成记忆；`tidyMemoryLibrary()` 负责合并去重、改写已有记忆（源条目归档）。
- `memoryModels.mjs`：整理模型 / 向量模型两个独立槽位；`embedText()` 调 `/v1/embeddings`，`cosine()` 供聊天召回排序，失败退关键词。

## 原则
- 这是独立的新项目，不修改 Kelivo，也不复用 Kelivo 的用户数据。
- 所有数据归属使用稳定 `assistantId`（如 `assistant-yanweixi`）；`displayName` 仅用于界面展示，改名不改变数据归属。身份由服务端根据运行记录确定，模型无法在工具参数里冒充其他人物。
- 暂时不绑定任何特定模型。模型通过 OpenAI-compatible adapter（`src/server/agent/OpenAICompatibleProvider.mjs`）非流式接入，工具循环需要完整的一轮 assistant 回复（含全部 tool_calls）才能执行。
- 先把数据结构、页面入口、权限边界和服务端接口稳定下来，再根据实际模型能力调整体验。

## 统一 Agent Runner

聊天、定时任务、主动唤醒共用同一条执行管线（`src/server/agent/`）：

```
AgentRunStore   运行记录（agent_runs，含 idempotency_key、conversation_id、task_id）
AgentRunner     ≤5 轮工具循环；AbortController 取消；身份/凭证服务端解析
ToolRegistry    内置工具（memory_search/memory_add/worldbook_search/ledger_list/ledger_add）；聊天工具循环另有定时任务工具（scheduled_task_list/create/manage，走 /api/tasks 与 /api/workflows/manage）
                + 按人物隔离、按连接命名空间化的 MCP 工具；单个 MCP 掉线不阻断运行
ToolExecutor    策略门（auto/ask/deny）→ tool_call_logs 落账 → 调用 → 终态 → 事件
ToolPolicy      每助手每工具的权限等级，服务端强制，模型无法绕过
ApprovalGate    ask 挂起；进程内 resolver，重启后旧挂起不可重放（只能清理）
AgentEventBus   run/round/tool 事件，SSE 推送给看板
TaskScheduler   到期任务原子认领（乐观锁），经同一 Runner 执行，绑定原 conversationId
ProactiveHeat   Jiwen 积温：elapsed×rate×mode 累积，满温 → wake → 统一 Runner
                → 答案经 deliver 回调投递收件箱；沉默/失败绝不假造消息
MemoryStore     记忆治理：candidate/active/archived/rejected 状态机 + 墓碑去重
                + Recall Ledger + FTS5(trigram) 只索引 active
MemoryAutoOrganize  记忆自动整理：每 5 分钟 tick，按 last_run_at + 新增轮数/字数/天数
                （任一满足）决定是否经统一 Runner 提炼新材料；结果只进候选区
OpenAICompatibleProvider  非流式 chat 适配器；上游失败统一包装为 502
fakeMcp.mjs     进程内 Fake MCP（echo/delayed_success/always_fail/write_once/
                requires_approval/large_result），仅供测试注入
```

### 硬规则
- 每次运行最多 5 个模型回合（`MAX_ROUNDS`，硬上限）。
- 工具失败以 `role=tool` 回传模型，由模型决定重试/换方法/如实说明；运行本身不因工具失败而崩溃。
- 写操作（`readOnly: false`）不自动重试；读操作最多一次自动重试。工具级超时 30 秒。
- `policy=ask` 的工具挂起等待用户批准/拒绝；拒绝结果以 `[未批准]` 回传模型；审批 5 分钟超时。
- 每次工具调用（含失败/取消/被拒）都写入 `tool_call_logs`，终态幂等、eventId 去重、Token 等秘密脱敏。
- `POST /api/agent/runs` 支持 `idempotencyKey`：同键返回原运行（`reused: true`），绝不重复执行写操作。
- 服务重启时把孤儿 `running` 运行标记为 `failed/SERVER_RESTART`，绝不永远转圈。

## 模块与状态

| 模块 | 当前框架 | 后续适配 |
|---|---|---|
| 房间/聊天 | 独立房间、多会话、流式请求、真实工具调用状态卡 | — |
| 人物设置 | 角色名称、描述、定义、开场白 | 角色卡导入导出 |
| 世界书 | 人物隔离、关键词/常驻条目召回 | 优先级、预算、导入导出 |
| 长期记忆 | 分类条目 + 治理状态机（候选/生效/归档/拒绝）、Recall Ledger、跳回来源会话、**本地自动整理 + AI 整理记忆库 + 可选向量召回** | 外接 MemoryProvider |
| 定时任务 | 持久化队列、到期扫描、原子认领、经 Runner 执行、绑定会话 | 重试策略细化 |
| MCP | 远程 Streamable HTTP、加密 Token、按人物隔离、审批策略、真实执行落账 | 超时分级、更多传输方式 |
| 主动生活 | Jiwen 积温、免打扰、收件箱投递、调试轨迹 | PWA/ntfy 推送、日记写入 |
| 供应商 / 模型 | 多供应商多 Key、OpenAI 兼容端点、模型编辑（模态/能力/上下文/内置工具）、模型测试卡片 | 更多厂商协议 |
| 外观 / 美化包 | tokens + 背景（色/图）+ 气泡 + 字体 + 图标；整机皮肤、背景取色（明暗自适应）、线性图标集 | 整套图标资源包、状态栏联动 |
| 工具调用看板 | 运行卡片、调用记录（7 态）、SSE、审批、策略、记忆治理 | — |
| 客厅/娱乐房 | 留言原型 / 模块入口 | 实时同步、按需接入 |

## 服务端接口（Agent 相关新增）
- `POST /api/agent/runs`（body 可含 `idempotencyKey`、`conversationId`）· `GET /api/agent/runs`
- `GET /api/agent/runs/:id`（运行 + 工具日志）· `POST /api/agent/runs/:id/cancel`
- `GET /api/agent/events`（SSE）· `GET/POST /api/agent/approvals`、`POST /api/agent/approvals/:logId`
- `GET/PUT /api/agent/policies`
- `GET /api/tool-logs`、`POST /api/tool-logs`、`PUT /api/tool-logs/:id`
- `GET /api/proactive`（含 heat）、`POST /api/proactive`（configure/wake/cool/dismiss）
- 记忆治理：`GET/POST /api/memory/records`、`GET /api/memory/records/:id`、`POST /api/memory/records/:id/transition`
- 记忆自动整理：`GET/PUT /api/memory/auto-config`（策略 + 待整理状态）、`POST /api/memory/auto-config/run`（立即整理，忽略阈值）
- 本机工作区：`GET/PUT /api/workspace`（根目录 + 启用/写入/命令开关）、`POST /api/workspace/run`（list/read/search/write/replace/delete/git/git_commit/exec，路径强制限制在根目录内）
- 定时任务 `POST /api/tasks`、`POST /api/workflows/manage` 支持 `conversationId`

## 数据库迁移（全部幂等，可重复启动）
- `agent_runs`：`task_id`、`idempotency_key`（唯一索引）列自动补加。
- `scheduled_tasks`：`created_by`、`temporary`、`conversation_id` 列自动补加。
- `proactive_events`：`run_id` 列自动补加（PRAGMA 探测）。
- `tool_call_logs`：7 态迁移（success→succeeded、error→failed、超时 running→timed_out）。
- 身份迁移：`mcp_connections`/`api_keys`/`scheduled_tasks` 去除 person CHECK 约束并把中文名重映射为 id；快照 v2→v3（键换稳定 id），重复运行不复制不丢失。
- 新表：`tool_policies`、`proactive_settings`、`proactive_heat`、`memory_records`、`recall_ledger`、`memory_records_fts`（trigram）、`memory_auto_config`（每人一条整理策略 + 水位线）、`workspace_config`（每人一条本机工作区配置）。

## 数据与安全
- MCP Token 与模型 API Key 使用服务端 AES-256-GCM 加密；`AI_HOME_SECRET_KEY` 丢失后无法解密旧凭证。
- 远程 MCP 仅允许 HTTPS，拒绝本地/私有网络地址。
- 工具日志对 Token/Authorization/自定义请求头脱敏；参数默认只存安全摘要。
- 应用状态快照大小上限 2 MB；附件原文件暂未持久化上传。

## 测试与发布
```bash
npm run build      # tsc -b && vite build
npm run lint       # oxlint（0 error，少量 hooks 风格警告）
node --check src/server.mjs
npm test           # 全量 node:test（Agent 验收 / 记忆 / 备份 / 线路 / 本地后端 等 60+ 项）
```

发版：`package.json` 的 `version` 与 `android/app/build.gradle` 的 `versionName` / `versionCode` 一起改；`main` 上打 tag（如 `v4.8`）。

自动化测试用脚本化模型（fetch stub）+ 进程内 Fake MCP 驱动真实 Runner/Executor/审批门；真实模型 + 远程 MCP 的端到端验证仍待真实凭证。
