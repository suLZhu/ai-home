// Android 返回键处理栈（纯逻辑，可单测）。
// 规则：临时层（灯泡图/搜索/多选/表情/设置子页）先关；栈空时才允许退出到根/最小化。
// 组件挂载时 push 一个 handler，卸载时 pop；handleBack 从栈顶往下问，谁消费谁负责。

const handlers = []

// 注册一个返回键处理器，返回注销函数。后注册的先被问（栈顶优先）。
export function pushBackHandler(fn) {
  if (typeof fn !== 'function') return () => {}
  handlers.push(fn)
  return () => {
    const i = handlers.lastIndexOf(fn)
    if (i >= 0) handlers.splice(i, 1)
  }
}

// 询问栈顶是否消费本次返回。返回 true=已消费（不退出），false=栈空或无人消费（可退出到根）。
export function handleBack() {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const consumed = handlers[i]()
    if (consumed !== false) return true // 返回 undefined 也视为已消费（安全优先）
  }
  return false
}

// 仅供测试/调试：当前栈深。
export function backStackDepth() { return handlers.length }

// 仅供测试：清空栈。
export function clearBackHandlers() { handlers.length = 0 }
