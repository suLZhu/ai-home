// 生成链路真机证据：在关键节点打点（带时间戳）。
// 双通道：console（Android logcat 可见：adb logcat -s AiHome:gen）+ localStorage 环形缓冲
// （最多 120 条，genDebug 不依赖任何 React 状态，纯函数可单测）。
//
// 这不是「修复」，而是「可观测性」：WebView 在后台被系统冻结时，这些点本身就不再被命中——
// 对比 generation_started / FGS started 与 generation_completed 之间是否缺失 stream_receiving，
// 即可判断后台生成是否被暂停。真机证据到手后再决定是否要上 native SSE / generation worker。
const STORAGE_KEY = 'ai-home.genDebug.v1'
export const GEN_DEBUG_CAP = 120

// 纯函数：把一条 entry 追加进环形缓冲并裁剪到 cap。便于单测，不碰任何全局状态。
export function appendGenDebugLog(arr, entry, cap = GEN_DEBUG_CAP) {
  const next = Array.isArray(arr) ? arr.slice() : []
  next.push(entry)
  while (next.length > cap) next.shift()
  return next
}

// 构造一条标准打点。t/iso 同时给，便于 logcat 与本地回查。
export function makeGenDebugEntry(stage, detail, now = Date.now()) {
  return { t: now, iso: new Date(now).toISOString(), stage: String(stage), detail: detail ?? null }
}

// 业务侧统一入口：打 console + 落环形缓冲。桌面无 localStorage 时静默降级。
export function genDebug(stage, detail) {
  const entry = makeGenDebugEntry(stage, detail)
  try { console.log('[AiHome:gen]', stage, detail ?? '') } catch { /* noop */ }
  try {
    const raw = JSON.parse(String(localStorage.getItem(STORAGE_KEY) || '[]'))
    const next = appendGenDebugLog(Array.isArray(raw) ? raw : [], entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* 存储不可用时仅保留 console 输出 */ }
  return entry
}

export function getGenDebugLog() {
  try { const raw = JSON.parse(String(localStorage.getItem(STORAGE_KEY) || '[]')); return Array.isArray(raw) ? raw : [] } catch { return [] }
}

export function clearGenDebugLog() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
}
