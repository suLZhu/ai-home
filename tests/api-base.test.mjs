// 统一 API Base URL 机制验收（Android APP 化）。
// 覆盖：URL 拼接、运行时/构建期优先级、规范化、apiFetch 不改写请求语义、assetUrl 透传规则。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  API_BASE_STORAGE_KEY,
  normalizeApiBase, resolveApiBase, apiUrl, assetUrl,
  setApiBase, getApiBase, apiFetch,
} from '../src/apiBase.mjs'

// ───────────────────────── normalizeApiBase ─────────────────────────

test('normalizeApiBase：空/空白 → 空串（同源）', () => {
  assert.equal(normalizeApiBase(''), '')
  assert.equal(normalizeApiBase('   '), '')
  assert.equal(normalizeApiBase(null), '')
  assert.equal(normalizeApiBase(undefined), '')
})

test('normalizeApiBase：去掉尾部斜杠', () => {
  assert.equal(normalizeApiBase('https://a.example.com'), 'https://a.example.com')
  assert.equal(normalizeApiBase('https://a.example.com/'), 'https://a.example.com')
  assert.equal(normalizeApiBase('https://a.example.com///'), 'https://a.example.com')
  assert.equal(normalizeApiBase('http://127.0.0.1:4180/'), 'http://127.0.0.1:4180')
})

test('normalizeApiBase：非 http(s) 一律视为未配置', () => {
  assert.equal(normalizeApiBase('ftp://x.com'), '')
  assert.equal(normalizeApiBase('javascript:alert(1)'), '')
  assert.equal(normalizeApiBase('a.example.com'), '') // 缺协议头也不接受
})

// ───────────────────────── resolveApiBase ─────────────────────────

test('resolveApiBase：运行时覆盖优先于构建期', () => {
  assert.equal(
    resolveApiBase({ override: 'https://override.example.com', buildBase: 'https://build.example.com' }),
    'https://override.example.com',
  )
})

test('resolveApiBase：覆盖无效时回退构建期', () => {
  assert.equal(resolveApiBase({ override: 'not-a-url', buildBase: 'https://build.example.com' }), 'https://build.example.com')
  assert.equal(resolveApiBase({ override: '', buildBase: 'https://build.example.com' }), 'https://build.example.com')
})

test('resolveApiBase：两者皆空 → 同源空串', () => {
  assert.equal(resolveApiBase({}), '')
  assert.equal(resolveApiBase({ override: '', buildBase: '' }), '')
  assert.equal(resolveApiBase(undefined), '')
})

// ───────────────────────── apiUrl ─────────────────────────

test('apiUrl：base 为空时原样返回（Web 同源旧行为）', () => {
  assert.equal(apiUrl('/api/state', ''), '/api/state')
  assert.equal(apiUrl('/api/attachments/abc'), '/api/attachments/abc')
})

test('apiUrl：有 base 时正确拼接（含不带前导斜杠的 path）', () => {
  assert.equal(apiUrl('/api/state', 'https://h.example.com'), 'https://h.example.com/api/state')
  assert.equal(apiUrl('api/state', 'https://h.example.com'), 'https://h.example.com/api/state')
  assert.equal(apiUrl('/api/chat', 'http://127.0.0.1:4180'), 'http://127.0.0.1:4180/api/chat')
})

// ───────────────────────── assetUrl ─────────────────────────

test('assetUrl：只重写 /api/ 相对路径', () => {
  assert.equal(assetUrl('/api/attachments/uuid-1', 'https://h.example.com'), 'https://h.example.com/api/attachments/uuid-1')
})

test('assetUrl：data:/blob:/http(s) 绝对地址原样透传', () => {
  assert.equal(assetUrl('data:image/png;base64,AAAA', 'https://h.example.com'), 'data:image/png;base64,AAAA')
  assert.equal(assetUrl('blob:https://localhost/xyz', 'https://h.example.com'), 'blob:https://localhost/xyz')
  assert.equal(assetUrl('https://cdn.example.com/pic.png', 'https://h.example.com'), 'https://cdn.example.com/pic.png')
  assert.equal(assetUrl('', 'https://h.example.com'), '')
  assert.equal(assetUrl(null, 'https://h.example.com'), '')
})

test('assetUrl：base 为空时 /api/ 路径也原样返回', () => {
  assert.equal(assetUrl('/api/attachments/uuid-1'), '/api/attachments/uuid-1')
})

// ───────────────────────── setApiBase / getApiBase ─────────────────────────

test('setApiBase/getApiBase：模块级当前 base 可读写，非法值清空', () => {
  setApiBase('https://cur.example.com/')
  assert.equal(getApiBase(), 'https://cur.example.com')
  setApiBase('bogus')
  assert.equal(getApiBase(), '')
  setApiBase('') // 还原同源
  assert.equal(getApiBase(), '')
})

// ───────────────────────── apiFetch ─────────────────────────

test('apiFetch：base 为空时请求相对路径且默认 include 凭证', async () => {
  setApiBase('')
  const calls = []
  const fakeFetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }) }
  await apiFetch('/api/state', undefined, fakeFetch)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/state')
  assert.equal(calls[0].init.credentials, 'include')
})

test('apiFetch：有 base 时拼接前缀', async () => {
  setApiBase('https://h.example.com')
  const calls = []
  const fakeFetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }) }
  await apiFetch('/api/session', undefined, fakeFetch)
  assert.equal(calls[0].url, 'https://h.example.com/api/session')
  setApiBase('')
})

test('apiFetch：绝不修改原始 init（method/headers/body 语义零变化）', async () => {
  setApiBase('https://h.example.com')
  const body = JSON.stringify({ hello: 'world' })
  const headers = { 'Content-Type': 'application/json' }
  const init = { method: 'POST', headers, body, credentials: 'same-origin' }
  const initSnapshot = JSON.stringify(init)
  const calls = []
  const fakeFetch = (url, o) => { calls.push({ url, o }); return Promise.resolve({ ok: true }) }
  await apiFetch('/api/chat', init, fakeFetch)
  // 原始对象不被改写
  assert.equal(JSON.stringify(init), initSnapshot)
  // 传给 fetch 的是新对象，且保留了用户显式指定的 credentials
  assert.notEqual(calls[0].o, init)
  assert.equal(calls[0].o.credentials, 'same-origin')
  assert.equal(calls[0].o.method, 'POST')
  assert.equal(calls[0].o.body, body)
  assert.equal(calls[0].o.headers, headers)
  setApiBase('')
})

test('apiFetch：用户显式 credentials 不被覆盖为 include', async () => {
  setApiBase('')
  const calls = []
  const fakeFetch = (url, o) => { calls.push(o); return Promise.resolve({ ok: true }) }
  await apiFetch('/api/x', { credentials: 'omit' }, fakeFetch)
  assert.equal(calls[0].credentials, 'omit')
})

test('API_BASE_STORAGE_KEY 是稳定键名（改名会丢用户已存覆盖）', () => {
  assert.equal(API_BASE_STORAGE_KEY, 'ai-home.apiBaseOverride')
})
