// 栖间内置主题包：首次打开即可选择，不需要下载 JSON/ZIP。
export const BUILTIN_THEME_PACKS = [
  {
    format: 'qijian-theme-pack', version: 1, id: 'builtin-old-letter', name: '旧书信',
    author: '栖间', description: '暖纸、墨线、手写信笺',
    tokens: { accent: '#80604b', accentSoft: '#efe3cf', surface: '#f7efdf', field: '#fff9ed', ink: '#46392e', muted: '#897968', line: '#d7c4a9' },
    background: { color: '#f5ecd9' }, bubble: { style: 'quill', radius: 20, me: '#eee0c5', ai: '#fff9ee' },
    font: { family: 'Georgia, Songti SC, serif' },
    icons: { world: '📜', chat: '✉️', memory: '🕯️', settings: '⚙️' },
  },
  {
    format: 'qijian-theme-pack', version: 1, id: 'builtin-pixel-arcade', name: '像素街机',
    author: '栖间', description: '深蓝霓虹、像素边框',
    tokens: { accent: '#ffbd43', accentSoft: '#25374e', surface: '#13273a', field: '#1b3045', ink: '#eaf6ff', muted: '#a2bed1', line: '#47718c' },
    background: { color: '#0b1b2d' }, bubble: { style: 'pixel', radius: 4, me: '#2a1c08', ai: '#0c1c2e' },
    font: { family: 'monospace' },
    icons: { world: '🎮', chat: '👾', memory: '💾', settings: '🕹️' },
  },
]
