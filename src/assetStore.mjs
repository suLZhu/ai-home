// 自定义素材（字体/背景/气泡）大文件存储：IndexedDB，突破 localStorage ~5MB 配额。
// 旧数据仍在 localStorage 时读取即迁移；保存成功后清掉旧副本。
const DB_NAME = 'ai-home-assets'
const STORE = 'kv'
const ASSETS_KEY = 'customAssets'
const LEGACY_KEY = 'ai-home.customAssets'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function readLegacy(fallback) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch { /* 旧副本损坏则忽略 */ }
  return fallback
}

export async function loadCustomAssets(fallback) {
  try {
    const db = await openDb()
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(ASSETS_KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (value && typeof value === 'object') return { ...fallback, ...value }
  } catch { /* 无 IDB 或读取失败：回退 localStorage 旧数据 */ }
  return readLegacy(fallback)
}

export async function saveCustomAssets(assets) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(assets, ASSETS_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_KEY) } catch { /* 清理失败不影响保存 */ }
}
