// 本机工作区：路径越界、读写/搜索/替换/删除、Git、命令执行与开关。
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  initWorkspace, readWorkspaceConfig, saveWorkspaceConfig,
  resolveInsideRoot, runWorkspaceAction,
} from '../src/server/workspace.mjs'

const PERSON = 'assistant-yanweixi'
const dirs = []

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'qj-workspace-'))
  dirs.push(dir)
  return dir
}
function makeDb(root) {
  const db = new DatabaseSync(':memory:')
  initWorkspace(db)
  return db
}
async function enabledDb(extra = {}) {
  const root = makeRoot()
  const db = makeDb(root)
  await saveWorkspaceConfig(db, PERSON, { root, enabled: true, allowWrite: true, allowCommand: true, ...extra })
  return { db, root }
}

after(() => { for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }) } catch {} } })

test('路径越界：..、绝对路径、根目录外一律拒绝', () => {
  const root = makeRoot()
  assert.equal(resolveInsideRoot(root, 'a/b.txt'), join(root, 'a/b.txt'))
  assert.throws(() => resolveInsideRoot(root, '../etc/passwd'), /超出工作区/)
  assert.throws(() => resolveInsideRoot(root, '/etc/passwd'), /超出工作区/)
})

test('未开启时拒绝所有动作', async () => {
  const root = makeRoot()
  const db = makeDb(root)
  await saveWorkspaceConfig(db, PERSON, { root, enabled: false })
  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'list' }), /未开启/)
})

test('写入 / 读取 / 列目录 / 搜索 / 替换 / 删除', async () => {
  const { db, root } = await enabledDb()
  const write = await runWorkspaceAction({ db, person: PERSON, action: 'write', args: { path: 'notes/a.txt', content: '桂花茶\n周六三点' } })
  assert.equal(write.characters, 8)
  assert.ok(existsSync(join(root, 'notes/a.txt')))

  const read = await runWorkspaceAction({ db, person: PERSON, action: 'read', args: { path: 'notes/a.txt' } })
  assert.match(read.content, /桂花茶/)
  const list = await runWorkspaceAction({ db, person: PERSON, action: 'list', args: { path: '.' } })
  assert.equal(list.entries[0].name, 'notes')
  assert.equal(list.entries[0].type, 'dir')

  const search = await runWorkspaceAction({ db, person: PERSON, action: 'search', args: { query: '周六' } })
  assert.equal(search.hits.length, 1)
  assert.match(search.hits[0].path, /notes\/a\.txt/)

  const replace = await runWorkspaceAction({ db, person: PERSON, action: 'replace', args: { path: 'notes/a.txt', oldText: '周六三点', newText: '周日下午两点' } })
  assert.equal(replace.replaced, 1)
  assert.equal(readFileSync(join(root, 'notes/a.txt'), 'utf8'), '桂花茶\n周日下午两点')

  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'replace', args: { path: 'notes/a.txt', oldText: '不存在', newText: 'x' } }), /找不到/)
  await runWorkspaceAction({ db, person: PERSON, action: 'delete', args: { path: 'notes/a.txt' } })
  assert.ok(!existsSync(join(root, 'notes/a.txt')))
})

test('路径越界不能借写入/删除逃逸', async () => {
  const { db, root } = await enabledDb()
  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'write', args: { path: '../escape.txt', content: 'x' } }), /超出工作区/)
  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'read', args: { path: '../etc/passwd' } }), /超出工作区/)
  assert.ok(!existsSync(join(root, '..', 'escape.txt')))
})

test('关闭写入 / 命令后对应动作被拒绝', async () => {
  const { db } = await enabledDb({ allowWrite: false, allowCommand: false })
  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'write', args: { path: 'a.txt', content: 'x' } }), /关闭写入/)
  await assert.rejects(() => runWorkspaceAction({ db, person: PERSON, action: 'exec', args: { command: 'echo hi' } }), /关闭命令/)
})

test('命令执行：在根目录运行并返回输出', async () => {
  const { db, root } = await enabledDb()
  writeFileSync(join(root, 'hello.txt'), 'hi')
  const result = await runWorkspaceAction({ db, person: PERSON, action: 'exec', args: { command: 'pwd && cat hello.txt' } })
  assert.equal(result.exitCode, 0)
  assert.match(result.output, /hi/)
  assert.match(result.output, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('Git：status / commit / log', async () => {
  const { db, root } = await enabledDb()
  execFileSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'a.txt'), 'hello')
  const status = await runWorkspaceAction({ db, person: PERSON, action: 'git', args: { sub: 'status' } })
  assert.match(status.output, /a\.txt/)

  process.env.GIT_AUTHOR_NAME = 'Qijian Test'
  process.env.GIT_AUTHOR_EMAIL = 'test@example.com'
  process.env.GIT_COMMITTER_NAME = 'Qijian Test'
  process.env.GIT_COMMITTER_EMAIL = 'test@example.com'
  const commit = await runWorkspaceAction({ db, person: PERSON, action: 'git_commit', args: { message: '首次提交' } })
  assert.equal(commit.ok, true, commit.output)
  const log = await runWorkspaceAction({ db, person: PERSON, action: 'git', args: { sub: 'log' } })
  assert.match(log.output, /首次提交/)
})
