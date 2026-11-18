import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSubscriptionUsage,subscriptionUsageRequest,fetchSubscriptionUsage} from '../src/subscriptionUsage.mjs'

test('Codex rate-limit windows show real used and remaining percentages',()=>{
  const windows=parseSubscriptionUsage('gpt',{rate_limit:{primary_window:{used_percent:26,reset_at:1763350000},secondary_window:{used_percent:4}}})
  assert.equal(windows.length,2)
  assert.equal(windows[0].used,26)
  assert.equal(windows[0].remaining,74)
  assert.equal(windows[1].remaining,96)
})
test('Claude utilization supports fractional usage',()=>{
  const windows=parseSubscriptionUsage('claude',{five_hour:{utilization:0.61,resets_at:'2026-11-18T01:00:00Z'},seven_day:{utilization:0.12}})
  assert.equal(windows[0].used,61)
  assert.equal(windows[1].remaining,88)
})
test('Grok billing without a reported percent does not invent quota',()=>{
  assert.deepEqual(parseSubscriptionUsage('grok',{config:{}}),[])
  assert.equal(parseSubscriptionUsage('grok',{config:{creditUsagePercent:37.5}})[0].remaining,62.5)
})
test('Missing token is not queried',async()=>{
  let called=false
  const result=await fetchSubscriptionUsage('gpt','', '',async()=>{called=true;return null})
  assert.match(result.error,/没有可用/)
  assert.equal(called,false)
})
test('Non-authorized quota responses show explicit error, not a fabricated zero',async()=>{
  const result=await fetchSubscriptionUsage('gpt','token','account',async()=>({status:403,body:'{}'}))
  assert.match(result.error,/403/)
  assert.deepEqual(result.windows,[])
})
test('All three services use subscription, not API billing, endpoints',()=>{
  assert.match(subscriptionUsageRequest('gpt','token').url,/chatgpt.com.*wham\/usage/)
  assert.match(subscriptionUsageRequest('claude','token').url,/oauth\/usage/)
  assert.match(subscriptionUsageRequest('grok','token').url,/billing/)
})
