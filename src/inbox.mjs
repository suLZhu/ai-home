import { randomUUID } from 'node:crypto'
const PEOPLE = ['assistant-yanweixi','assistant-yanshuo']
export function initInbox(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS assistant_inbox (
 id TEXT PRIMARY KEY, person TEXT NOT NULL, content TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'message', read_at TEXT,
 created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS assistant_inbox_recent_idx ON assistant_inbox(created_at);`)
}
export function addInboxMessage(db,{person,content,kind='message'}) {
 if(!PEOPLE.includes(person))throw Error('无效人物')
 if(typeof content!=='string'||!content.trim()||content.length>4000)throw Error('消息内容无效')
 const id=randomUUID(),created_at=new Date().toISOString()
 db.prepare('INSERT INTO assistant_inbox(id,person,content,kind,created_at) VALUES(?,?,?,?,?)').run(id,person,content.trim(),kind,created_at)
 return {id,person,content:content.trim(),kind,created_at}
}
export function listInbox(db,since='') {
 return db.prepare('SELECT id,person,content,kind,created_at,read_at FROM assistant_inbox WHERE created_at>? ORDER BY created_at DESC LIMIT 80').all(since)
}
export function markInboxRead(db,id) {
 return db.prepare('UPDATE assistant_inbox SET read_at=? WHERE id=? AND read_at IS NULL').run(new Date().toISOString(),id).changes>0
}
