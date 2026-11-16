// 模型输出清洗：把订阅渠道/逆向接口偶尔吐进正文的「系统注入 + 工具协议」标记去掉。
// 这些标记不是本应用注入的，而是上游模型把内部协议原样写进了 content / reasoning：
//   P1-2  <system_warning>…</system_warning> 系统注入块（整块隐藏，绝不展示给用户）
//   P1-3  DSML <｜DSML｜…> / <|DSML|…> 工具标签与 tool_calls 块、
//         <function_calls> / <tool_calls> / <function_results> 伪 XML 块、
//         to=functions.xxx 调用头与 <invoke>/<parameter> 参数标签。
//
// 关键约束：SSE 是逐块到达的，一个标签可能被拆进多个 chunk（例如
// "<system_warn" + "ing>…</system_warning>"）。逐块独立正则永远认不出跨块的标签，
// 真机上就会继续泄漏。因此除完整文本清洗外，另提供有状态的流式清洗器：
//   createStreamCleanup() → { push(chunk), flush() }
// push 只吐出「已经能确定安全」的文本，把可能是标记前缀的尾巴留在缓冲里；
// 进入抑制块后整块丢弃，直到匹配到闭合标记；flush 在流结束时冲刷残留。
// 本模块无网络、无存储、无 DOM 依赖，纯逻辑，可直接单测。

// ── 块级规则：命中 open 后，直到 close 为止（含未闭合到结尾）全部抑制 ──
const BLOCK_RULES = [
  { open: /<system_warning\b[^>]*>/i, close: /<\/system_warning\s*>/i },
  { open: /<function_calls\b[^>]*>/i, close: /<\/function_calls\s*>/i },
  { open: /<tool_calls\b[^>]*>/i, close: /<\/tool_calls\s*>/i },
  { open: /<function_results\b[^>]*>/i, close: /<\/function_results\s*>/i },
  { open: /<｜\s*DSML｜tool_calls\b[^>]*>/i, close: /<\/｜\s*DSML｜tool_calls\s*>/i },
  { open: /<\|\s*DSML\|tool_calls\b[^>]*>/i, close: /<\/\|\s*DSML\|tool_calls\s*>/i },
]

// ── 行内规则：独立标签 / 调用头，就地删除，保留周围正常文本 ──
const INLINE_PATTERNS = [
  /<\/?｜?DSML｜[^>]*>/gi,                    // <｜DSML｜invoke name="x"> / </｜DSML｜parameter>
  /<\/?\|?DSML\|[^>]*>/gi,                    // ASCII 变体 <|DSML|invoke …> / </|DSML|…>
  /<｜[^｜>\n]{0,80}｜>/g,                     // 全角特殊 token，如 <｜end▁of▁sentence｜>
  /<\|[^|>\n]{0,80}\|>/g,                     // ASCII chatml token，如 <|im_start|>
  /<\/?(?:invoke|parameter)\b[^>]*>/gi,        // 伪 XML 工具参数标签
  /\bto=functions\.[A-Za-z0-9_.:-]*/gi,       // GPT 网页版函数调用头（含刚到「.」的半截）
]

/** 清洗一段完整文本（历史消息渲染兜底 / 落盘前兜底 / 流式内部复用）。 */
export function cleanupMessageText(input) {
  let text = typeof input === 'string' ? input : ''
  if (!text) return text
  for (const rule of BLOCK_RULES) {
    // 已闭合的块：连同标签一起删。
    text = text.replace(new RegExp(rule.open.source + '[\\s\\S]*?' + rule.close.source, 'gi'), '')
    // 未闭合的块（生成被中止 / 上游截断）：从 open 到结尾都算协议内容，宁可少显示也不泄漏。
    text = text.replace(new RegExp(rule.open.source + '[\\s\\S]*$', 'i'), '')
  }
  for (const re of INLINE_PATTERNS) text = text.replace(re, '')
  return text
}

// 用于判断「缓冲末尾是否只是某个标记的前缀」——是则暂不输出，等下一块拼完整。
const MARKER_PREFIXES = [
  '<system_warning', '</system_warning',
  '<function_calls', '</function_calls',
  '<tool_calls', '</tool_calls',
  '<function_results', '</function_results',
  '<｜DSML｜', '</｜DSML｜', '<|DSML|', '</|DSML|',
  '<｜', '<|', '＜｜',
  '<invoke', '</invoke', '<parameter', '</parameter',
  'to=functions.',
]

function tailHold(s) {
  let best = 0
  for (const m of MARKER_PREFIXES) {
    for (let k = Math.min(m.length - 1, s.length); k >= 1; k--) {
      if (s.endsWith(m.slice(0, k))) { best = Math.max(best, k); break }
    }
  }
  // 任意尚未闭合的尖括号标签（<｜begin… / <div 等）：从最后一个 < 起整段保留，
  // 避免跨块的独立标签前半段被当成正文先吐出去。
  const lastOpen = Math.max(s.lastIndexOf('<'), s.lastIndexOf('＜'))
  if (lastOpen >= 0 && s.indexOf('>', lastOpen) === -1) best = Math.max(best, s.length - lastOpen)
  // 调用头不以 < 开头，尖括号规则管不到它：只要末尾还在「to=functions.xxx」的
  // 字符范围内，就整段暂缓，等遇到空格/换行/引号再一次性清洗并输出。
  const callHead = /to=functions\.[A-Za-z0-9_.:-]*$/.exec(s)
  if (callHead) best = Math.max(best, s.length - callHead.index)
  return Math.min(best, s.length)
}

/**
 * 有状态的流式清洗器。content 与 reasoning 各用一个实例，互不干扰。
 * push 返回「本次可以安全显示」的增量文本；flush 返回流结束时剩余的可见文本。
 */
export function createStreamCleanup() {
  let pending = ''
  let closeRe = null // 非 null = 正处在某个抑制块内部
  function drain(final) {
    let out = ''
    for (let guard = 0; guard < 1000; guard++) {
      if (closeRe) {
        const m = closeRe.exec(pending)
        if (m) { pending = pending.slice(m.index + m[0].length); closeRe = null; continue }
        if (final) { pending = ''; closeRe = null; break } // 未闭合的抑制块：全部丢弃
        const hold = tailHold(pending)
        pending = pending.slice(pending.length - hold) // 只留下可能跨块的 close 前缀
        break
      }
      // 找最早的完整块起始标记
      let earliest = null
      for (const rule of BLOCK_RULES) {
        const m = rule.open.exec(pending)
        if (m && (!earliest || m.index < earliest.index)) {
          earliest = { index: m.index, length: m[0].length, close: rule.close }
        }
      }
      if (earliest) {
        out += cleanupMessageText(pending.slice(0, earliest.index))
        pending = pending.slice(earliest.index + earliest.length)
        closeRe = earliest.close
        continue
      }
      if (final) { out += cleanupMessageText(pending); pending = ''; break }
      const hold = tailHold(pending)
      const emitLen = pending.length - hold
      if (emitLen > 0) {
        out += cleanupMessageText(pending.slice(0, emitLen))
        pending = pending.slice(emitLen)
      }
      break
    }
    return out
  }
  return {
    push(chunk) {
      if (typeof chunk !== 'string' || !chunk) return ''
      pending += chunk
      return drain(false)
    },
    flush() { return drain(true) },
  }
}
