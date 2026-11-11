import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OAUTH_PROFILES, GATEWAY_REFERENCES, oauthProfile, oauthLoginUrl,
  buildAuthorizeUrl, parseOAuthCallback, looksLikeToken, exchangeOAuthCode,
} from '../src/subscriptionOAuth.mjs'

test('只有 GPT / Claude / Grok 三家，且端点都是官方域名', () => {
  assert.deepEqual(Object.keys(OAUTH_PROFILES), ['gpt', 'claude', 'grok'])
  const official = new Set(['auth.openai.com', 'claude.ai', 'console.anthropic.com', 'accounts.x.ai', 'grok.com'])
  for (const p of Object.values(OAUTH_PROFILES)) {
    for (const key of ['authorizeUrl', 'tokenUrl', 'loginUrl', 'deviceUrl']) {
      if (!p[key]) continue
      assert.ok(official.has(new URL(p[key]).hostname), `${p.channelId} 的 ${key} 不是官方域名`)
    }
  }
  assert.equal(oauthProfile('gemini'), null)
  assert.equal(oauthLoginUrl('gpt').startsWith('https://auth.openai.com/'), true)
  assert.equal(GATEWAY_REFERENCES.length, 2)
  assert.ok(GATEWAY_REFERENCES.every(r => r.url.startsWith('https://github.com/')))
})

test('PKCE 授权页：参数齐全、state 与 challenge 都带上、Claude 带 code=true', () => {
  const u = new URL(buildAuthorizeUrl('gpt', { codeChallenge: 'challenge-abc', state: 'state-xyz' }))
  assert.equal(u.origin + u.pathname, 'https://auth.openai.com/oauth/authorize')
  assert.equal(u.searchParams.get('response_type'), 'code')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('code_challenge'), 'challenge-abc')
  assert.equal(u.searchParams.get('state'), 'state-xyz')
  assert.ok(u.searchParams.get('client_id'))
  assert.ok(u.searchParams.get('scope')?.includes('offline_access'))
  const c = new URL(buildAuthorizeUrl('claude', { codeChallenge: 'c', state: 's' }))
  assert.equal(c.searchParams.get('code'), 'true')
  assert.equal(c.searchParams.get('scope')?.includes('user:inference'), true)
  assert.equal(buildAuthorizeUrl('grok', { codeChallenge: 'c', state: 's' }), '')
  assert.equal(buildAuthorizeUrl('不存在', {}), '')
})

test('回调解析：完整地址 / fragment / 裸授权码 / 现成令牌 / state 校验 / 错误', () => {
  const ok = parseOAuthCallback('http://localhost:1455/auth/callback?code=abc123&state=st1', 'st1')
  assert.deepEqual({ code: ok.code, state: ok.state }, { code: 'abc123', state: 'st1' })
  assert.equal(parseOAuthCallback('https://console.anthropic.com/oauth/code/callback?code=claude-1', '').code, 'claude-1')
  assert.equal(parseOAuthCallback('https://x.test/cb#code=frag-1&state=st1', 'st1').code, 'frag-1')
  assert.equal(parseOAuthCallback('sk-ant-oat-abcdefghijklmnop', '').token, 'sk-ant-oat-abcdefghijklmnop')
  assert.equal(parseOAuthCallback('xai-1234567890abcdef', '').token, 'xai-1234567890abcdef')
  assert.equal(parseOAuthCallback('abcdefghijklmnopqrstuvwxyz123456', '').code, 'abcdefghijklmnopqrstuvwxyz123456')
  assert.equal(parseOAuthCallback('http://localhost/cb?code=a&state=wrong', 'st1').ok, false)
  assert.equal(parseOAuthCallback('http://localhost/cb?error=access_denied', '').ok, false)
  assert.equal(parseOAuthCallback('http://localhost/cb?foo=bar', '').ok, false)
  assert.equal(parseOAuthCallback('', '').ok, false)
  assert.equal(parseOAuthCallback('这不是链接', '').ok, false)
  assert.equal(looksLikeToken('sk-abcdefghijklmnop'), true)
  assert.equal(looksLikeToken('not a token'), false)
})

test('授权码换令牌：代发到官方端点、返回 access_token、拒绝设备码渠道', async () => {
  let seen
  const fake = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) }
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'sk-oauth-1', refresh_token: 'rt-1', expires_in: 3600 }) }
  }
  const r = await exchangeOAuthCode({ channelId: 'claude', code: 'c-1', codeVerifier: 'v-1', state: 's-1', fetchImpl: fake })
  assert.equal(r.token, 'sk-oauth-1')
  assert.equal(r.refreshToken, 'rt-1')
  assert.equal(seen.url, 'https://console.anthropic.com/v1/oauth/token')
  assert.equal(seen.body.grant_type, 'authorization_code')
  assert.equal(seen.body.code_verifier, 'v-1')
  assert.equal(seen.body.state, 's-1')
  await assert.rejects(() => exchangeOAuthCode({ channelId: 'grok', code: 'c', codeVerifier: 'v', fetchImpl: fake }), /没有公开的 OAuth/)
  await assert.rejects(() => exchangeOAuthCode({ channelId: 'gpt', code: '', codeVerifier: 'v', fetchImpl: fake }), /缺少授权码/)
  const bad = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'invalid_grant' }) })
  await assert.rejects(() => exchangeOAuthCode({ channelId: 'gpt', code: 'c', codeVerifier: 'v', fetchImpl: bad }), /HTTP 401/)
})
