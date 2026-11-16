import { randomUUID } from 'node:crypto'
import { isValidAssistantId } from './server/identity.mjs'
import { taskResultEnvelope } from './taskResult.mjs'
export function initInbox(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS assistant_inbox (
 id TEXT PRIMARY KEY, person TEXT NOT NULL, content TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'message', read_at TEXT,
 created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS assistant_inbox_recent_idx ON assistant_inbox(created_at);`)
}
export function addInboxMessage(db,{person,content,kind='message'}) {
 // 身份边界与全站一致：格式合法的 assistantId 即可（新建助手不再被拒收）。
 if(!isValidAssistantId(person))throw Error('无效人物')
 if(typeof content!=='string'||!content.trim()||content.length>4000)throw Error('消息内容无效')
 const id=randomUUID(),created_at=new Date().toISOString()
 db.prepare('INSERT INTO assistant_inbox(id,person,content,kind,created_at) VALUES(?,?,?,?,?)').run(id,person,content.trim(),kind,created_at)
 return {id,person,content:content.trim(),kind,created_at}
}
// 定时任务结果投递：kind='task_result'，id 由 runId 派生（task-<runId>），
// INSERT OR IGNORE 让同一次运行的重复结算（轮询/刷新/重启后的重放）永远只落一行——
// 幂等由 SQLite 主键保障，不依赖任何内存去重。content 是结构化信封（见 taskResult.mjs），
// 前端凭 conversationId 精确写回原会话、凭 runId 做持久化幂等判定。
export function addTaskResult(db,{person,runId,taskId,conversationId,title,answer}) {
 if(!isValidAssistantId(person))throw Error('无效人物')
 if(typeof runId!=='string'||!runId.trim())throw Error('运行标识无效')
 const content=taskResultEnvelope({runId,taskId,conversationId,title,answer})
 if(!content.trim()||content.length>4000)throw Error('消息内容无效')
 const id='task-'+runId.trim(),created_at=new Date().toISOString()
 const res=db.prepare('INSERT OR IGNORE INTO assistant_inbox(id,person,content,kind,created_at) VALUES(?,?,?,\'task_result\',?)').run(id,person,content,created_at)
 const row=db.prepare('SELECT id,person,content,kind,created_at,read_at FROM assistant_inbox WHERE id=?').get(id)
 return {message:row,inserted:res.changes>0}
}
export function listInbox(db,since='') {
 return db.prepare('SELECT id,person,content,kind,created_at,read_at FROM assistant_inbox WHERE created_at>? ORDER BY created_at DESC LIMIT 80').all(since)
}
export function markInboxRead(db,id) {
 return db.prepare('UPDATE assistant_inbox SET read_at=? WHERE id=? AND read_at IS NULL').run(new Date().toISOString(),id).changes>0
}
