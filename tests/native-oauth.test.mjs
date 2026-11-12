import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeOAuthAvailable, startOAuthLogin } from '../src/nativeOAuth.mjs'

const cfg = {
  channelId: 'gpt',
  url: 'https://auth.openai.com/oauth/authorize?client_id=x&state=st-1',
  callbackPrefixes: ['http://localhost:1455/auth/callback'],
  state: 'st-1',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  tokenBody: { grant_type: 'authorization_code', code_verifier: 'vr-1' },
  tokenHeaders: {},
}

test('原生桥可用性判断', () => {
  delete globalThis.AiHomeOAuth
  assert.equal(nativeOAuthAvailable(), false)
  globalThis.AiHomeOAuth = { login() {} }
  assert.equal(nativeOAuthAvailable(), true)
  delete globalThis.AiHomeOAuth
})

test('有原生桥：配置交给 App 内 WebView，回传令牌即完成登录', async () => {
  let payload = null
  globalThis.AiHomeOAuth = { login(json) { payload = JSON.parse(json) } }
  const pending = startOAuthLogin(cfg)
  assert.equal(payload.url, cfg.url)
  assert.deepEqual(payload.callbackPrefixes, cfg.callbackPrefixes)
  assert.equal(payload.tokenBody.code_verifier, 'vr-1')
  globalThis.__aihomeOAuthResult({ ok: true, token: 'sk-native-1', refreshToken: 'rt-1', expiresIn: 3600 })
  assert.deepEqual(await pending, { token: 'sk-native-1', refreshToken: 'rt-1', expiresIn: 3600 })
  assert.equal(globalThis.__aihomeOAuthResult, undefined)
  delete globalThis.AiHomeOAuth
})

test('原生回传错误会变成可读提示，不会假装登录成功', async () => {
  globalThis.AiHomeOAuth = { login() {} }
  const pending = startOAuthLogin(cfg)
  globalThis.__aihomeOAuthResult({ ok: false, error: '授权未完成：access_denied' })
  await assert.rejects(() => pending, /access_denied/)
  delete globalThis.AiHomeOAuth
})

test('电脑浏览器没有原生桥：打开授权页，结果由同一个回调收口', async () => {
  delete globalThis.AiHomeOAuth
  let opened = ''
  globalThis.open = (u) => { opened = String(u); return {} }
  const pending = startOAuthLogin(cfg)
  assert.equal(opened, cfg.url)
  globalThis.__aihomeOAuthResult('{"ok":true,"token":"sk-browser-1"}')
  assert.equal((await pending).token, 'sk-browser-1')
  delete globalThis.open
})

test('空配置直接拒绝，不会打开任何页面', async () => {
  await assert.rejects(() => startOAuthLogin(null), /登录地址为空/)
})
