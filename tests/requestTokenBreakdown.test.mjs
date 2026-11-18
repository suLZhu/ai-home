import test from 'node:test'
import assert from 'node:assert/strict'
import {requestInputWeights,allocateInputTokens,tokenCountLabel} from '../src/requestTokenBreakdown.mjs'
test('tool definitions and tool output count separately from context',()=>{
  const w=requestInputWeights([{role:'user',content:'hi'},{role:'tool',content:'many results '.repeat(100)}],[{type:'function',function:{name:'search',parameters:{type:'object'}}}])
  assert.ok(w.tools>w.context)
  const out=allocateInputTokens(600000,w)
  assert.equal(out.context+out.tools+out.worldbook,600000)
})
test('worldbook estimate never exceeds all messages or actual total',()=>{
  const w=requestInputWeights([{role:'system',content:'tiny worldbook'}],[],[{title:'book',content:'large'.repeat(1000)}])
  assert.ok(w.context>=0)
  assert.ok(w.worldbook>=0)
  const o=allocateInputTokens(15000,w)
  assert.equal(o.context+o.tools+o.worldbook,15000)
})
test('k means 1000 tokens, with one decimal',()=>{
  assert.equal(tokenCountLabel(600000),'600k')
  assert.equal(tokenCountLabel(155500),'155.5k')
  assert.equal(tokenCountLabel(999),'999')
})
