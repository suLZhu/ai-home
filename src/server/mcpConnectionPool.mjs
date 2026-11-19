/**
 * MCP 长连接池：后端进程运行期间按连接 ID 重用会话。
 *
 * 同一项配置的首次连接并发去重；配置更新时通过 version 切换；
 * 获取工具失败允许后续重新连接，但工具调用不自动重试，
 * 防止重复执行有副作用的操作。
 */
export function createMcpConnectionPool({ createClient, maxConnections = 48 }) {
  if (typeof createClient !== 'function') throw new TypeError('createClient required')
  const entries = new Map()
  let closed = false

  async function drop(key) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    entry.invalidated = true
    try {
      const ready = await entry.promise
      await ready.client.close().catch(() => {})
    } catch { /* failed connections have no client */ }
  }

  async function acquire(key, version, config) {
    if (closed) throw new Error('MCP 连接池已经关闭')
    const old = entries.get(key)
    if (old && old.version === version && !old.invalidated) return old.promise
    if (old) await drop(key)
    // LRU 限制后台连接数量，避免添加大量服务时耗尽 socket。
    if (entries.size >= maxConnections) {
      const leastUsed = [...entries.entries()].sort((a,b)=>a[1].usedAt-b[1].usedAt)[0]
      if (leastUsed) await drop(leastUsed[0])
    }
    const entry = { version, invalidated: false, usedAt: Date.now(), promise: null }
    entry.promise = (async () => {
      const result = await createClient(config)
      if (entry.invalidated || closed) {
        await result.client.close().catch(() => {})
        throw new Error('MCP 连接配置已失效')
      }
      return result
    })()
    entries.set(key, entry)
    try { return await entry.promise }
    catch (error) {
      if (entries.get(key) === entry) entries.delete(key)
      throw error
    }
  }

  async function use(key, version, config, operation) {
    const result = await acquire(key, version, config)
    const entry = entries.get(key)
    if (entry?.version === version) entry.usedAt = Date.now()
    try { return await operation(result.client) }
    catch (error) {
      // 无条件清理故障连接以供下次重连，不自动重复本次工具调用。
      if (entries.get(key)?.version === version) await drop(key)
      throw error
    }
  }

  async function close() {
    closed = true
    await Promise.all([...entries.keys()].map(drop))
  }

  return { use, drop, close, get size() { return entries.size } }
}
