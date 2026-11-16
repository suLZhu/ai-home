// 生成 Android 占位图标与启动图（奶灰 + 浅紫，柔和简洁风）。
// 正式图标后续由 顾惟/晏未晞 提供；本脚本只产出可直接打包的占位资源，可随时重跑覆盖。
// 用法：node scripts/gen-android-assets.mjs
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res')

// ── 配色（奶灰 + 浅紫） ──
const CREAM = [236, 231, 224, 255]   // #ECE7E0 奶灰背景
const PURPLE = [185, 167, 232, 255]  // #B9A7E8 浅紫主体
const PURPLE_DK = [160, 140, 216, 255] // #A08CD8 深一档紫（屋顶描边感）
const CLEAR = [0, 0, 0, 0]

// ── 最小 PNG 编码器（RGBA，filter 0） ──
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ── 小房子图形（归一化坐标 nx,ny ∈ [0,1]，落在 box 内） ──
// 返回颜色或 null（透明）。屋顶三角 + 方形屋身 + 门洞镂空。
function houseAt(nx, ny) {
  const roofBaseY = 0.46, roofApexY = 0.15, roofL = 0.12, roofR = 0.88
  if (ny >= roofApexY && ny <= roofBaseY) {
    const t = (ny - roofBaseY) / (roofApexY - roofBaseY) // 底 0 → 顶 1
    const half = ((roofR - roofL) / 2) * (1 - t)
    if (Math.abs(nx - 0.5) <= half) return t > 0.55 ? PURPLE_DK : PURPLE
  }
  if (nx >= 0.24 && nx <= 0.76 && ny >= 0.44 && ny <= 0.85) {
    if (nx >= 0.445 && nx <= 0.555 && ny >= 0.63) return null // 门洞
    return PURPLE
  }
  return null
}

// supersample 采样：在 [x,x+1)×[y,y+1) 内按 n×n 子像素求平均，边缘更柔。
// w/h 为图像总宽高（非正方形时分别归一化）。
function sample(px, py, w, h, box, bg, n) {
  let r = 0, g = 0, b = 0, a = 0, wsum = 0
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const u = (px + (sx + 0.5) / n) / w
      const v = (py + (sy + 0.5) / n) / h
      // 归一化到 box 局部
      const nx = (u - box.x) / box.w
      const ny = (v - box.y) / box.h
      let c = null
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) c = houseAt(nx, ny)
      const src = c || bg
      r += src[0]; g += src[1]; b += src[2]; a += src[3]; wsum++
    }
  }
  return [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum), Math.round(a / wsum)]
}

function writePNG(file, w, h, fill) {
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y)
      const i = (y * w + x) * 4
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodePNG(w, h, rgba))
  console.log('  ✓', path.relative(process.cwd(), file), w + 'x' + h)
}

// ── 图标：整幅奶灰底 + 居中浅紫房子 ──
function genIcon(size, { round = false, transparentBg = false } = {}) {
  const bg = transparentBg ? CLEAR : CREAM
  const box = { x: 0.17, y: 0.19, w: 0.66, h: 0.66 } // 房子占中心 66%
  const radius = size / 2
  return (x, y) => {
    if (round) {
      const dx = x + 0.5 - radius, dy = y + 0.5 - radius
      if (dx * dx + dy * dy > radius * radius) return CLEAR // 圆外透明
    }
    return sample(x, y, size, size, box, bg, 3)
  }
}

// ── 启动图：满幅奶灰底 + 居中小房子 ──
function genSplash(w, h) {
  const min = Math.min(w, h)
  const bw = 0.24 * min / w, bh = 0.24 * min / h
  const box = { x: 0.5 - bw / 2, y: 0.5 - bh / 2 - 0.02, w: bw, h: bh }
  return (x, y) => sample(x, y, w, h, box, CREAM, 2) // 大图用 2×2，速度更快
}

// ── 生成全部资源 ──
console.log('生成 Android 占位图标/启动图（奶灰+浅紫）…')

// legacy 图标（API<26）与 adaptive 前景
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, m] of Object.entries(densities)) {
  const s = Math.round(48 * m)
  const f = Math.round(108 * m)
  writePNG(path.join(RES, `mipmap-${d}`, 'ic_launcher.png'), s, s, genIcon(s))
  writePNG(path.join(RES, `mipmap-${d}`, 'ic_launcher_round.png'), s, s, genIcon(s, { round: true }))
  writePNG(path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'), f, f, genIcon(f, { transparentBg: true }))
}

// 启动图（竖屏 + 横屏）
for (const [d, m] of Object.entries(densities)) {
  writePNG(path.join(RES, `drawable-port-${d}`, 'splash.png'), Math.round(320 * m), Math.round(480 * m), genSplash(Math.round(320 * m), Math.round(480 * m)))
  writePNG(path.join(RES, `drawable-land-${d}`, 'splash.png'), Math.round(480 * m), Math.round(320 * m), genSplash(Math.round(480 * m), Math.round(320 * m)))
}

// adaptive 背景色改为奶灰（ic_launcher.xml 引用 @color/ic_launcher_background）
const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#ECE7E0</color>
</resources>
`
fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), bgXml)
console.log('  ✓ values/ic_launcher_background.xml → #ECE7E0')

console.log('完成。')
