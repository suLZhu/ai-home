// 极简基线：所有功能小图标来自一个真正的本地图片 sprite。
// 页面里不再内联 SVG，也不再用 data URI；Android WebView 只加载 /ui-icons-sprite.svg。
import type { CSSProperties, ReactElement } from 'react'

export type IconProps = { size?: number; className?: string }
export type IconComponent = (props: IconProps) => ReactElement

const ICON_KEYS = ["home","chat","user","settings","clock","memory","grid","calendar","coffee","photo","music","ledger","book","plus","sun","star","flower","list","palette","plug","chart","sparkles","folder","shield","info","back","chevron-right","chevron-down","chevron-up","close","edit","trash","eye","eye-off","arrow-up","arrow-down","switch","share","test","search","minus","file","warning","mail","lock","check","more","video","copy","refresh","emoji","menu","mic","stop","send"] as const
const ICON_INDEX: Record<string,number> = Object.fromEntries(ICON_KEYS.map((k,i)=>[k,i]))

function IconImage({name,size=20,className}:{name:string}&IconProps){
  const index=ICON_INDEX[name]??0
  const sheetWidth=ICON_KEYS.length*size
  const style={width:sheetWidth,height:size,maxWidth:'none',transform:'translateX(' + (-index*size) + 'px)'} as CSSProperties
  return <span className={'ui-icon-image'+(className?' '+className:'')} style={{width:size,height:size}} aria-hidden="true"><img src="/ui-icons-sprite.svg" alt="" draggable={false} style={style}/></span>
}

export const IconHome: IconComponent = props => <IconImage name="home" {...props}/>
export const IconChat: IconComponent = props => <IconImage name="chat" {...props}/>
export const IconUser: IconComponent = props => <IconImage name="user" {...props}/>
export const IconSettings: IconComponent = props => <IconImage name="settings" {...props}/>
export const IconClock: IconComponent = props => <IconImage name="clock" {...props}/>
export const IconMemory: IconComponent = props => <IconImage name="memory" {...props}/>
export const IconGrid: IconComponent = props => <IconImage name="grid" {...props}/>
export const IconCalendar: IconComponent = props => <IconImage name="calendar" {...props}/>
export const IconCoffee: IconComponent = props => <IconImage name="coffee" {...props}/>
export const IconPhoto: IconComponent = props => <IconImage name="photo" {...props}/>
export const IconMusic: IconComponent = props => <IconImage name="music" {...props}/>
export const IconLedger: IconComponent = props => <IconImage name="ledger" {...props}/>
export const IconBook: IconComponent = props => <IconImage name="book" {...props}/>
export const IconPlus: IconComponent = props => <IconImage name="plus" {...props}/>
export const IconSun: IconComponent = props => <IconImage name="sun" {...props}/>
export const IconStar: IconComponent = props => <IconImage name="star" {...props}/>
export const IconFlower: IconComponent = props => <IconImage name="flower" {...props}/>
export const IconList: IconComponent = props => <IconImage name="list" {...props}/>
export const IconPalette: IconComponent = props => <IconImage name="palette" {...props}/>
export const IconPlug: IconComponent = props => <IconImage name="plug" {...props}/>
export const IconChart: IconComponent = props => <IconImage name="chart" {...props}/>
export const IconSparkles: IconComponent = props => <IconImage name="sparkles" {...props}/>
export const IconFolder: IconComponent = props => <IconImage name="folder" {...props}/>
export const IconShield: IconComponent = props => <IconImage name="shield" {...props}/>
export const IconInfo: IconComponent = props => <IconImage name="info" {...props}/>
export const IconBack: IconComponent = props => <IconImage name="back" {...props}/>
export const IconChevronRight: IconComponent = props => <IconImage name="chevron-right" {...props}/>
export const IconChevronDown: IconComponent = props => <IconImage name="chevron-down" {...props}/>
export const IconChevronUp: IconComponent = props => <IconImage name="chevron-up" {...props}/>
export const IconClose: IconComponent = props => <IconImage name="close" {...props}/>
export const IconEdit: IconComponent = props => <IconImage name="edit" {...props}/>
export const IconTrash: IconComponent = props => <IconImage name="trash" {...props}/>
export const IconEye: IconComponent = props => <IconImage name="eye" {...props}/>
export const IconEyeOff: IconComponent = props => <IconImage name="eye-off" {...props}/>
export const IconArrowUp: IconComponent = props => <IconImage name="arrow-up" {...props}/>
export const IconArrowDown: IconComponent = props => <IconImage name="arrow-down" {...props}/>
export const IconSwitch: IconComponent = props => <IconImage name="switch" {...props}/>
export const IconShare: IconComponent = props => <IconImage name="share" {...props}/>
export const IconTest: IconComponent = props => <IconImage name="test" {...props}/>
export const IconSearch: IconComponent = props => <IconImage name="search" {...props}/>
export const IconMinus: IconComponent = props => <IconImage name="minus" {...props}/>
export const IconFile: IconComponent = props => <IconImage name="file" {...props}/>
export const IconWarning: IconComponent = props => <IconImage name="warning" {...props}/>
export const IconMail: IconComponent = props => <IconImage name="mail" {...props}/>
export const IconLock: IconComponent = props => <IconImage name="lock" {...props}/>
export const IconCheck: IconComponent = props => <IconImage name="check" {...props}/>
export const IconMore: IconComponent = props => <IconImage name="more" {...props}/>
export const IconVideo: IconComponent = props => <IconImage name="video" {...props}/>
export const IconCopy: IconComponent = props => <IconImage name="copy" {...props}/>
export const IconRefresh: IconComponent = props => <IconImage name="refresh" {...props}/>
export const IconEmoji: IconComponent = props => <IconImage name="emoji" {...props}/>
export const IconMenu: IconComponent = props => <IconImage name="menu" {...props}/>
export const IconMic: IconComponent = props => <IconImage name="mic" {...props}/>
export const IconStop: IconComponent = props => <IconImage name="stop" {...props}/>
export const IconSend: IconComponent = props => <IconImage name="send" {...props}/>
