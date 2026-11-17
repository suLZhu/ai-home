// 分类备份与恢复：模型 / 记忆 / 聊天 / 整体。
// 固定保存到手机「下载/栖间/」：有原生桥用 MediaStore，浏览器环境退回普通下载。
import { useEffect, useRef, useState } from 'react'
import './BackupCenter.css'
import { apiFetch, isLocalMode } from './apiBase.mjs'
import { confirmDialog } from './uiDialog'
import {
  BACKUP_DIR_LABEL, BACKUP_KINDS, backupKind, backupFileName, kindFromFileName,
  collectBackupLocal, localKeysForRestore, makeBackupEnvelope, parseBackup, summarizeBackup, summarizeChatBackup,
} from './backups.mjs'
import { backupFilesAvailable, deleteBackupFile, listBackupFiles, readBackupFile, saveBackupFile } from './nativeSystem.mjs'
import { syncVendorProfiles, type Vendor } from './vendors.mjs'
import { parseKelivoModelConfigs, kelivoConfigsToVendors, kelivoImportSummary } from './kelivoImport.mjs'
import type { ModelProfile } from './resourceBindings.mjs'
import { IconTrash } from './icons'

type BackupFile = { name: string; size: number; modifiedAt: number }

function formatSize(bytes: number): string {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n >= 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

function formatDate(timestamp: number): string {
  const date = new Date(Number(timestamp) || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function BackupCenter({ people, vendors, setVendors, setModelProfiles }: {
  people: string[]
  vendors: Vendor[]
  setVendors: React.Dispatch<React.SetStateAction<Vendor[]>>
  setModelProfiles: React.Dispatch<React.SetStateAction<ModelProfile[]>>
}) {
  const [files, setFiles] = useState<BackupFile[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const native = backupFilesAvailable()

  async function refreshFiles() {
    if (!native) return
    const list = listBackupFiles() as BackupFile[]
    if (!mounted.current) return
    setFiles(list.slice().sort((a, b) => Number(b.modifiedAt) - Number(a.modifiedAt)))
  }

  useEffect(() => {
    mounted.current = true
    void refreshFiles()
    return () => { mounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buildServer(kindId: string) {
    const kind = backupKind(kindId)
    const server: { keys?: Record<string, string>; memory?: Record<string, unknown[]> } = {}
    if (!kind || isLocalMode()) return server
    if (kind.serverKeys) {
      try {
        const response = await apiFetch('/api/keys', { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          if (data && data.keys && typeof data.keys === 'object') server.keys = data.keys
        }
      } catch { /* 服务器不可用时只备份本地可拿到的部分 */ }
    }
    if (kind.serverMemory && people.length) {
      const memory: Record<string, unknown[]> = {}
      await Promise.all(people.map(async person => {
        try {
          const response = await apiFetch('/api/memory/records?person=' + encodeURIComponent(person) + '&limit=1000', { credentials: 'include' })
          if (!response.ok) return
          const data = await response.json()
          if (Array.isArray(data.records)) memory[person] = data.records
        } catch { /* 单人失败不影响其他人的记忆 */ }
      }))
      if (Object.keys(memory).length) server.memory = memory
    }
    return server
  }

  async function createBackup(kindId: string) {
    if (busy) return
    const kind = backupKind(kindId)
    if (!kind) return
    setBusy(kindId)
    setError('')
    setMessage('')
    try {
      const local = collectBackupLocal(localStorage, kindId)
      const server = await buildServer(kindId)
      const payload = makeBackupEnvelope(kindId, local, server)
      const content = JSON.stringify(payload, null, 2)
      const name = backupFileName(kindId)
      if (native) {
        const saved = saveBackupFile(name, content)
        if (!saved?.ok) throw new Error(saved?.error || '写入下载目录失败')
        setMessage('已保存到 ' + BACKUP_DIR_LABEL + (saved.name || name))
        await refreshFiles()
      } else {
        const blob = new Blob([content], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = name
        anchor.click()
        URL.revokeObjectURL(url)
        setMessage('当前环境没有本机目录桥，已交给浏览器下载：' + name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '备份失败')
    } finally {
      setBusy('')
    }
  }

  async function applyRestore(payload: any, kindId: string, sourceName: string) {
    const kind = backupKind(kindId)
    if (!kind) throw new Error('未知的恢复类型')
    const local = localKeysForRestore(payload, kindId)
    const summary = summarizeBackup(payload)
    const chatSummary = (kindId === 'chat' || kindId === 'full') ? summarizeChatBackup(payload) : null
    if (kindId === 'chat' && !local['ai-home.conversations'] && !local['ai-home.messages']) throw new Error('备份中没有聊天记录，已取消恢复，现有数据未改动')
    const details = [
      chatSummary && chatSummary.conversationCount ? chatSummary.conversationCount + ' 个会话，' + chatSummary.messagesCount + ' 条消息' : '',
      Object.keys(local).length ? Object.keys(local).length + ' 项本地设置' : '',
      summary.memoryCount ? summary.memoryCount + ' 条记忆' : '',
      summary.apiKeys ? summary.apiKeys + ' 把 API Key' : '',
    ].filter(Boolean).join(' · ') || '空内容'
    const ok = await confirmDialog({
      title: '恢复' + kind.label,
      message: '用「' + sourceName + '」覆盖当前' + kind.label + '？\n包含：' + details + (chatSummary && chatSummary.preview.length ? '\n会话预览：' + chatSummary.preview.map(x => x.title).join('、') : '') + '\n恢复会替换相应分类现有数据，请先做好当前备份。' + (isLocalMode() ? '' : '\n服务器上的对应数据也会被写回。'),
      confirmLabel: '恢复',
      danger: true,
    })
    if (!ok) return
    for (const [key, value] of Object.entries(local)) {
      if (typeof value === 'string') localStorage.setItem(key, value)
    }
    if (!isLocalMode() && payload.data?.server) {
      const server = payload.data.server
      if ((kind.serverKeys || kindId === 'models') && server.keys && typeof server.keys === 'object') {
        for (const [person, apiKey] of Object.entries(server.keys)) {
          if (typeof apiKey !== 'string') continue
          await apiFetch('/api/keys', {
            method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person, apiKey }),
          })
        }
      }
      if (kind.serverMemory && server.memory && typeof server.memory === 'object') {
        for (const [person, records] of Object.entries(server.memory)) {
          if (!Array.isArray(records)) continue
          await apiFetch('/api/memory/import', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person, records }),
          })
        }
      }
    }
    // A local-only worldbook/MCP restore also needs cloud-write priority.
    // Otherwise startup may immediately replace it with an older snapshot.
    if (!isLocalMode() && Object.keys(local).length) localStorage.setItem('ai-home.restorePending', '1')
    // 恢复需要整页刷新才能让所有 useState 从新的 localStorage / 快照重新初始化。
    // 刷新前把用户当前所在的设置页记到 sessionStorage，避免每次恢复都被默认首页接管。
    try {
      sessionStorage.setItem('ai-home.afterRestorePage', 'settings')
      sessionStorage.setItem('ai-home.afterRestoreSection', 'data')
    } catch { /* sessionStorage 不可用时仍可正常恢复，只是回到默认页 */ }
    setMessage('已恢复' + kind.label + '，正在刷新…')
    window.setTimeout(() => location.reload(), 800)
  }

  async function importKelivoConfigs(configs: any[], sourceName: string) {
    const converted = kelivoConfigsToVendors(configs, vendors)
    if (!converted.length) throw new Error('这个文件里没有可导入的供应商（需要接口地址、Key 或模型名）')
    const summary = kelivoImportSummary(converted)
    const ok = await confirmDialog({
      title: '导入 Kelivo 模型配置',
      message: '识别到 ' + configs.length + ' 条配置，可导入 ' + summary.vendors + ' 个供应商、' + summary.models + ' 个模型。\n'
        + '文件：' + sourceName + '\n'
        + 'API Key 会一起保存到这台设备；导入后到「设置 → 供应商」查看，聊天模型面板里可以直接选。',
      confirmLabel: '导入',
    })
    if (!ok) return
    const next = [...vendors, ...converted]
    setVendors(next)
    setModelProfiles(old => syncVendorProfiles(next, old))
    setMessage('已导入 ' + summary.vendors + ' 个供应商、' + summary.models + ' 个模型。到「供应商」或聊天模型面板选用即可。')
  }

  async function handleRestoreText(text: string, kindId: string, sourceName: string) {
    try {
      const payload = parseBackup(text)
      await applyRestore(payload, kindId || payload.kind, sourceName)
      return
    } catch (err) {
      // 不是栖间的备份：尝试识别 Kelivo / 同类客户端的模型配置数组。
      const configs = parseKelivoModelConfigs(text)
      if (configs) { await importKelivoConfigs(configs, sourceName); return }
      throw err
    }
  }

  async function restoreFromText(text: string, kindId: string, sourceName: string) {
    if (busy) return
    setBusy(kindId)
    setError('')
    setMessage('')
    try {
      await handleRestoreText(text, kindId, sourceName)
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setBusy('')
    }
  }

  async function restoreFromFile(input: HTMLInputElement, kindId: string) {
    const file = input.files && input.files[0]
    if (!file) return
    try { await restoreFromText(await file.text(), kindId, file.name) }
    finally { input.value = '' }
  }

  async function restoreListed(file: BackupFile) {
    if (busy) return
    const kindId = kindFromFileName(file.name)
    setBusy(kindId || 'file')
    setError('')
    setMessage('')
    try {
      const read = readBackupFile(file.name)
      if (!read?.ok) throw new Error(read?.error || '读取备份失败')
      await handleRestoreText(String(read.content || ''), kindFromFileName(file.name), file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setBusy('')
    }
  }

  async function removeListed(file: BackupFile) {
    if (!(await confirmDialog({ title: '删除备份', message: '删除「' + file.name + '」？', confirmLabel: '删除', danger: true }))) return
    if (!deleteBackupFile(file.name)) { setError('删除失败'); return }
    setFiles(old => old.filter(item => item.name !== file.name))
  }

  return <section className="backup-center">
    <p className="backup-path">备份固定保存到 <b>{BACKUP_DIR_LABEL}</b>。可以只备份其中一类，恢复时按类覆盖，不会动其它数据。</p>
    <div className="backup-kind-list">
      {BACKUP_KINDS.map(kind => <div className="backup-kind" key={kind.id}>
        <span className="backup-kind-text"><b>{kind.label}</b><small>{kind.desc}</small></span>
        <span className="backup-kind-actions">
          <button type="button" className="backup-save" disabled={!!busy} onClick={() => void createBackup(kind.id)}>{busy === kind.id ? '备份中…' : '备份'}</button>
          <label className={'backup-restore' + (busy ? ' disabled' : '')}>恢复
            <input type="file" accept="application/json,.json" aria-label={'从文件恢复' + kind.label} disabled={!!busy}
              onChange={event => void restoreFromFile(event.currentTarget, kind.id)}/>
          </label>
        </span>
      </div>)}
    </div>
    {native && <div className="backup-files">
      <div className="backup-files-head"><b>本机备份</b><span>{files.length ? files.length + ' 个' : '还没有'}</span></div>
      {files.slice(0, 12).map(file => <div className="backup-file" key={file.name}>
        <span className="backup-file-text"><b>{file.name}</b><small>{formatDate(file.modifiedAt)} · {formatSize(file.size)}</small></span>
        <button type="button" className="backup-file-restore" disabled={!!busy} onClick={() => void restoreListed(file)}>恢复</button>
        <button type="button" className="backup-file-delete" aria-label={'删除 ' + file.name} onClick={() => void removeListed(file)}><IconTrash size={14}/></button>
      </div>)}
    </div>}
    {!native && <p className="backup-hint">当前环境没有本机存储桥：备份会走浏览器下载；恢复请用各分类右侧的「恢复」选文件。</p>}
    {error && <p className="mcp-error" role="alert">{error}</p>}
    {message && <p className="mcp-notice" role="status">{message}</p>}
    <p className="backup-warning">模型 / MCP / 整体备份可能包含 API Key、MCP 令牌等敏感配置，请只留在自己的设备上，不要把文件发给别人。</p>
  </section>
}
