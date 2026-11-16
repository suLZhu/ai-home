// 应用内确认/提示框：替代 window.confirm / window.alert。
// 原生对话框在 Android WebView 里是系统白底方块，和栖间的色调完全不一致；
// 这里用一个全局宿主统一成主题卡片，调用方仍然按 Promise<boolean> 使用。
export type DialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  hideCancel?: boolean
}

type DialogState = { options: DialogOptions; resolve: (value: boolean) => void }

let listener: ((state: DialogState | null) => void) | null = null
let current: DialogState | null = null

export function confirmDialog(input: DialogOptions | string): Promise<boolean> {
  const options: DialogOptions = typeof input === 'string' ? { message: input } : input
  // 极端情况下宿主还没挂载：退回原生确认，绝不把操作卡死。
  if (!listener) return Promise.resolve(typeof window !== 'undefined' ? window.confirm(options.message) : false)
  return new Promise(resolve => {
    current = { options, resolve }
    listener?.(current)
  })
}

export function alertDialog(message: string, title = '提示'): Promise<void> {
  return confirmDialog({ title, message, confirmLabel: '知道了', hideCancel: true }).then(() => {})
}

export function subscribeDialog(fn: (state: DialogState | null) => void) {
  listener = fn
  return () => { if (listener === fn) listener = null }
}

export function resolveDialog(value: boolean) {
  const state = current
  current = null
  listener?.(null)
  state?.resolve(value)
}
