// 聊天富文本：Markdown（表格/折叠/列表）与内联样式的白名单过滤。
// 这里测的是纯函数；浏览器端的 DOMPurify 消毒由 RichText.tsx 负责，
// 它只接收这里过滤过的 style，并被标签白名单约束。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeInlineStyle, normalizeRichText, markdownToHtml } from '../src/richText.mjs'

test('内联样式只保留颜色 / 字号 / 字重 / 下划线', () => {
  assert.equal(sanitizeInlineStyle('color:red;font-size:15px;font-weight:bold;text-decoration:underline'),
    'color:red;font-size:15px;font-weight:bold;text-decoration:underline')
  assert.equal(sanitizeInlineStyle('color:#c46a5a;background-color:rgba(0,0,0,.1)'),
    'color:#c46a5a;background-color:rgba(0,0,0,.1)')
})

test('危险或越界的样式被丢弃', () => {
  assert.equal(sanitizeInlineStyle('position:fixed;top:0;left:0;display:none'), '')
  assert.equal(sanitizeInlineStyle('background-image:url(https://x.test/a.png)'), '')
  assert.equal(sanitizeInlineStyle('font-size:99px;font-size:2px'), '', '超出 8–48px 的字号不要')
  assert.equal(sanitizeInlineStyle('font-size:15px;position:absolute'), 'font-size:15px')
  assert.equal(sanitizeInlineStyle('color:expression(alert(1))'), '')
})

test('字号边界：8–48px / 0.6–3em / 50–300%', () => {
  assert.equal(sanitizeInlineStyle('font-size:8px'), 'font-size:8px')
  assert.equal(sanitizeInlineStyle('font-size:48px'), 'font-size:48px')
  assert.equal(sanitizeInlineStyle('font-size:49px'), '')
  assert.equal(sanitizeInlineStyle('font-size:1.2em'), 'font-size:1.2em')
  assert.equal(sanitizeInlineStyle('font-size:4em'), '')
  assert.equal(sanitizeInlineStyle('font-size:120%'), 'font-size:120%')
})

test('旧式 <font color size> 转成 span 内联样式', () => {
  assert.equal(normalizeRichText('<font color="red" size="5">x</font>'), '<span style="color:red;font-size:19px">x</span>')
  assert.equal(normalizeRichText('<font color="#c46a5a">y</font>'), '<span style="color:#c46a5a">y</span>')
  assert.equal(normalizeRichText('<font>z</font>'), '<span>z</span>')
})

test('GFM 表格转成真正的 table 标签', () => {
  const html = markdownToHtml('| 项目 | 金额 |\n| --- | --- |\n| 咖啡 | 28 |')
  assert.match(html, /<table>/)
  assert.match(html, /<th>项目<\/th>/)
  assert.match(html, /<td>咖啡<\/td>/)
})

test('details/summary 折叠块原样保留，内部 Markdown 继续解析', () => {
  const html = markdownToHtml('<details>\n<summary>点我</summary>\n\n- 一\n- 二\n\n</details>')
  assert.match(html, /<details>/)
  assert.match(html, /<summary>点我<\/summary>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<li>一<\/li>/)
})

test('常见 Markdown：粗体 / 列表 / 代码 / 标题', () => {
  const html = markdownToHtml('## 标题\n\n**粗体** 和 `code`\n\n- a\n- b')
  assert.match(html, /<h2>标题<\/h2>/)
  assert.match(html, /<strong>粗体<\/strong>/)
  assert.match(html, /<code>code<\/code>/)
  assert.match(html, /<li>a<\/li>/)
})

test('行内 span 样式原样进入 HTML，留给 DOMPurify 过滤', () => {
  const html = markdownToHtml('前 <span style="color:#c46a5a;font-size:15px;position:fixed">大字</span> 后')
  assert.match(html, /<span style="color:#c46a5a;font-size:15px;position:fixed">/)
})

test('空文本不产生空标签', () => {
  assert.equal(markdownToHtml(''), '')
  assert.equal(markdownToHtml('   '), '')
})
