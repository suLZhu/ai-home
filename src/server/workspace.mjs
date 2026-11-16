// 本机工作区：让助手读写服务器所在机器的文件、查看/提交 Git、执行命令。
//
// 安全边界（必须由服务端强制，客户端确认只是第二道门）：
//   - 所有路径都先 resolve 到配置的根目录内，`..` / 绝对路径越界直接拒绝；
//   - 根目录必须显式配置并开启；写/删/提交/命令还各有开关；
//   - 命令用 bash -lc 在根目录执行，30 秒超时、输出截断，不做交互；
//   - 不开放网络代理、sudo 提权之类的能力，就是当前服务端用户的权限。
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { resolve, relative, isAbsolute, sep, join } from 'node:path'
import { isValidAssistantId } from './identity.mjs'

const DEFAULT_ROOT = resolve(process.env.AI_HOME_WORKSPACE || process.cwd())
const MAX_READ_CHARS = 40000
const MAX_WRITE_CHARS = 400000
const MAX_SEARCH_HITS = 60
const SEARCH_SKIP = new Set(['.git', 'node_modules', 'dist', 'build', '.cache', 'android/app/build'])

export function initWorkspace(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_config (
      person TEXT PRIMARY KEY,
      root TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      allow_write INTEGER NOT NULL DEFAULT 1,
      allow_command INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `)
}

export function readWorkspaceConfig(db, person) {
  const row = db.prepare('SELECT * FROM workspace_config WHERE person=?').get(String(person || ''))
  return {
    person: String(person || ''),
    root: row?.root || DEFAULT_ROOT,
    enabled: row ? row.enabled !== 0 : false,
    allowWrite: row ? row.allow_write !== 0 : true,
    allowCommand: row ? row.allow_command !== 0 : true,
    updatedAt: row?.updated_at || null,
    defaultRoot: DEFAULT_ROOT,
  }
}

export async function saveWorkspaceConfig(db, person, patch = {}) {
  if (!isValidAssistantId(person)) throw Object.assign(new Error('人物身份无效'), { status: 400 })
  const root = resolve(String(patch.root || DEFAULT_ROOT).trim() || DEFAULT_ROOT)
  const stat = await fsp.stat(root).catch(() => null)
  if (!stat || !stat.isDirectory()) throw Object.assign(new Error('根目录不存在或不是文件夹'), { status: 400 })
  const enabled = patch.enabled === undefined ? false : patch.enabled !== false
  const allowWrite = patch.allowWrite === undefined ? true : patch.allowWrite !== false
  const allowCommand = patch.allowCommand === undefined ? true : patch.allowCommand !== false
  db.prepare(`INSERT INTO workspace_config (person,root,enabled,allow_write,allow_command,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(person) DO UPDATE SET root=excluded.root, enabled=excluded.enabled,
      allow_write=excluded.allow_write, allow_command=excluded.allow_command, updated_at=excluded.updated_at`)
    .run(person, root, enabled ? 1 : 0, allowWrite ? 1 : 0, allowCommand ? 1 : 0, new Date().toISOString())
  return readWorkspaceConfig(db, person)
}

/** 只做路径字符串层面的越界检查（同步、纯逻辑，便于单测）。 */
export function resolveInsideRoot(root, relPath = '.') {
  const rootAbs = resolve(String(root || ''))
  const target = resolve(rootAbs, String(relPath || '.'))
  const rel = relative(rootAbs, target)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw Object.assign(new Error('路径超出工作区范围：' + relPath), { status: 400 })
  }
  return target
}

// 真实路径也要在根目录内：防止根目录里的符号链接指向外面。
async function safePath(root, relPath) {
  const target = resolveInsideRoot(root, relPath)
  const rootReal = await fsp.realpath(root).catch(() => root)
  let real = null
  try { real = await fsp.realpath(target) } catch {
    // 新文件：检查父目录
    const parent = await fsp.realpath(resolve(target, '..')).catch(() => null)
    if (parent) real = parent
  }
  if (real) {
    const rel = relative(rootReal, real)
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      throw Object.assign(new Error('路径经符号链接指向工作区外，已拒绝'), { status: 400 })
    }
  }
  return target
}

function runShell(command, { cwd, timeout = 30000 } = {}) {
  return new Promise(done => {
    execFile('/bin/bash', ['-lc', String(command)], { cwd, timeout, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      const output = (String(stdout || '') + String(stderr || '')).slice(0, 8000)
      done({
        ok: !error,
        exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        output,
        timedOut: !!error?.killed,
      })
    })
  })
}

async function runGit(cwd, args) {
  return new Promise(done => {
    execFile('git', args, { cwd, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      done({
        ok: !error,
        exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        output: (String(stdout || '') + String(stderr || '')).slice(0, 8000),
      })
    })
  })
}

async function listDir(root, relPath) {
  const dir = await safePath(root, relPath || '.')
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const rows = []
  for (const entry of entries.slice(0, 400)) {
    const full = join(dir, entry.name)
    const info = await fsp.stat(full).catch(() => null)
    rows.push({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
      size: info?.size ?? 0,
      modifiedAt: info?.mtime?.toISOString() || '',
    })
  }
  rows.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { path: relPath || '.', entries: rows }
}

async function readFile(root, relPath) {
  const file = await safePath(root, relPath)
  const stat = await fsp.stat(file)
  if (!stat.isFile()) throw Object.assign(new Error('不是文件'), { status: 400 })
  if (stat.size > 2 * 1024 * 1024) throw Object.assign(new Error('文件超过 2 MB，请用命令分段查看'), { status: 400 })
  const buffer = await fsp.readFile(file)
  if (buffer.includes(0)) throw Object.assign(new Error('这是二进制文件，不能按文本读取'), { status: 400 })
  const text = buffer.toString('utf8')
  return { path: relPath, size: stat.size, truncated: text.length > MAX_READ_CHARS, content: text.slice(0, MAX_READ_CHARS) }
}

async function searchFiles(root, query, relPath = '.') {
  const start = await safePath(root, relPath || '.')
  const needle = String(query || '').trim()
  if (!needle) throw Object.assign(new Error('搜索关键词不能为空'), { status: 400 })
  const hits = []
  async function walk(dir, depth) {
    if (depth > 6 || hits.length >= MAX_SEARCH_HITS) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (hits.length >= MAX_SEARCH_HITS) return
      if (SEARCH_SKIP.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      if (!entry.isFile()) continue
      const stat = await fsp.stat(full).catch(() => null)
      if (!stat || stat.size > 512 * 1024) continue
      const buffer = await fsp.readFile(full).catch(() => null)
      if (!buffer || buffer.includes(0)) continue
      const text = buffer.toString('utf8')
      if (!text.includes(needle)) continue
      for (const line of text.split(/\r?\n/)) {
        if (!line.includes(needle)) continue
        hits.push({ path: relative(root, full), line: line.trim().slice(0, 240) })
        if (hits.length >= MAX_SEARCH_HITS) return
      }
    }
  }
  await walk(start, 0)
  return { query: needle, hits }
}

async function writeFile(root, relPath, content) {
  const file = await safePath(root, relPath)
  const text = String(content ?? '')
  if (text.length > MAX_WRITE_CHARS) throw Object.assign(new Error('内容超过 40 万字符，请分段写入'), { status: 400 })
  await fsp.mkdir(resolve(file, '..'), { recursive: true })
  await fsp.writeFile(file, text, 'utf8')
  return { path: relPath, bytes: Buffer.byteLength(text), characters: text.length }
}

async function replaceInFile(root, relPath, oldText, newText) {
  const file = await safePath(root, relPath)
  const existing = await fsp.readFile(file, 'utf8')
  const needle = String(oldText ?? '')
  if (!needle) throw Object.assign(new Error('要替换的原文不能为空'), { status: 400 })
  if (!existing.includes(needle)) throw Object.assign(new Error('文件里找不到这段原文，未修改'), { status: 409 })
  const next = existing.split(needle).join(String(newText ?? ''))
  if (next.length > MAX_WRITE_CHARS) throw Object.assign(new Error('替换后内容超过 40 万字符'), { status: 400 })
  await fsp.writeFile(file, next, 'utf8')
  return { path: relPath, replaced: existing.split(needle).length - 1 }
}

async function deletePath(root, relPath, recursive) {
  const target = await safePath(root, relPath)
  if (resolveInsideRoot(root, relPath) === resolve(root)) throw Object.assign(new Error('不能删除工作区根目录'), { status: 400 })
  const stat = await fsp.lstat(target)
  if (stat.isDirectory() && !recursive) throw Object.assign(new Error('这是文件夹；要递归删除请显式传 recursive=true'), { status: 400 })
  await fsp.rm(target, { recursive: !!recursive, force: false })
  return { path: relPath, deleted: true }
}

/** 服务端统一的动作入口；客户端只传 action + args。 */
export async function runWorkspaceAction({ db, person, action, args = {} }) {
  if (!isValidAssistantId(person)) throw Object.assign(new Error('人物身份无效'), { status: 400 })
  const config = readWorkspaceConfig(db, person)
  if (!config.enabled) throw Object.assign(new Error('工作区未开启（设置 → 本机工作区）'), { status: 403 })
  const root = config.root
  switch (action) {
    case 'list': return listDir(root, args.path)
    case 'read': return readFile(root, args.path)
    case 'search': return searchFiles(root, args.query, args.path)
    case 'write':
      if (!config.allowWrite) throw Object.assign(new Error('本机工作区已关闭写入'), { status: 403 })
      return writeFile(root, args.path, args.content)
    case 'replace':
      if (!config.allowWrite) throw Object.assign(new Error('本机工作区已关闭写入'), { status: 403 })
      return replaceInFile(root, args.path, args.oldText, args.newText)
    case 'delete':
      if (!config.allowWrite) throw Object.assign(new Error('本机工作区已关闭写入'), { status: 403 })
      return deletePath(root, args.path, args.recursive)
    case 'git': {
      const sub = String(args.sub || 'status')
      if (!['status', 'diff', 'log'].includes(sub)) throw Object.assign(new Error('不支持的 git 动作'), { status: 400 })
      const gitArgs = sub === 'status' ? ['status', '--porcelain=v1', '--branch']
        : sub === 'diff' ? ['diff', '--no-color', '--', String(args.path || '.')]
          : ['log', '--oneline', '-n', '20']
      const result = await runGit(root, gitArgs)
      if (!result.ok && /not a git repository/i.test(result.output)) throw Object.assign(new Error('当前目录不是 Git 仓库'), { status: 400 })
      return { sub, ...result }
    }
    case 'git_commit': {
      if (!config.allowWrite) throw Object.assign(new Error('本机工作区已关闭写入'), { status: 403 })
      const message = String(args.message || '').trim().slice(0, 500)
      if (!message) throw Object.assign(new Error('提交信息不能为空'), { status: 400 })
      const add = await runGit(root, ['add', '-A'])
      if (!add.ok) return { ok: false, output: add.output }
      const commit = await runGit(root, ['commit', '-m', message])
      return { ok: commit.ok, output: commit.output, exitCode: commit.exitCode }
    }
    case 'exec': {
      if (!config.allowCommand) throw Object.assign(new Error('本机工作区已关闭命令执行'), { status: 403 })
      const command = String(args.command || '').trim()
      if (!command) throw Object.assign(new Error('命令不能为空'), { status: 400 })
      const timeout = Math.min(120000, Math.max(1000, Number(args.timeoutMs) || 30000))
      const result = await runShell(command, { cwd: root, timeout })
      return { command, ...result }
    }
    default:
      throw Object.assign(new Error('未知的工作区动作'), { status: 400 })
  }
}
