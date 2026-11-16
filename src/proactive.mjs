import { randomUUID } from "node:crypto"
// Server-side wake decisions are deterministic; the model never silently invents a message.
// Delivery requires a future authenticated model runner with a provider key.
const PEOPLE = ['assistant-yanweixi','assistant-yanshuo']
export function initProactive(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS proactive_settings (
 person TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL DEFAULT 'natural', quiet_start INTEGER NOT NULL DEFAULT 23,
 quiet_end INTEGER NOT NULL DEFAULT 8, interval_hours INTEGER NOT NULL DEFAULT 12,
 updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS proactive_events (
 id TEXT PRIMARY KEY, person TEXT NOT NULL, reason TEXT NOT NULL,
 mood TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS proactive_events_person_idx ON proactive_events(person,created_at);`)
 for(const person of PEOPLE) db.prepare('INSERT OR IGNORE INTO proactive_settings(person,updated_at) VALUES (?,?)').run(person,new Date().toISOString())
}
export function settings(db,person) {return db.prepare('SELECT * FROM proactive_settings WHERE person=?').get(person)}
export function events(db,person) {return db.prepare('SELECT * FROM proactive_events WHERE person=? ORDER BY created_at DESC LIMIT 30').all(person)}
export function configure(db,person,input) {
 if(!PEOPLE.includes(person))throw new Error('无效人物')
 const mode=['quiet','natural','lively'].includes(input.mode)?input.mode:'natural'
 const enabled=input.enabled===true?1:0
 const start=Number(input.quiet_start),end=Number(input.quiet_end)
 const interval=Number(input.interval_hours)
 if(!Number.isInteger(start)||start<0||start>23||!Number.isInteger(end)||end<0||end>23||!Number.isInteger(interval)||interval<2||interval>72)throw new Error('时间设置无效')
 db.prepare('UPDATE proactive_settings SET enabled=?,mode=?,quiet_start=?,quiet_end=?,interval_hours=?,updated_at=? WHERE person=?').run(enabled,mode,start,end,interval,new Date().toISOString(),person)
 return settings(db,person)
}
export function wake(db,person,{manual=false,now=new Date()}={}) {
 if(!PEOPLE.includes(person))throw new Error('无效人物')
 const config=settings(db,person)
 if(!config.enabled&&!manual)return {queued:false,reason:'disabled'}
 const hour=now.getHours()
 const quiet=config.quiet_start===config.quiet_end?false:config.quiet_start<config.quiet_end?hour>=config.quiet_start&&hour<config.quiet_end:hour>=config.quiet_start||hour<config.quiet_end
 if(quiet)return {queued:false,reason:'quiet_hours'}
 const pending=db.prepare("SELECT count(*) AS n FROM proactive_events WHERE person=? AND status='pending'").get(person).n
 if(pending)return {queued:false,reason:'pending_exists'}
 const last=db.prepare('SELECT created_at FROM proactive_events WHERE person=? ORDER BY created_at DESC LIMIT 1').get(person)
 const minHours=config.mode==='quiet'?Math.max(24,config.interval_hours):config.mode==='lively'?Math.max(2,Math.floor(config.interval_hours/2)):config.interval_hours
 if(!manual&&last&&now.getTime()-new Date(last.created_at).getTime()<minHours*3600000)return {queued:false,reason:'cooldown'}
 const mood='curious'
 const reason=manual?'用户手动测试唤醒':'定时心跳：检查是否有真实进展、值得分享的发现或待办事项'
 const id=randomUUID()
 db.prepare('INSERT INTO proactive_events(id,person,reason,mood,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,person,reason,mood,'pending',now.toISOString(),now.toISOString())
 return {queued:true,id,reason,mood}
}
export function dismiss(db,person,id) {
 const r=db.prepare("UPDATE proactive_events SET status='dismissed',updated_at=? WHERE id=? AND person=? AND status='pending'").run(new Date().toISOString(),id,person)
 return r.changes>0
}
