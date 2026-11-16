// 联网搜索结果解析：DuckDuckGo HTML 版（不需要 API Key）。
// 纯函数，服务端与本地原生模式共用；解析失败返回空数组，不伪造结果。
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => ENTITIES[name.toLowerCase()] || '')
}

export function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function resolveUrl(raw) {
  let url = decodeHtml(raw).trim()
  if (url.startsWith('//')) url = 'https:' + url
  try {
    const parsed = new URL(url)
    if (/(^|\.)duckduckgo\.com$/i.test(parsed.hostname)) {
      const target = parsed.searchParams.get('uddg')
      if (target) return decodeURIComponent(target)
    }
  } catch { return '' }
  return /^https?:\/\//i.test(url) ? url : ''
}

/** 从 DuckDuckGo HTML 里提取标题 / 链接 / 摘要，最多 limit 条。 */
export function parseSearchResults(html, limit = 8) {
  const source = String(html || '')
  const titles = []
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = linkPattern.exec(source)) && titles.length < Math.max(1, limit)) {
    const attrs = match[1] || ''
    if (!/result__a/i.test(attrs)) continue
    const href = attrs.match(/href="([^"]*)"/i)?.[1] || ''
    const url = resolveUrl(href)
    const title = stripHtml(match[2])
    if (!url || !title) continue
    if (titles.some(item => item.url === url)) continue
    titles.push({ title, url })
  }
  const snippets = []
  const snippetPattern = /<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  while ((match = snippetPattern.exec(source)) && snippets.length < titles.length) {
    snippets.push(stripHtml(match[1]))
  }
  return titles.map((item, index) => ({ ...item, snippet: snippets[index] || '' }))
}
