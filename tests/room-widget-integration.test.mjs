import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
test('room shares the exact workspace widget module, not a second copy',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(app,/import \{ RoomWidgets \} from '\.\/RoomWidgets'/)
 assert.match(app,/<RoomScene[\s\S]*?<RoomWidgets person=\{person\}\/>[\s\S]*?<\/RoomScene>/)
})
test('custom HTML widgets remain in sandboxed iframe',()=>{
 const widgets=readFileSync(new URL('../src/RoomWidgets.tsx',import.meta.url),'utf8')
 assert.match(widgets,/sandbox="allow-scripts allow-forms"/)
 assert.doesNotMatch(widgets,/sandbox="[^"]*allow-same-origin/)
})
