// 头像：本机选图 → 居中裁成正方形 → 压成小 JPEG dataURL。
// 两位助手各存一份，互不影响；压缩是为了不让手机原图撑爆 localStorage / 云端快照。

export const AVATAR_EDGE = 256
export const AVATAR_QUALITY = 0.82
export const AVATAR_MAX_INPUT_BYTES = 12 * 1024 * 1024
export const AVATAR_MAX_DATAURL_CHARS = 400 * 1024

const str = (v) => String(v ?? '')

export function canUseAsAvatar(file) {
  if (!file || typeof file !== 'object') return false
  if (!str(file.type).toLowerCase().startsWith('image/')) return false
  const size = Number(file.size)
  return Number.isFinite(size) && size > 0 && size <= AVATAR_MAX_INPUT_BYTES
}

// 居中裁切（cover）：保证输出是正方形且不变形。
export function avatarCropRect(iw, ih) {
  const w = Number(iw), h = Number(ih)
  if (!(w > 0) || !(h > 0)) return null
  const side = Math.min(w, h)
  return { sx: (w - side) / 2, sy: (h - side) / 2, sw: side, sh: side }
}

export function isAvatarDataUrl(v) {
  return /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(str(v))
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败，请换一张'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('这张图片打不开，请换一张'))
    img.src = src
  })
}

export async function fileToAvatar(file) {
  if (!canUseAsAvatar(file)) throw new Error('请选择小于 12MB 的图片文件')
  const raw = await readAsDataUrl(file)
  if (!isAvatarDataUrl(raw)) throw new Error('这个文件不是可用的图片')
  let out = raw
  try {
    const img = await loadImage(raw)
    const rect = avatarCropRect(img.naturalWidth || img.width, img.naturalHeight || img.height)
    if (rect) {
      const canvas = document.createElement('canvas')
      canvas.width = AVATAR_EDGE
      canvas.height = AVATAR_EDGE
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, AVATAR_EDGE, AVATAR_EDGE)
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, AVATAR_EDGE, AVATAR_EDGE)
        out = canvas.toDataURL('image/jpeg', AVATAR_QUALITY)
      }
    }
  } catch {
    // SVG / 动图在部分 WebView 里走不了 canvas，保留原始 dataURL。
  }
  if (!isAvatarDataUrl(out)) throw new Error('这张图片不能用作头像，请换一张')
  if (out.length > AVATAR_MAX_DATAURL_CHARS) throw new Error('图片压缩后仍然太大，请换一张小一点的')
  return out
}
