// 栖间内置全局主题包：像手机主题一样统一整 App 的背景、控件、图标语义色、字体与聊天气泡。
// 系统功能图标固定使用线性 SVG；主题只负责颜色与视觉层级，不再用 emoji 替换功能图标。
export const BUILTIN_THEME_PACKS = [
  {
    format: 'qijian-theme-pack', version: 1, id: 'builtin-old-letter', name: '旧书信',
    author: '栖间', description: '暖纸、墨线、低饱和棕金；整 App 同一张书页气质',
    tokens: {
      accent: '#80604b', accentSoft: '#efe3cf', accentContrast: '#ffffff',
      pageBg: '#f2e8d5', surface: '#f8f1e4', surfaceElevated: '#fffaf0', card: '#f6eddc', field: '#fff9ed',
      ink: '#46392e', muted: '#897968', line: '#d7c4a9',
      ok: '#5f7f62', warning: '#a77833', danger: '#a85d58',
      control: '#fff8ec', controlHover: '#efe3cf', controlBorder: '#d7c4a9',
      icon: '#46392e', iconMuted: '#897968', iconAccent: '#80604b', iconOk: '#5f7f62', iconWarning: '#a77833', iconDanger: '#a85d58',
      buttonPrimary: '#80604b', buttonPrimaryText: '#ffffff',
      buttonSecondary: '#fff8ec', buttonSecondaryText: '#46392e', buttonSecondaryBorder: '#d7c4a9',
      buttonDanger: '#f2deda', buttonDangerText: '#9c514d',
    },
    background: { color: '#f2e8d5', opacity: 1 },
    bubble: { style: 'quill', radius: 20, me: '#eee0c5', ai: '#fff9ee' },
    font: { family: 'Georgia, "Songti SC", serif' },
  },
  {
    format: 'qijian-theme-pack', version: 1, id: 'builtin-pixel-arcade', name: '像素街机',
    author: '栖间', description: '深蓝霓虹；统一深色背景与高对比控件',
    tokens: {
      accent: '#ffbd43', accentSoft: '#25374e', accentContrast: '#17202b',
      pageBg: '#0b1b2d', surface: '#13273a', surfaceElevated: '#193249', card: '#172d42', field: '#1b3045',
      ink: '#eaf6ff', muted: '#a2bed1', line: '#47718c',
      ok: '#7bc69d', warning: '#ffbd43', danger: '#ef8d98',
      control: '#1b3045', controlHover: '#25374e', controlBorder: '#47718c',
      icon: '#eaf6ff', iconMuted: '#a2bed1', iconAccent: '#ffbd43', iconOk: '#7bc69d', iconWarning: '#ffbd43', iconDanger: '#ef8d98',
      buttonPrimary: '#ffbd43', buttonPrimaryText: '#17202b',
      buttonSecondary: '#1b3045', buttonSecondaryText: '#eaf6ff', buttonSecondaryBorder: '#47718c',
      buttonDanger: '#4b2832', buttonDangerText: '#ff9eaa',
    },
    background: { color: '#0b1b2d', opacity: 1 },
    bubble: { style: 'pixel', radius: 4, me: '#2a1c08', ai: '#0c1c2e' },
    font: { family: 'monospace' },
  },
]
