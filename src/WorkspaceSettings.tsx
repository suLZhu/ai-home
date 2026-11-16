// 本机工作区设置：根目录 + 三个开关（启用 / 写入 / 命令）。
// 只在服务器模式下可用；本地模式没有服务端文件系统。
import { useEffect, useState } from 'react'
import './WorkspaceSettings.css'
import { apiFetch, isLocalMode } from './apiBase.mjs'
import { SoftSelect } from './SoftSelect'

export type WorkspaceConfig = {
  person: string
  root: string
  enabled: boolean
  allowWrite: boolean
  allowCommand: boolean
  updatedAt?: string | null
  defaultRoot?: string
}

export function WorkspaceSettings({ people, displayName, onSaved }: {
  people: string[]
  displayName: (person: string) => string
  onSaved?: (config: WorkspaceConfig) => void
}) {
  const local = isLocalMode()
  const [person, setPerson] = useState(people[0] || '')
  const [config, setConfig] = useState<WorkspaceConfig | null>(null)
  const [root, setRoot] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [allowWrite, setAllowWrite] = useState(true)
  const [allowCommand, setAllowCommand] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (local || !person) return
    let alive = true
    setConfig(null)
    setError('')
    apiFetch('/api/workspace?person=' + encodeURIComponent(person), { credentials: 'include' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取工作区设置失败')
        if (!alive) return
        setConfig(data)
        setRoot(data.root || '')
        setEnabled(!!data.enabled)
        setAllowWrite(data.allowWrite !== false)
        setAllowCommand(data.allowCommand !== false)
      })
      .catch(error => { if (alive) setError(error instanceof Error ? error.message : '读取失败') })
    return () => { alive = false }
  }, [person, local])

  async function save() {
    if (busy || local) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch('/api/workspace', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person, root: root.trim(), enabled, allowWrite, allowCommand }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存失败')
      setConfig(data)
      setRoot(data.root || root)
      onSaved?.(data)
      setNotice(data.enabled ? '已保存。助手现在可以按上面的权限操作这个目录。' : '已保存（工作区关闭）。')
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败') }
    finally { setBusy(false) }
  }

  if (local) return <section className="workspace-settings">
    <p className="muted">本机工作区需要文件系统，而 APK 的网页层没有直接文件权限；它靠「服务器」提供文件、Git 与命令能力。</p>
    <div className="ws-local-guide">
      <b>不用额外内置一套系统</b>
      <p>这台手机的 DSH 环境已经是 Ubuntu（proot），在里面启动服务端即可：</p>
      <pre>cd /root/workspace/qijian-v76{String.fromCharCode(10)}node src/server.mjs</pre>
      <p>然后到「设置 → 数据与管理 → 云同步服务器地址」填 <code>http://127.0.0.1:4180</code>（端口以启动日志为准），登录后再回来开启工作区。</p>
      <p>如果以后想要「APK 自带 Linux」，需要打包一份 rootfs（通常 100MB 以上）和 Node，属于独立工程；当前推荐直接用现成的 proot。</p>
    </div>
  </section>

  return <section className="workspace-settings">
    <p className="muted">让助手操作<strong>服务器所在机器</strong>的文件。服务器在手机上就是手机的文件；部署在电脑上就是电脑的文件。所有路径都被限制在下面的根目录内。</p>
    <label className="ws-field">为哪位助手开启
      <SoftSelect ariaLabel="选择助手" value={person} onChange={setPerson} options={people.map(id => ({ value: id, label: displayName(id) }))}/>
    </label>
    <label className="ws-field">根目录
      <input value={root} onChange={e => setRoot(e.target.value)} placeholder="/root/workspace" autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
    </label>
    <p className="ws-hint">默认 {config?.defaultRoot || '服务端启动目录'}。写错会拒绝保存。</p>
    <div className="ws-toggles">
      <label><span><b>开启工作区</b><small>关闭时助手看不到任何文件工具</small></span><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/></label>
      <label><span><b>允许写入 / 删除 / 提交</b><small>每次仍会弹确认框</small></span><input type="checkbox" checked={allowWrite} onChange={e => setAllowWrite(e.target.checked)}/></label>
      <label><span><b>允许执行命令</b><small>以服务端用户身份运行，风险最高</small></span><input type="checkbox" checked={allowCommand} onChange={e => setAllowCommand(e.target.checked)}/></label>
    </div>
    {error && <p className="mcp-error" role="alert">{error}</p>}
    {notice && <p className="mcp-notice" role="status">{notice}</p>}
    <div className="ws-actions"><button type="button" disabled={busy || !root.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存工作区设置'}</button></div>
    <p className="ws-warning">提示：开启命令执行后，模型可以运行任意 bash 命令。请只在自己信任的目录、且你本人能接受风险时开启；每次执行仍会弹确认。</p>
  </section>
}
