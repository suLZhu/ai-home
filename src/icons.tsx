// 统一图标集：24×24 描边，currentColor，跟随字号与主题色。
//
// 之前在底部导航、首页和侧边栏里混用 emoji 与全角符号（☕ ▧ ♫ ¥ ✎），
// 不同 Android 字体渲染出来粗细不一。这里用同一套 SVG 统一，页面只引用组件。
import type { ReactElement, ReactNode } from 'react'

export type IconProps = { size?: number; className?: string }
export type IconComponent = (props: IconProps) => ReactElement

function Icon({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" focusable="false">{children}</svg>
}

export const IconHome: IconComponent = props => <Icon {...props}>
  <path d="M4 10.5 12 4l8 6.5" />
  <path d="M6 9.6V20h12V9.6" />
  <path d="M10 20v-5.5h4V20" />
</Icon>

export const IconChat: IconComponent = props => <Icon {...props}>
  <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16A2.5 2.5 0 0 1 4 13.5Z" />
  <path d="M8 9h8M8 12.5h5" />
</Icon>

export const IconUser: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="8" r="3.6" />
  <path d="M5 20c.9-3.6 3.6-5.4 7-5.4s6.1 1.8 7 5.4" />
</Icon>

export const IconSettings: IconComponent = props => <Icon {...props}>
  <path d="M4 7h9.5" />
  <circle cx="16.5" cy="7" r="2.3" />
  <path d="M20 17h-9.5" />
  <circle cx="7.5" cy="17" r="2.3" />
</Icon>

export const IconClock: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="12" r="8" />
  <path d="M12 7.5V12l3 2" />
</Icon>

export const IconMemory: IconComponent = props => <Icon {...props}>
  <path d="M12 3.6 13.8 9l5.4 1.8-5.4 1.8L12 18.4l-1.8-5.8L4.8 10.8 10.2 9Z" />
  <path d="M18.5 15.5v4M16.5 17.5h4" />
</Icon>

export const IconGrid: IconComponent = props => <Icon {...props}>
  <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
</Icon>

export const IconCalendar: IconComponent = props => <Icon {...props}>
  <rect x="4" y="5.5" width="16" height="14" rx="2.2" />
  <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4" />
</Icon>

export const IconCoffee: IconComponent = props => <Icon {...props}>
  <path d="M5 8h11v5.5a5.5 5.5 0 0 1-11 0Z" />
  <path d="M16 9.5h1.8a2.7 2.7 0 0 1 0 5.4H16" />
  <path d="M5 20h12" />
</Icon>

export const IconPhoto: IconComponent = props => <Icon {...props}>
  <rect x="4" y="5" width="16" height="14" rx="2.2" />
  <circle cx="9" cy="10" r="1.6" />
  <path d="m5 17 4.5-4 3 2.5L16 12l4 4" />
</Icon>

export const IconMusic: IconComponent = props => <Icon {...props}>
  <path d="M9 18V6.5l9-2v11" />
  <circle cx="7.5" cy="18" r="2" />
  <circle cx="16.5" cy="15.5" r="2" />
</Icon>

export const IconLedger: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="12" r="8" />
  <path d="M9 8.5 12 12l3-3.5M12 12v5M9.5 14h5" />
</Icon>

export const IconBook: IconComponent = props => <Icon {...props}>
  <path d="M6.5 4H18a1 1 0 0 1 1 1v15H8a2 2 0 0 1-2-2Z" />
  <path d="M6.5 4v14M6 20h13" />
</Icon>

export const IconPlus: IconComponent = props => <Icon {...props}>
  <path d="M12 5v14M5 12h14" />
</Icon>

export const IconSun: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
</Icon>

export const IconStar: IconComponent = props => <Icon {...props}>
  <path d="M12 3.2 14.3 9.7 20.8 12l-6.5 2.3L12 20.8l-2.3-6.5L3.2 12l6.5-2.3Z" />
</Icon>

export const IconFlower: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="12" r="2.2" />
  <path d="M12 9.8V5.5M14.1 10.8l3.6-2.1M14.1 13.2l3.6 2.1M12 14.2v4.3M9.9 13.2l-3.6 2.1M9.9 10.8 6.3 8.7" />
  <circle cx="12" cy="4.2" r="1.4" />
  <circle cx="18.6" cy="8" r="1.4" />
  <circle cx="18.6" cy="16" r="1.4" />
  <circle cx="12" cy="19.8" r="1.4" />
  <circle cx="5.4" cy="16" r="1.4" />
  <circle cx="5.4" cy="8" r="1.4" />
</Icon>

export const IconList: IconComponent = props => <Icon {...props}>
  <path d="M8 6h12M8 12h12M8 18h12" />
  <path d="M4 6h.01M4 12h.01M4 18h.01" />
</Icon>

// 设置列表与工具入口用的几个（同一套 24×24 描边，风格与上面一致）。
export const IconPalette: IconComponent = props => <Icon {...props}>
  <path d="M12 21a9 9 0 1 1 9-9c0 2-1.8 3.2-3.8 3.2h-1.4a1.8 1.8 0 0 0-1.4 2.9 1.6 1.6 0 0 1-1.3 2.5Z" />
  <circle cx="13.6" cy="7" r=".9" />
  <circle cx="17.4" cy="10.4" r=".9" />
  <circle cx="7" cy="11.4" r=".9" />
  <circle cx="9" cy="7.2" r=".9" />
</Icon>

export const IconPlug: IconComponent = props => <Icon {...props}>
  <path d="M12 21v-4.2" />
  <path d="M9 8V3.5M15 8V3.5" />
  <path d="M17 8.5v3.4a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8.5Z" />
</Icon>

export const IconChart: IconComponent = props => <Icon {...props}>
  <path d="M4 4v15.5h16" />
  <path d="M8 16.5v-3M12.5 16.5V8M17 16.5v-5.5" />
</Icon>

export const IconSparkles: IconComponent = props => <Icon {...props}>
  <path d="M12 4.2 13.3 8.7l4.5 1.3-4.5 1.3L12 15.8l-1.3-4.5L6.2 10l4.5-1.3Z" />
  <path d="M18.6 15.4v3.2M17 17h3.2" />
</Icon>

export const IconFolder: IconComponent = props => <Icon {...props}>
  <path d="M4 7.2A1.7 1.7 0 0 1 5.7 5.5h3.6l1.8 2h6.2A1.7 1.7 0 0 1 19 9.2v7.6a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 16.8Z" />
</Icon>

export const IconShield: IconComponent = props => <Icon {...props}>
  <path d="M12 3.6 19 6v5.6c0 4-2.9 6.9-7 8.4-4.1-1.5-7-4.4-7-8.4V6Z" />
  <path d="m9 11.6 2 2 4-4" />
</Icon>

export const IconInfo: IconComponent = props => <Icon {...props}>
  <circle cx="12" cy="12" r="8.2" />
  <path d="M12 11v5M12 8.2h.01" />
</Icon>
