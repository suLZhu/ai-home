import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('App hooks must be declared before auth startup early returns',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
  const appStart=app.indexOf('export default function App(')
  const appEnd=app.indexOf('\nfunction LoginScreen(')
  assert.ok(appStart>=0 && appEnd>appStart)
  const body=app.slice(appStart,appEnd)
  const guard=body.indexOf("if (authStatus === 'checking') return")
  assert.ok(guard>0)
  const early=body.slice(guard)
  const bad=[...early.matchAll(/(?:const|let)\\s+(?:\\[[^\\]]*\\]|\\w+)\\s*=\\s*(?:React\\.)?use(?:State|Effect|Ref|Memo|Callback|Reducer|Context|LayoutEffect)\\s*\\(/g)]
  assert.deepEqual(bad.map(m=>m[0]),[],'Hooks after login early-return cause React error #310')
  const archive=body.indexOf('const [showArchivedConvs,setShowArchivedConvs]=useState(false)')
  assert.ok(archive>=0 && archive<guard)
})
