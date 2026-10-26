// Startup rolling backup: VACUUM INTO checkpoints the WAL and writes a
// consistent snapshot into data/backups/, never touching or overwriting the
// main database; only old backups beyond the keep-count are removed. A backup
// failure must never block startup (it warns and returns ok=false).
// Extracted from server.mjs so the real function is testable against a temp
// database — the acceptance suite opens the produced file and reads it back.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const BACKUP_KEEP = 5

export function createRollingBackup(db, dbPath, keep = BACKUP_KEEP) {
  try {
    const dir = join(dirname(dbPath), 'backups')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(dir, `ai-home-${stamp}.sqlite`)
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    const kept = readdirSync(dir).filter(f => /^ai-home-.*\.sqlite$/.test(f)).sort()
    for (const old of kept.slice(0, Math.max(0, kept.length - keep))) {
      try { unlinkSync(join(dir, old)) } catch { /* 单个清理失败不致命 */ }
    }
    console.log('已创建数据库备份：' + target)
    return { ok: true, target }
  } catch (error) {
    console.warn('数据库备份创建失败（不影响服务启动）：' + (error?.message || error))
    return { ok: false, error: error?.message || String(error) }
  }
}
