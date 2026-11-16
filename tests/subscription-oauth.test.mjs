// ChatGPT 订阅：从 id_token 里取 chatgpt-account-id，Codex 模型目录需要它。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeJwtPayload, chatGptAccountIdFromToken } from '../src/subscriptionOAuth.mjs'

function jwt(payload) {
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return enc({ alg: 'none' }) + '.' + enc(payload) + '.sig'
}

test('从 id_token 的 OpenAI auth 声明里取账号 ID', () => {
  const token = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc-123', chatgpt_plan_type: 'plus' } })
  assert.equal(chatGptAccountIdFromToken(token), 'acc-123')
  assert.equal(decodeJwtPayload(token)?.['https://api.openai.com/auth']?.chatgpt_plan_type, 'plus')
})

test('兼容顶层 chatgpt_account_id，坏 token 安静返回空', () => {
  assert.equal(chatGptAccountIdFromToken(jwt({ chatgpt_account_id: 'acc-456' })), 'acc-456')
  assert.equal(chatGptAccountIdFromToken(''), '')
  assert.equal(chatGptAccountIdFromToken('not-a-jwt'), '')
  assert.equal(decodeJwtPayload('a.b'), null)
})
