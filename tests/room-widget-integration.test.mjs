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

test('widget editor offers emoji icon, safe external URL and explicit empty page state',()=>{
 const widgets=readFileSync(new URL('../src/RoomWidgets.tsx',import.meta.url),'utf8')
 assert.match(widgets,/aria-label="自定义图标"/)
 assert.match(widgets,/aria-label="小组件网页地址"/)
 assert.match(widgets,/aria-label="小组件 HTML 内容"/)
 assert.match(widgets,/widget-content-empty/)
 assert.match(widgets,/https:/)
})
test('assistant widget creation refuses blank custom widget content',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(app,/不能创建空白小组件/)
 assert.match(app,/config=\{html,url,icon:/)
})

test('room widgets can be pinned by valid percent coordinates',()=>{
 const widgets=readFileSync(new URL('../src/RoomWidgets.tsx',import.meta.url),'utf8')
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(widgets,/function widgetPosition\(widget:/)
 assert.match(widgets,/aria-label="房间横向位置"/)
 assert.match(widgets,/aria-label="房间纵向位置"/)
 assert.match(widgets,/position:'absolute'/)
 assert.match(app,/roomX:\{type:'number'/)
 assert.match(app,/roomY:\{type:'number'/)
})
