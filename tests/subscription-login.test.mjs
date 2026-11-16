import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_LOGIN_PATH, DEFAULT_TOKEN_PATH, subscriptionSiteRoot, subscriptionLoginUrl,
  subscriptionTokenUrl, extractAccessToken, performSubscriptionLogin,
} from '../src/subscriptionLogin.mjs'

const mockResponse = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => headers[String(name).toLowerCase()] ?? null,
    ...(headers['set-cookie'] ? { getSetCookie: () => [headers['set-cookie']] } : {}),
  },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

test('订阅地址推导：OpenAI 兼容地址回到站点根，再拼登录 / 令牌接口', () => {
  assert.equal(subscriptionSiteRoot('https://sub.example.com/v1/'), 'https://sub.example.com')
  assert.equal(subscriptionSiteRoot('https://sub.example.com/api/v1'), 'https://sub.example.com')
  assert.equal(subscriptionSiteRoot('https://sub.example.com/v1beta/openai'), 'https://sub.example.com')
  assert.equal(subscriptionLoginUrl('https://sub.example.com/v1'), 'https://sub.example.com' + DEFAULT_LOGIN_PATH)
  assert.equal(subscriptionTokenUrl('https://sub.example.com/v1'), 'https://sub.example.com' + DEFAULT_TOKEN_PATH)
  assert.equal(subscriptionLoginUrl('https://sub.example.com/v1', '/api/auth/login'), 'https://sub.example.com/api/auth/login')
  assert.equal(subscriptionLoginUrl('https://sub.example.com/v1', 'https://login.example.com/signin'), 'https://login.example.com/signin')
  assert.equal(subscriptionLoginUrl('', ''), '')
})

test('令牌提取：兼容常见订阅号返回形状，不把提示文字误当令牌', () => {
  assert.deepEqual(extractAccessToken({ data: { token: 'sk-abcdefgh123456' } }), { token: 'sk-abcdefgh123456', source: 'body' })
  assert.equal(extractAccessToken({ access_token: 'Bearer eyJhbGciOiJIUzI1NiJ9' })?.token, 'eyJhbGciOiJIUzI1NiJ9')
  assert.equal(extractAccessToken({ success: true, data: 'sk-this-is-a-system-token' })?.token, 'sk-this-is-a-system-token')
  assert.equal(extractAccessToken({ success: true, message: '登录成功啦，欢迎回来' }), null)
  assert.deepEqual(extractAccessToken({}, { get: (n) => n === 'authorization' ? 'Bearer sk-header-token-123' : null }), { token: 'sk-header-token-123', source: 'header' })
})

test('账号密码登录：换到令牌，密码只出现在登录请求里', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return mockResponse({ success: true, data: { token: 'sk-from-password-123456' } })
  }
  const r = await performSubscriptionLogin({
    endpoint: 'https://sub.example.com/v1', username: 'me@example.com', password: 'p@ssw0rd', fetchImpl,
  })
  assert.equal(r.token, 'sk-from-password-123456')
  assert.equal(r.source, 'body')
  assert.equal(r.loginUrl, 'https://sub.example.com' + DEFAULT_LOGIN_PATH)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'me@example.com', password: 'p@ssw0rd' })
  assert.equal(calls.length, 1)
})

test('账号密码登录：登录只给 Cookie 时自动再取一次系统令牌', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (calls.length === 1) return mockResponse({ success: true, message: 'ok', data: { username: 'me' } }, 200, { 'set-cookie': 'session=abc123; Path=/; HttpOnly' })
    return mockResponse({ success: true, data: 'sk-from-token-api-123456' })
  }
  const r = await performSubscriptionLogin({ endpoint: 'https://sub.example.com/v1', username: 'me', password: 'pw', fetchImpl })
  assert.equal(r.token, 'sk-from-token-api-123456')
  assert.equal(r.source, 'token-api')
  assert.equal(calls[1].url, 'https://sub.example.com' + DEFAULT_TOKEN_PATH)
  assert.equal(calls[1].init.headers.Cookie, 'session=abc123')
})

test('账号密码登录：缺账号密码 / 密码错 / 没返回令牌都给出明确错误', async () => {
  await assert.rejects(() => performSubscriptionLogin({ endpoint: 'https://sub.example.com/v1', username: '', password: 'pw', fetchImpl: async () => mockResponse({}) }), /请填写订阅账号和密码/)
  await assert.rejects(() => performSubscriptionLogin({ endpoint: 'not-a-url', username: 'me', password: 'pw', fetchImpl: async () => mockResponse({}) }), /http:\/\/ 或 https:\/\//)
  await assert.rejects(() => performSubscriptionLogin({ endpoint: 'https://sub.example.com/v1', username: 'me', password: 'pw', fetchImpl: async () => mockResponse({ success: false, message: '密码错误' }) }), /密码错误/)
  await assert.rejects(() => performSubscriptionLogin({ endpoint: 'https://sub.example.com/v1', username: 'me', password: 'pw', fetchImpl: async () => mockResponse({ success: true, message: 'ok' }) }), /没返回访问令牌/)
})
