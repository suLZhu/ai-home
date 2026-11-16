import { useEffect, useState } from 'react'
import { subscribeDialog, resolveDialog, type DialogOptions } from './uiDialog'
import './UiDialog.css'

type State = { options: DialogOptions } | null

// 全局只挂一次；任何页面调用 confirmDialog/alertDialog 都会在这里渲染主题化卡片。
export function UiDialogHost() {
  const [state, setState] = useState<State>(null)
  useEffect(() => subscribeDialog(next => setState(next)), [])
  if (!state) return null
  const { options } = state
  return <div className="ui-dialog-scrim" onClick={() => resolveDialog(false)}>
    <div className="ui-dialog" role="dialog" aria-modal="true" aria-label={options.title || '确认'} onClick={event => event.stopPropagation()}>
      {options.title && <b className="ui-dialog-title">{options.title}</b>}
      <p className="ui-dialog-message">{options.message}</p>
      <div className="ui-dialog-actions">
        {!options.hideCancel && <button type="button" className="ui-dialog-cancel" onClick={() => resolveDialog(false)}>{options.cancelLabel || '取消'}</button>}
        <button type="button" className={'ui-dialog-ok' + (options.danger ? ' danger' : '')} onClick={() => resolveDialog(true)}>{options.confirmLabel || '确定'}</button>
      </div>
    </div>
  </div>
}
