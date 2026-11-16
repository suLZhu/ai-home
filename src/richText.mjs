// 聊天富文本：Markdown（表格、代码块、列表、标题）+ 少量安全 HTML。
//
// 纯函数放这里，便于 Node 单测；真正的 DOM 消毒在 RichText.tsx 用 DOMPurify 做。
// 只保留「排版」需要的内联样式，任何可能影响页面结构的 CSS（position / url / display…）
// 一律丢弃——模型输出不可信，绝不允许改到气泡以外的界面。
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]{1,60}\)|hsla?\([^)]{1,60}\)|[a-z]{3,20})$/i
const SIZE_RE = /^(\d{1,3}(?:\.\d+)?)(px|em|rem|%)$/

/** 过滤内联 style：只留颜色 / 字号 / 字重 / 下划线，数值做上下限约束。 */
export function sanitizeInlineStyle(style) {
  const kept = []
  for (const part of String(style || '').split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    const prop = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (!value) continue
    if (prop === 'color' || prop === 'background-color') {
      if (COLOR_RE.test(value)) kept.push(prop + ':' + value)
    } else if (prop === 'font-size') {
      const match = SIZE_RE.exec(value)
      if (!match) continue
      const size = Number(match[1])
      const unit = match[2]
      const ok = unit === 'px' ? size >= 8 && size <= 48
        : unit === '%' ? size >= 50 && size <= 300
          : size >= 0.6 && size <= 3
      if (ok) kept.push('font-size:' + value)
    } else if (prop === 'font-weight') {
      if (/^(normal|bold|[1-9]00)$/i.test(value)) kept.push('font-weight:' + value)
    } else if (prop === 'text-decoration') {
      if (/^(underline|line-through|none)$/i.test(value)) kept.push('text-decoration:' + value)
    }
  }
  return kept.join(';')
}

// <font color size> 在老模型输出里很常见；先转成可过滤的 span，再交给 DOMPurify。
const FONT_SIZES = ['', '12px', '13px', '15px', '17px', '19px', '22px', '26px']
export function normalizeRichText(text) {
  return String(text || '')
    .replace(/<font\b([^>]*)>/gi, (_match, attrs) => {
      const color = /color\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] || ''
      const size = /size\s*=\s*["']?([1-7])/i.exec(attrs)?.[1] || ''
      const styles = []
      if (color && COLOR_RE.test(color)) styles.push('color:' + color)
      if (size) styles.push('font-size:' + FONT_SIZES[Number(size)])
      return styles.length ? '<span style="' + styles.join(';') + '">' : '<span>'
    })
    .replace(/<\/font\s*>/gi, '</span>')
}

/** Markdown → HTML（不消毒；消毒在浏览器端交给 DOMPurify）。 */
export function markdownToHtml(text) {
  const source = normalizeRichText(text)
  if (!source.trim()) return ''
  const html = marked.parse(source, { async: false, gfm: true, breaks: true })
  return typeof html === 'string' ? html : ''
}
