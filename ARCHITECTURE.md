# 空房子框架说明（Agent 化后）

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
| 长期记忆 | 分类条目 + 治理状态机（候选/生效/归档/拒绝）、Recall Ledger、跳回来源会话 | 向量检索、外接 MemoryProvider |
| 定时任务 | 持久化队列、到期扫描、原子认领、经 Runner 执行、绑定会话 | 重试策略细化 |
| MCP | 远程 Streamable HTTP、加密 Token、按人物隔离、审批策略、真实执行落账 | 超时分级、更多传输方式 |
| 主动生活 | Jiwen 积温、免打扰、收件箱投递、调试轨迹 | PWA/ntfy 推送、日记写入 |
| 模型设置 | OpenAI 兼容端点、模型名、服务端加密 Key | 连接测试、多模态探测 |
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
- 定时任务 `POST /api/tasks`、`POST /api/workflows/manage` 支持 `conversationId`

## 数据库迁移（全部幂等，可重复启动）
- `agent_runs`：`task_id`、`idempotency_key`（唯一索引）列自动补加。
- `scheduled_tasks`：`created_by`、`temporary`、`conversation_id` 列自动补加。
- `proactive_events`：`run_id` 列自动补加（PRAGMA 探测）。
- `tool_call_logs`：7 态迁移（success→succeeded、error→failed、超时 running→timed_out）。
- 身份迁移：`mcp_connections`/`api_keys`/`scheduled_tasks` 去除 person CHECK 约束并把中文名重映射为 id；快照 v2→v3（键换稳定 id），重复运行不复制不丢失。
- 新表：`tool_policies`、`proactive_settings`、`proactive_heat`、`memory_records`、`recall_ledger`、`memory_records_fts`（trigram）。

## 数据与安全
- MCP Token 与模型 API Key 使用服务端 AES-256-GCM 加密；`AI_HOME_SECRET_KEY` 丢失后无法解密旧凭证。
- 远程 MCP 仅允许 HTTPS，拒绝本地/私有网络地址。
- 工具日志对 Token/Authorization/自定义请求头脱敏；参数默认只存安全摘要。
- 应用状态快照大小上限 2 MB；附件原文件暂未持久化上传。

## 测试与发布
```bash
npm run build      # tsc -b && vite build
npm run lint       # oxlint（9 条 React Hooks 风格警告基线，0 error）
node --check src/server.mjs
npm test           # 15 项 Agent 验收（tests/agent-acceptance.test.mjs，node:test）
```

自动化测试用脚本化模型（fetch stub）+ 进程内 Fake MCP 驱动真实 Runner/Executor/审批门，覆盖：单工具成功、失败回传、连续两步、并行 tool_call_id 对应、MCP 掉线不阻断、写工具审批（批准/拒绝）、取消、刷新/重启恢复、幂等键、助手隔离、定时任务写回原会话、主动任务写回原会话、无成功回执不得显示"已验证执行"、version 2 迁移不丢失不串助手。真实模型 + 远程 MCP 的端到端验证仍待真实凭证。
