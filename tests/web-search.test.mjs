// 联网搜索：DuckDuckGo HTML 解析与链接还原。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeHtml, parseSearchResults } from '../src/webSearch.mjs'

const html = `
<div class="result results_links">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&amp;rut=abc">桂花茶 <b>怎么泡</b></a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">用 85 度的水，泡三分钟。</a>
</div>
<div class="result results_links">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="https://example.org/b">第二个 &amp; 结果</a>
  </h2>
  <a class="result__snippet">摘要二</a>
</div>
`

test('解析出标题、真实链接与摘要', () => {
  const results = parseSearchResults(html)
  assert.equal(results.length, 2)
  assert.equal(results[0].title, '桂花茶 怎么泡')
  assert.equal(results[0].url, 'https://example.com/a?x=1')
  assert.equal(results[0].snippet, '用 85 度的水，泡三分钟。')
  assert.equal(results[1].url, 'https://example.org/b')
  assert.equal(results[1].title, '第二个 & 结果')
})

test('限制条数、跳过无链接项、实体解码', () => {
  assert.equal(parseSearchResults(html, 1).length, 1)
  assert.equal(parseSearchResults('<a class="result__a">没有链接</a>').length, 0)
  assert.equal(decodeHtml('&lt;b&gt;&#x4F60;&#22909;'), '<b>你好')
})
