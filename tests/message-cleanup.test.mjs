import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanupMessageText, createStreamCleanup } from '../src/messageCleanup.mjs'

// ── 完整文本清洗 ──

test('隐藏 <system_warning> 系统注入块，保留前后正文', () => {
  assert.equal(
    cleanupMessageText('前言。<system_warning>这是内部提示词，不该展示</system_warning>你好，今天怎么样？'),
    '前言。你好，今天怎么样？',
  )
})

test('未闭合的 <system_warning（流被截断）也不泄漏', () => {
  assert.equal(cleanupMessageText('正常内容<system_warning type="x">半截内部内容'), '正常内容')
})

test('清洗 function_calls / tool_calls / function_results 伪 XML 块', () => {
  assert.equal(
    cleanupMessageText('A<function_calls>{"name":"get_weather"}</function_calls>B'),
    'AB',
  )
  assert.equal(cleanupMessageText('A<tool_calls>[{"id":"call_1"}]</tool_calls>B'), 'AB')
  assert.equal(cleanupMessageText('A<function_results>{"temp":22}</function_results>B'), 'AB')
})

test('清洗 DSML tool_calls 块（全角与 ASCII 变体）', () => {
  assert.equal(
    cleanupMessageText('A<｜DSML｜tool_calls><｜DSML｜invoke name="x"><｜DSML｜parameter name="q">v</｜DSML｜parameter></｜DSML｜tool_calls>B'),
    'AB',
  )
  assert.equal(
    cleanupMessageText('A<|DSML|tool_calls><|DSML|invoke name="x">v</|DSML|tool_calls>B'),
    'AB',
  )
})

test('清洗独立 DSML 标签 / chatml token / 调用头 / 参数标签', () => {
  assert.equal(cleanupMessageText('前<｜DSML｜invoke name="foo">后'), '前后')
  assert.equal(cleanupMessageText('前<|DSML|parameter name="q">后'), '前后')
  assert.equal(cleanupMessageText('前<｜end▁of▁sentence｜>后'), '前后')
  assert.equal(cleanupMessageText('前<|im_start|>assistant<|im_end|>后'), '前assistant后')
  assert.equal(cleanupMessageText('assistant to=functions.get_weather 后'), 'assistant  后')
  assert.equal(cleanupMessageText('<invoke name="x"><parameter name="q">v</parameter></invoke>正文'), 'v正文')
})

test('正常文本不误伤：Markdown / 代码块 / 比较符号 / 中文 / 普通 HTML 标签', () => {
  const s = '如果 a < b 且 c > d，用 `code` 和 <div>标签</div>；\n**加粗** 与列表：\n- 第一项\n- 第二项\n以及 < 未闭合的小于号'
  assert.equal(cleanupMessageText(s), s)
})

test('非字符串 / 空输入返回空串', () => {
  assert.equal(cleanupMessageText(null), '')
  assert.equal(cleanupMessageText(undefined), '')
  assert.equal(cleanupMessageText(123), '')
  assert.equal(cleanupMessageText(''), '')
})

// ── 流式清洗：标签被拆到多个 chunk 也必须完全隐藏 ──

test('流式：system_warning 起始标签被拆开仍整块抑制', () => {
  const c = createStreamCleanup()
  const chunks = ['你好', '<system_warn', 'ing>内部提示词', '不要展示</system', '_warning>世界']
  let out = ''
  for (const x of chunks) out += c.push(x)
  out += c.flush()
  assert.equal(out, '你好世界')
  assert.ok(!out.includes('内部'), '不得泄漏块内内容')
})

test('流式：闭合标签被拆开，块后正文仍能显示', () => {
  const c = createStreamCleanup()
  let out = ''
  for (const x of ['A<system_warning>secret', 'more secret</system_warn', 'ing>B']) out += c.push(x)
  out += c.flush()
  assert.equal(out, 'AB')
})

test('流式：DSML tool_calls 块跨 chunk 抑制', () => {
  const c = createStreamCleanup()
  let out = ''
  for (const x of ['开', '始<｜DS', 'ML｜tool_calls>', '<｜DSML｜invoke name="x">', '参数</｜DSML｜tool_calls>', '结束']) out += c.push(x)
  out += c.flush()
  assert.equal(out, '开始结束')
})

test('流式：逐字符推送正常文本无损拼接', () => {
  const c = createStreamCleanup()
  const s = '这是一段正常回复，包含 < 小于号和 `代码`，还有 <div>标签</div>。'
  let out = ''
  for (const ch of s) out += c.push(ch)
  out += c.flush()
  assert.equal(out, s)
})

test('流式：未闭合的抑制块在 flush 时不泄漏，块前正文保留', () => {
  const c = createStreamCleanup()
  let out = ''
  for (const x of ['可见正文', '<function_calls>{"name":', '"secret"}']) out += c.push(x)
  out += c.flush()
  assert.equal(out, '可见正文')
})

test('流式：flush 冲刷尾部被暂缓的正常文本（含孤立 < 前缀）', () => {
  const c = createStreamCleanup()
  const a = c.push('回复结束前的文字 <')
  const b = c.flush()
  assert.equal(a + b, '回复结束前的文字 <')
})

test('流式：content 与 reasoning 各用独立实例，互不串状态', () => {
  const content = createStreamCleanup()
  const reasoning = createStreamCleanup()
  let c = ''
  let r = ''
  for (const x of ['正文', '<system_warning>注入', '</system_warning>续']) c += content.push(x)
  for (const x of ['思考', '内容']) r += reasoning.push(x)
  c += content.flush()
  r += reasoning.flush()
  assert.equal(c, '正文续')
  assert.equal(r, '思考内容')
})

test('流式：push 空串 / 非字符串安全返回空', () => {
  const c = createStreamCleanup()
  assert.equal(c.push(''), '')
  assert.equal(c.push(null), '')
  assert.equal(c.push(123), '')
  assert.equal(c.flush(), '')
})

// ── 等价性：任意分块方式下，流式结果必须等于完整文本清洗结果 ──

const FULL_CASES = [
  '前言<system_warning>内部提示</system_warning>正文',
  'A<function_calls>{"name":"x"}</function_calls>B<tool_calls>c</tool_calls>C',
  '甲<｜DSML｜tool_calls><｜DSML｜invoke name="x">v</｜DSML｜tool_calls>乙',
  '甲<|DSML|tool_calls>v</|DSML|tool_calls>乙',
  '前<｜DSML｜invoke name="foo">中<|im_start|>assistant<|im_end|>后',
  'assistant to=functions.get_weather {"city":"北京"} 正常回复',
  '完全没有标记的普通回复：a < b，中文与 English 混排。',
  '尾部有孤立小于号 <',
  'A<system_warning>未闭合的注入内容',
]

test('等价性：逐字符分块 push+flush === cleanupMessageText(全文)', () => {
  for (const full of FULL_CASES) {
    const c = createStreamCleanup()
    let out = ''
    for (const ch of full) out += c.push(ch)
    out += c.flush()
    assert.equal(out, cleanupMessageText(full), `逐字符分块不一致：${full}`)
  }
})

test('等价性：随机二分块 push+flush === cleanupMessageText(全文)', () => {
  const splits = [1, 2, 3, 5, 8, 13]
  for (const full of FULL_CASES) {
    for (const size of splits) {
      const c = createStreamCleanup()
      let out = ''
      for (let i = 0; i < full.length; i += size) out += c.push(full.slice(i, i + size))
      out += c.flush()
      assert.equal(out, cleanupMessageText(full), `分块 ${size} 不一致：${full}`)
    }
  }
})
