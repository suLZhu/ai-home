// App 内置浏览器：助手调用 open_web_page 时弹出，用户随时可以关掉。
// 用 iframe 做内嵌；部分站点禁止被 iframe 嵌入，底部提供「在浏览器打开」兜底。
import './WebBrowser.css'
import { openNativeWebView } from './nativeSystem.mjs'
import { IconClose } from './icons'

export type WebPage = { url: string; title?: string }

export function WebBrowser({ page, onClose }: { page: WebPage | null; onClose: () => void }) {
  if (!page) return null
  let host = ''
  try { host = new URL(page.url).hostname } catch { host = page.url }
  return <div className="web-browser-scrim" role="presentation" onClick={onClose}>
    <div className="web-browser" role="dialog" aria-modal="true" aria-label={page.title || host} onClick={event => event.stopPropagation()}>
      <header className="web-browser-head">
        <span className="web-browser-title"><b>{page.title || host}</b><small>{host}</small></span>
        <button type="button" className="web-browser-inapp" onClick={() => { if (openNativeWebView(page.url, page.title || '')) onClose() }}>内置</button>
        <button type="button" className="web-browser-external" onClick={() => window.open(page.url, '_blank', 'noopener')}>外部</button>
        <button type="button" className="web-browser-close" onClick={onClose} aria-label="关闭内置浏览器"><IconClose size={15}/></button>
      </header>
      <iframe className="web-browser-frame" src={page.url} title={page.title || host}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"/>
      <footer className="web-browser-foot">如果页面空白，是这个站点不允许内嵌；点右上角「在浏览器打开」，或直接关掉。</footer>
    </div>
  </div>
}
