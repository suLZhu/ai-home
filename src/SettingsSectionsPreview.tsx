import { useEffect, useState } from 'react'
import './SettingsSectionsPreview.css'

type Row = { title: string; detail: string; kind?: 'toggle' | 'choice' | 'action' | 'danger'; options?: string[] }
type Group = { heading: string; rows: Row[] }

const compactTitles = new Set([
  '主题中心','聊天背景','气泡样式','消息显示','消息操作',
  '新消息提醒','后台生成','悬浮窗','应用锁','排除应用',
  '备份与恢复','最近的请求','错误记录','检查更新','关于栖间',
  '长期记忆','世界书','助手详情','独立会话','房间布置',
])

const pages: Record<string, Group[]> = {
  '外观与主题': [
    { heading: '外观', rows: [
      { title: '主题中心', detail: '色彩、全局主题、主题包' },
      { title: '聊天背景', detail: '为不同助手设置独立背景' },
      { title: '气泡样式', detail: '形状、边框与颜色' },
      { title: '字体大小', detail: '聊天文字大小', kind: 'choice', options: ['12 号', '13 号', '14 号', '15 号', '16 号'] },
    ] },
    { heading: '其他', rows: [{ title: '图标与点击效果', detail: '统一图标、动画和细节' }] },
  ],
  '聊天与消息': [
    { heading: '聊天体验', rows: [
      { title: '消息显示', detail: '头像、时间、消息间距' },
      { title: '消息操作', detail: '长按多选、编辑、删除、重新生成' },
      { title: '待发送消息', detail: '生成期间排队发送', kind: 'toggle' },
      { title: '连续工具调用', detail: '设置每次消息的调用轮数', kind: 'choice', options: ['5 轮', '10 轮', '15 轮', '20 轮'] },
    ] },
    { heading: '消息通知', rows: [
      { title: '新消息提醒', detail: '开启消息通知', kind: 'toggle' },
      { title: '提示声音', detail: '最终由 Android 通知渠道控制', kind: 'toggle' },
      { title: '振动提醒', detail: '跟随手机系统设置', kind: 'toggle' },
      { title: '通知铃声与测试', detail: '后续接入真实通知测试' },
    ] },
  ],
  '工具与扩展': [
    { heading: '工具连接', rows: [
      { title: 'MCP 服务', detail: '连接、停用与管理扩展工具' },
      { title: '技能库', detail: '导入与管理 SKILL 说明' },
      { title: '网页工具', detail: '联网搜索、内置浏览器' },
      { title: '工具调用记录', detail: '查看本次调用、结果和错误' },
    ] },
  ],
  '记忆与上下文': [
    { heading: '每位助手独立保存', rows: [
      { title: '长期记忆', detail: '查询、整理、确认和删除' },
      { title: '世界书', detail: '条目、关键词、绑定助手' },
      { title: '上下文压缩', detail: '历史摘要与对话轮数' },
      { title: '使用说明书', detail: '供助手按需查询栖间说明' },
    ] },
  ],
  '房间与助手': [
    { heading: '助手资料', rows: [
      { title: '助手详情', detail: '名称、设定、语言与形象' },
      { title: '独立会话', detail: '查看和切换助手聊天' },
      { title: '房间布置', detail: '场景、背景、组件' },
      { title: '房间小组件', detail: '清单、便签、记账和自定义内容' },
    ] },
  ],
  '应用与设备': [
    { heading: '通知与后台', rows: [
      { title: '系统通知设置', detail: '查看权限、打开 Android 通知渠道' },
      { title: '后台生成', detail: '切换应用后继续生成', kind: 'toggle' },
      { title: '电池优化', detail: '查看系统限制与白名单状态' },
      { title: '悬浮窗', detail: '权限与显示设置' },
    ] },
    { heading: '安全与数据', rows: [
      { title: '应用锁', detail: 'PIN、锁定的应用与排除名单' },
      { title: '排除应用', detail: '允许不受应用锁管理的应用' },
      { title: '备份与恢复', detail: '导出、恢复与云端同步' },
      { title: '清除临时数据', detail: '仅清理缓存；需二次确认', kind: 'danger' },
    ] },
  ],
  '诊断与维护': [
    { heading: '运行状态', rows: [
      { title: '最近的请求', detail: 'Token、耗时与模型调用' },
      { title: '错误记录', detail: '异常信息与排查建议' },
      { title: '工具运行日志', detail: '查看任务与工具调用记录' },
      { title: '检查更新', detail: '检查 APK 和界面资源' },
    ] },
    { heading: '帮助', rows: [
      { title: '栖间使用说明', detail: '查阅功能和权限说明' },
      { title: '关于栖间', detail: '版本信息、开源说明' },
    ] },
  ],
}

type ModalState = { title: string; detail: string; kind: 'info' | 'choice' | 'danger'; options?: string[] }

export function SettingsSectionsPreview({ section, onTheme }: { section: string; onTheme?: () => void }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [values, setValues] = useState<Record<string, boolean>>({})
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  useEffect(() => { setModal(null); setNotice('') }, [section])
  const groups = pages[section] || []
  function open(row: Row) {
    if (section === '外观与主题' && row.title === '主题中心' && onTheme) { onTheme(); return }
    if (row.kind === 'toggle') {
      setValues(old => ({...old, [row.title]: !(old[row.title] ?? false)}))
      return
    }
    setModal({ title: row.title, detail: row.detail, kind: row.kind === 'choice' ? 'choice' : row.kind === 'danger' ? 'danger' : 'info', options: row.options })
  }
  return <div className="qj-subpage">
    <div className="qj-subpage-intro"><h2>{section}</h2><p>页面交互预览 · 后续复用原版实际功能</p></div>
    {groups.map(group => <section className="qj-subpage-group" key={group.heading}>
      <h3>{group.heading}</h3><div className="qj-subpage-list">
        {group.rows.map(row => <button type="button" className="qj-subpage-row" key={row.title} onClick={() => open(row)}>
          <span className="qj-subpage-copy"><b>{row.title}</b>{!compactTitles.has(row.title)&&<small>{row.detail}</small>}</span>
          {row.kind === 'toggle' ? <span className={'qj-subpage-switch '+(values[row.title]?'on':'')} aria-label={values[row.title]?'已开启':'已关闭'}><i/></span> :
            <span className="qj-subpage-right">{choices[row.title] || (row.kind === 'danger' ? '谨慎操作' : '›')}</span>}
        </button>)}
      </div>
    </section>)}
    {notice && <p className="qj-subpage-notice" role="status">{notice}</p>}
    {modal && <div className="qj-dialog-layer" onClick={() => setModal(null)}>
      <div className="qj-dialog" role="dialog" aria-modal="true" aria-labelledby="qj-dialog-title" onClick={e => e.stopPropagation()}>
        <h3 id="qj-dialog-title">{modal.title}</h3>
        <p>{modal.kind === 'info' ? '此功能在布局阶段展示统一弹窗样式；后续接入原版功能。' : modal.detail}</p>
        {modal.kind === 'choice' && <div className="qj-dialog-options">
          {modal.options?.map(option => <button key={option} onClick={() => {setChoices(old => ({...old,[modal.title]:option}));setModal(null)}}>{option}<span>{choices[modal.title] === option?'✓':'›'}</span></button>)}
        </div>}
        {modal.kind === 'danger' && <p className="qj-dialog-warning">预览模式不会清除任何真实数据。</p>}
        <div className="qj-dialog-actions">
          <button className="qj-dialog-cancel" onClick={() => setModal(null)}>{modal.kind === 'info' ? '知道了' : '取消'}</button>
          {modal.kind === 'danger' && <button className="qj-dialog-danger" onClick={() => {setModal(null);setNotice('演示操作已确认，真实数据没有改变。')}}>确认操作</button>}
        </div>
      </div>
    </div>}
  </div>
}
