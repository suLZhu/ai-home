// 极简 ZIP 读取：只支持 STORE(0) 与 DEFLATE(8)，够读美化包。
// 依赖浏览器内置 DecompressionStream('deflate-raw')（Android WebView / Chrome 均支持）。
// 不做 zip64、加密、分卷。

const EOCD = 0x06054b50
const CEN = 0x02014b50
const LOC = 0x04034b50

function u16(v, o) { return v[o] | (v[o + 1] << 8) }
function u32(v, o) { return (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0 }

export function isZip(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!isZip(bytes)) throw new Error('不是 ZIP 文件。')
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ZIP 结构损坏（找不到目录）。')
  const count = u16(bytes, eocd + 10)
  let offset = u32(bytes, eocd + 16)
  const files = new Map()
  for (let i = 0; i < count; i++) {
    if (u32(bytes, offset) !== CEN) break
    const method = u16(bytes, offset + 10)
    const compSize = u32(bytes, offset + 20)
    const nameLen = u16(bytes, offset + 28)
    const extraLen = u16(bytes, offset + 30)
    const commentLen = u16(bytes, offset + 32)
    const localOff = u32(bytes, offset + 42)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    offset += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (u32(bytes, localOff) !== LOC) continue
    const locNameLen = u16(bytes, localOff + 26)
    const locExtraLen = u16(bytes, localOff + 28)
    const dataStart = localOff + 30 + locNameLen + locExtraLen
    const raw = bytes.subarray(dataStart, dataStart + compSize)
    let data
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflateRaw(raw)
    else throw new Error(`不支持 ZIP 压缩方式 ${method}（只支持 store/deflate）。`)
    files.set(name.replace(/\\/g, '/').replace(/^\.\//, ''), data)
  }
  if (!files.size) throw new Error('ZIP 里没有文件。')
  return files
}

async function inflateRaw(raw) {
  if (typeof DecompressionStream !== 'function') throw new Error('当前系统不支持解压 ZIP，请解压后单独导入 .json。')
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function bytesToDataUrl(bytes, mime) {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}
