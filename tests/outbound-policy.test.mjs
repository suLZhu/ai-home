import test from 'node:test'
import assert from 'node:assert/strict'
import { outboundPolicy, checkOutboundPolicy } from '../src/server/outboundPolicy.mjs'

test('subscription protocols use the subscription proxy route regardless of model name', () => {
  for (const subscriptionProtocol of ['codex', 'anthropic', 'grok']) {
    assert.equal(outboundPolicy({ subscriptionProtocol }), 'subscription-proxy')
  }
  assert.equal(outboundPolicy({ subscription: true }), 'subscription-proxy')
})

test('normal relay and domestic model endpoints stay direct', () => {
  assert.equal(outboundPolicy({}), 'direct')
  assert.equal(outboundPolicy({ subscriptionProtocol: '' }), 'direct')
})

test('missing proxy does not silently downgrade subscription to direct', () => {
  assert.equal(checkOutboundPolicy({ policy: 'subscription-proxy', proxyReady: false }).allowed, false)
  assert.equal(checkOutboundPolicy({ policy: 'subscription-proxy', proxyReady: true }).allowed, true)
  assert.equal(checkOutboundPolicy({ policy: 'direct', proxyReady: false }).allowed, true)
})
