// 图片附件存储：字节落 sqlite，聊天记录只存 assetId + 独立于 app_state 快照的稳定 URL。
// 之所以不复用现有能力——排查确认后端此前零文件能力（无上传路由/静态服务/BLOB 列）。
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'

// 前端单图 12 MB，base64 后约 16 MB，留 JSON 包装余量。
export const ATTACH_MAX_BODY = 20 * 1024 * 1024

export function initAttachments(db) {
  // 增量建表，与本仓其余 8 张表同为 CREATE TABLE IF NOT EXISTS，无破坏性迁移。
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attachments_sha_idx ON attachments(sha256);
  `)
}

// base64 格式校验：Buffer.from(str,'base64') 会静默跳过非法字符，
// 不先校验就会把被截断的脏字节当图片存下来。
export function decodeBase64Image(data) {
  const normalized = String(data || '').replace(/\s+/g, '')
  if (!normalized) throw Object.assign(new Error('图片内容为空'), { status: 400 })
  if (normalized.length > ATTACH_MAX_BODY) throw Object.assign(new Error('图片超出单次上传上限'), { status: 413 })
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw Object.assign(new Error('图片内容不是有效的 base64'), { status: 400 })
  const buf = Buffer.from(normalized, 'base64')
  if (!buf.length) throw Object.assign(new Error('图片内容解码后为空'), { status: 400 })
  return buf
}

// 上传（按 sha256 幂等去重）。同一文件多次上传、或多条消息引用同一文件，共用一行字节。
export function saveAttachment(db, { name, mime, data }) {
  const cleanName = String(name || '').trim().slice(0, 200)
  const cleanMime = String(mime || '').trim()
  if (!cleanName) throw Object.assign(new Error('附件名不能为空'), { status: 400 })
  if (!/^image\/[a-z0-9.+-]+$/i.test(cleanMime)) throw Object.assign(new Error('仅支持图片附件'), { status: 400 })
  const buf = decodeBase64Image(data)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const existing = db.prepare('SELECT id, name, mime, size, sha256 FROM attachments WHERE sha256=?').get(sha256)
  if (existing) return { ...existing, url: attachmentUrl(existing.id), deduped: true }
  const id = randomUUID()
  db.prepare('INSERT INTO attachments (id,name,mime,size,sha256,data,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, cleanName, cleanMime, buf.length, sha256, buf, new Date().toISOString())
  return { id, name: cleanName, mime: cleanMime, size: buf.length, sha256, url: attachmentUrl(id) }
}

export function attachmentUrl(id) {
  return '/api/attachments/' + id
}

export function getAttachment(db, id) {
  const row = db.prepare('SELECT id, name, mime, size, sha256, data, created_at FROM attachments WHERE id=?').get(String(id || ''))
  if (!row) return null
  return { ...row, data: Buffer.from(row.data) }
}

// 删除。引用安全由调用方（前端）保证：先扫描全部会话+缓发队列，只对无人再引用的 id 调用。
export function deleteAttachment(db, id) {
  return db.prepare('DELETE FROM attachments WHERE id=?').run(String(id || '')).changes > 0
}
