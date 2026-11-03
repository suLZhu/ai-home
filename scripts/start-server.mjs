// 一键启动后端（Android 局域网模式）。用法：npm start
//
// 解决的麻烦（对应「怎么登录这么麻烦」）：
//   以前：手动设 4 个环境变量 + 自己找局域网 IP + HTTPS 反代，手机才连得上。
//   现在：一条命令 → 脚本备好密码和跨域配置、把服务绑到 0.0.0.0、
//         直接打印出手机端要粘贴的 API 地址和登录密码。
//
// 职责边界（保持 Phase 10「不改业务」原则）：
//   - 只设置服务端启动参数（AI_HOME_BIND / AI_HOME_ALLOWED_ORIGIN / AI_HOME_PORT），
//     不改 server.mjs 的任何业务逻辑；
//   - .ai-home.env 里已有的配置优先，脚本只补缺失项（密码、绑定地址、放行来源）。
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { networkInterfaces } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = join(ROOT, '.ai-home.env')
const SERVER_PATH = join(ROOT, 'src', 'server.mjs')
const APK_PATH = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

// ── 纯函数（可单测）─────────────────────────────────────────────────────────

// 极简 .env 解析：KEY=VALUE，# 注释与空行忽略，值两侧成对引号剥掉。
export function parseEnvFile(text) {
  const env = {}
  for (const line of String(text == null ? '' : text).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (key) env[key] = value
  }
  return env
}

// 24 位随机密码（大小写字母+数字，剔除易混淆的 0/O/1/l/I），远超服务端 ≥16 位门槛。
export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(24)
  let out = ''
  for (let i = 0; i < 24; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

// 确保 .ai-home.env 里有一个可用密码：已有且 ≥16 位则原样使用；
// 缺失或过短则生成新的写回文件。返回 { password, created }。
export function ensurePassword(envPath, fs = { readFileSync, writeFileSync }) {
  let text = ''
  try { text = String(fs.readFileSync(envPath, 'utf8')) } catch { text = '' }
  const existing = parseEnvFile(text).AI_HOME_PASSWORD || ''
  if (existing.length >= 16) return { password: existing, created: false }
  const password = generatePassword()
  const kept = text.split(/\r?\n/).filter(line => !line.trim().startsWith('AI_HOME_PASSWORD='))
  while (kept.length && kept[kept.length - 1] === '') kept.pop()
  kept.push(`AI_HOME_PASSWORD=${password}`)
  fs.writeFileSync(envPath, kept.join('\n') + '\n', 'utf8')
  return { password, created: true }
}

// 合并启动环境：env 文件 > shell 环境 > 局域网模式默认值。
// 默认值即「手机可连」的关键：绑定 0.0.0.0 + 放行 Android WebView 的源 https://localhost。
export function buildServerEnv(fileEnv, baseEnv = process.env) {
  const pick = (key, fallback) => fileEnv[key] || baseEnv[key] || fallback
  return {
    ...baseEnv,
    ...fileEnv,
    AI_HOME_BIND: pick('AI_HOME_BIND', '0.0.0.0'),
    AI_HOME_ALLOWED_ORIGIN: pick('AI_HOME_ALLOWED_ORIGIN', 'https://localhost'),
  }
}

// 挑一个可给手机用的本机 IPv4。
// 排序规则（真实机器上踩过坑：Clash TUN 的 fake-IP 198.18.0.1 会排在真实网卡前面）：
//   1. 直接排除：回环、169.254 链路本地、198.18.0.0/15（基准测试/fake-IP 段，Clash Meta 等）、
//      100.64.0.0/10（CGNAT/Tailscale 虚拟网卡）——这些手机都到不了；
//   2. 优先级：192.168.x（家用路由器）> 10.x > 172.16-31.x（Docker 常占，排最后）> 其他。
//   3. AI_HOME_LAN_IP 可强制指定（多网卡时的逃生口）。
export function pickLanIPv4(nets = networkInterfaces(), override = '') {
  const forced = String(override || '').trim()
  if (forced) return forced
  const rank = address => {
    if (/^192\.168\./.test(address)) return 0
    if (/^10\./.test(address)) return 1
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2
    return 3
  }
  let best = ''
  let bestRank = Infinity
  for (const entries of Object.values(nets || {})) {
    for (const entry of entries || []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4
      const address = String(entry.address || '')
      if (!isV4 || entry.internal) continue
      if (address.startsWith('169.254.')) continue
      if (/^198\.18\./.test(address) || /^198\.19\./.test(address)) continue
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) continue
      const r = rank(address)
      if (r < bestRank) { best = address; bestRank = r }
    }
  }
  return best
}

// ── 主流程 ─────────────────────────────────────────────────────────────────

function probePort(port) {
  return new Promise(resolveProbe => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = busy => { socket.destroy(); resolveProbe(busy) }
    socket.setTimeout(800, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

async function waitReady(port, child) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/session`)
      if (res.status) return true
    } catch { /* 还没起来，继续等 */ }
    await new Promise(r => setTimeout(r, 150))
  }
  return false
}

async function main() {
  const { password, created } = ensurePassword(ENV_PATH)
  let fileEnv = {}
  try { fileEnv = parseEnvFile(readFileSync(ENV_PATH, 'utf8')) } catch { /* 无文件也无妨 */ }
  const env = buildServerEnv(fileEnv, process.env)
  const port = Number(env.AI_HOME_PORT) || 4180

  if (await probePort(port)) {
    console.error(`端口 ${port} 已被占用：已经有一个服务在运行。`)
    console.error('若它不是用 npm start 启动的，手机会连不上（缺少跨域放行/未绑定局域网）。请先停掉旧进程再重试。')
    process.exit(1)
  }

  const server = spawn(process.execPath, [SERVER_PATH], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] })
  let shuttingDown = false
  const shutdown = code => {
    if (shuttingDown) return
    shuttingDown = true
    try { server.kill() } catch { /* 已退出 */ }
    process.exit(code)
  }
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
  server.on('exit', code => { if (!shuttingDown) { console.error(`服务进程退出（code=${code}）。`); process.exit(code || 1) } })

  if (!(await waitReady(port, server))) {
    console.error('服务启动失败或超时（见上方日志）。')
    shutdown(1)
    return
  }

  const lanIp = pickLanIPv4(undefined, fileEnv.AI_HOME_LAN_IP || process.env.AI_HOME_LAN_IP || '')
  const apiBase = lanIp ? `http://${lanIp}:${port}` : ''
  const apkReady = exists(APK_PATH)

  console.log('')
  console.log('══════════════════════════════════════════════')
  console.log('  后端已启动 · Android 局域网模式')
  console.log('══════════════════════════════════════════════')
  if (created) console.log(`  · 已生成登录密码并保存到 .ai-home.env`)
  console.log('')
  console.log('  手机端只需做一次（设置 → 开发者）：')
  if (apiBase) {
    console.log(`    1. API 服务器地址 粘贴：  ${apiBase}`)
  } else {
    console.log('    1. ⚠ 未探测到局域网 IP（电脑可能没连 Wi-Fi/网线），连上后再启动本脚本。')
  }
  console.log(`    2. 登录密码：             ${password}`)
  console.log('    3. 安装并打开 APP → 输入密码登录（7 天内免登）')
  console.log('')
  console.log('  · 手机必须与电脑在同一个 Wi-Fi；蜂窝流量/其他网络不可达')
  console.log('  · 多网卡地址不对时：在 .ai-home.env 加一行 AI_HOME_LAN_IP=你的局域网IP')
  console.log('  · Windows 弹出防火墙提示时：勾选「专用网络」→ 允许访问')
  console.log(apkReady
    ? `  · APK 已就绪：${APK_PATH}`
    : '  · APK 还没打包：先运行 npm run android:apk')
  console.log('  · 停止服务：在本窗口按 Ctrl+C')
  console.log('══════════════════════════════════════════════')
}

function exists(path) {
  try { readFileSync(path); return true } catch { return false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exit(1) })
}
