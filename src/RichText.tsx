// 聊天里的富文本渲染：Markdown + 安全 HTML（折叠 / 表格 / 颜色 / 字号）。
// 先由 marked 转 HTML，再交给 DOMPurify 白名单消毒；最终用 React 注入。
import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { markdownToHtml, sanitizeInlineStyle } from './richText.mjs'
import './RichText.css'

// 只放行排版类标签；script/iframe/form/img/svg 等一律不在名单里。
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'details', 'summary', 'span', 'div', 'sup', 'sub', 'mark', 'kbd', 'a', 'img',
]
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'colspan', 'rowspan', 'align', 'open', 'style', 'src', 'alt', 'width', 'height', 'loading', 'referrerpolicy']

let hooksInstalled = false
function ensureHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style') {
      const clean = sanitizeInlineStyle(data.attrValue)
      if (!clean) data.keepAttr = false
      else data.attrValue = clean
    }
    // 只允许真正的安全链接，javascript: / data: 直接丢弃。
    if (data.attrName === 'href' && !/^(https?:|mailto:|tel:|#)/i.test(String(data.attrValue || '').trim())) {
      data.keepAttr = false
    }
  })
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || ''
      if (!/^(https?:\/\/|data:image\/)/i.test(src)) { node.removeAttribute('src'); return }
      node.setAttribute('loading', 'lazy')
      node.setAttribute('referrerpolicy', 'no-referrer')
    }
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch))
}

export function RichText({ text }: { text: string }) {
  const html = useMemo(() => {
    if (!text) return ''
    try {
      ensureHooks()
      return DOMPurify.sanitize(markdownToHtml(text), {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'video', 'audio', 'svg', 'math'],
      })
    } catch {
      return escapeHtml(text)
    }
  }, [text])

  // 链接在 WebView 里不要直接跳走：统一交给系统浏览器（失败就静默）。
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    if (!/^https?:/i.test(href)) return
    event.preventDefault()
    try { window.open(href, '_blank', 'noopener,noreferrer') } catch { /* 打不开就保持原文 */ }
  }

  return <div className="rich-text" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
