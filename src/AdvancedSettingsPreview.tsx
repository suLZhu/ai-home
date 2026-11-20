import { useEffect, useState } from 'react'
import { AndroidSystemSettings } from './AndroidSystemSettings'
import { AppLockSettings } from './AppLockSettings'
import './AdvancedSettingsPreview.css'

type Panel = { id: string; title: string; note: string }
type Dialog = { title: string; description: string; destructive?: boolean; options?: string[] }

const toolPanels: Panel[] = [
  { id: 'mcp', title: 'MCP 服务', note: '连接配置、助手授权与连接状态' },
  { id: 'skills', title: '技能库', note: '已安装技能、调用权限、导入技能' },
  { id: 'web', title: '网页工具', note: '搜索和网页读取的可用状态' },
  { id: 'history', title: '工具调用记录', note: '查看工具的执行结果与异常' },
  { id: 'workspace', title: '助手工作区', note: '文件范围、读取与修改权限' },
]
const devicePanels: Panel[] = [
  { id: 'notify', title: '通知与铃声', note: '系统通知渠道、提示音与测试通知' },
  { id: 'background', title: '后台运行', note: '持续生成、电池优化与后台通知' },
  { id: 'lock', title: '应用锁', note: 'PIN、锁定名单与排除名单' },
  { id: 'backup', title: '备份与恢复', note: '导出、恢复及同步状态' },
]
export function AdvancedSettingsPreview({ kind }: { kind: 'tools' | 'device' }) {
  const [panel, setPanel] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState('')
  const [tools, setTools] = useState([{ id: 'sample', name: '示例 MCP 服务', enabled: false }])
  const items = kind === 'tools' ? toolPanels : devicePanels
  useEffect(() => { setPanel(''); setDialog(null); setNotice('') }, [kind])

  function row(label: string, detail: string, onClick: () => void, right = '›') {
    return <button type="button" className="qj-advanced-row" key={label} onClick={onClick}><span><b>{label}</b><small>{detail}</small></span><em>{right}</em></button>
  }
  return <div className="qj-advanced">
    <header className="qj-advanced-head">
      {panel && <button onClick={() => setPanel('')} aria-label="返回分类">‹ 返回分类</button>}
      <h2>{panel ? (items.find(x=>x.id===panel)?.title || '功能设置') : kind==='tools' ? '工具与扩展' : '应用与设备'}</h2>
      <p>{kind==='tools' ? '连接、授权和调用记录统一管理。' : '系统能力和应用安全集中管理。'} · 布局演示</p>
    </header>
    {!panel && <div className="qj-advanced-list">{items.map(item => row(item.title,item.note,()=>setPanel(item.id)))}</div>}
    {panel === 'mcp' && <div className="qj-advanced-body">
      <div className="qj-advanced-toolbar"><strong>已保存的服务</strong><button onClick={()=>setDialog({title:'添加 MCP 服务',description:'正式版应包含名称、连接地址、传输方式、助手授权和连接测试。当前仅展示入口。'})}>＋ 添加服务</button></div>
      <div className="qj-advanced-list">{tools.map(t=>row(t.name,t.enabled?'模拟已开启':'模拟未连接',()=>setDialog({title:t.name,description:'连接设置、测试、启停及删除操作需在接入真实 MCP 后生效。',options:['模拟启用','模拟停用','删除示例服务']}),t.enabled?'已启用 ›':'未连接 ›'))}</div>
      <p className="qj-advanced-note">服务授权应按助手分别设置，不允许跨助手误调用。</p>
    </div>}
    {panel === 'skills' && <div className="qj-advanced-body">
      <div className="qj-advanced-toolbar"><strong>技能管理</strong><button onClick={()=>setDialog({title:'导入技能',description:'正式版将读取技能说明文件，确认来源与工具权限后添加。'})}>＋ 导入</button></div>
      <div className="qj-advanced-list">
        {row('已安装技能','按助手设置可用范围',()=>setDialog({title:'已安装技能',description:'实际技能清单将在接入原版数据后显示。'}))}
        {row('技能运行记录','调用次数、错误与最近使用',()=>setDialog({title:'技能运行记录',description:'正式版从真实日志中读取。'}))}
      </div>
    </div>}
    {panel === 'web' && <div className="qj-advanced-list">
      {row('联网搜索','配置已有的网络搜索工具',()=>setDialog({title:'联网搜索',description:'实际可用搜索方式依赖已连接的模型、服务与工具。'}))}
      {row('网页读取','网页打开与正文获取',()=>setDialog({title:'网页读取',description:'正式版沿用原有网页工具与浏览器能力。'}))}
    </div>}
    {panel === 'history' && <div className="qj-advanced-body">
      <div className="qj-advanced-empty">暂无演示调用记录。正式版按助手、工具与执行时间筛选。</div>
    </div>}
    {panel === 'workspace' && <div className="qj-advanced-list">
      {row('工作目录','允许访问的文件夹范围',()=>setDialog({title:'工作目录',description:'正式版接入原工作区路径选择，不允许默认访问整个设备。'}))}
      {row('读取权限','读取和搜索文件',()=>setDialog({title:'读取权限',description:'由用户授权可读取的文件范围。'}))}
      {row('修改权限','写入、删除、执行命令',()=>setDialog({title:'修改权限',description:'敏感操作需要清楚的确认与审计。',destructive:true}))}
      {row('工作区自检','检查状态并显示中文结论',()=>setDialog({title:'工作区自检',description:'助手自动排查尚未接入，当前仅预留布局。'}))}
    </div>}
    {panel === 'notify' && <div className="qj-advanced-body">
      <AndroidSystemSettings
        people={['assistant-yanweixi','assistant-yanshuo']}
        displayName={id=>id==='assistant-yanweixi'?'小晏':'言朔'}
        avatarOf={()=>''}
      />
      <p className="qj-advanced-note">这里已接入真实 Android 通知偏好、系统能力状态与测试通知；电脑预览会自动显示不可用。</p>
    </div>}
    {panel === 'background' && <div className="qj-advanced-list">
      {row('后台持续生成','退出页面后继续生成回复',()=>setDialog({title:'后台持续生成',description:'正式版读取后台服务真实状态，不用模拟开关冒充成功。'}))}
      {row('电池优化白名单','跳转系统省电限制设置',()=>setDialog({title:'电池优化白名单',description:'权限需用户在 Android 系统设置中自行授权。'}))}
      {row('悬浮窗权限','显示授权状态',()=>setDialog({title:'悬浮窗',description:'需要原生设备权限，浏览器预览不可请求。'}))}
    </div>}
    {panel === 'lock' && <div className="qj-advanced-body">
      <AppLockSettings />
      <p className="qj-advanced-note">应用锁已接入原生真实应用列表、PIN 与无障碍服务状态。排除名单仍是下一步要补的原生能力。</p>
    </div>}
    {panel === 'backup' && <div className="qj-advanced-list">
      {row('导出备份','配置、助手与聊天资料',()=>setDialog({title:'导出备份',description:'正式版复用原有导出功能，演示模式不生成真实备份。'}))}
      {row('从备份恢复','恢复前需要核对覆盖范围',()=>setDialog({title:'恢复备份',description:'真实恢复涉及数据覆盖，必须确认。',destructive:true}))}
      {row('同步状态','查看云端备份及失败原因',()=>setDialog({title:'同步状态',description:'正式版从真实同步记录中读取。'}))}
    </div>}
    {notice && <p className="qj-advanced-notice" role="status">{notice}</p>}
    {dialog && <div className="qj-dialog-layer" onClick={()=>setDialog(null)}><div className="qj-dialog" role="dialog" aria-modal="true" aria-label={dialog.title} onClick={e=>e.stopPropagation()}>
      <h3>{dialog.title}</h3><p>{dialog.description}</p>
      {dialog.options && <div className="qj-dialog-options">{dialog.options.map(opt=><button key={opt} onClick={()=>{if(panel==='mcp'&&tools.length){if(opt==='删除示例服务')setTools([]);else setTools(xs=>xs.map(x=>({...x,enabled:opt==='模拟启用'})))}setNotice('仅模拟界面操作，没有连接真实服务。');setDialog(null)}}>{opt}<span>›</span></button>)}</div>}
      {dialog.destructive&&<p className="qj-dialog-warning">演示模式不会执行破坏性操作。</p>}
      <div className="qj-dialog-actions">
        <button className="qj-dialog-cancel" onClick={()=>setDialog(null)}>{dialog.destructive?'取消':'关闭'}</button>
        {dialog.destructive&&<button className="qj-dialog-danger" onClick={()=>{setNotice('演示确认完成，真实数据和权限没有改变。');setDialog(null)}}>确认操作</button>}
      </div>
    </div></div>}
  </div>
}
