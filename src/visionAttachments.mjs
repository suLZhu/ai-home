// Build OpenAI-compatible vision parts from stored message attachments.
// Keep binary image data out of persisted conversations; rehydrate only while sending.
const imageMime = value => /^image\/(png|jpeg|jpg|webp|gif)$/i.test(String(value || ''))
const dataImage = value => /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(String(value || ''))
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export function stableAttachmentReference(a) {
  if (a?.assetId) return '/api/attachments/' + encodeURIComponent(String(a.assetId))
  const p = String(a?.preview || '')
  if (p.startsWith('/api/attachments/') || dataImage(p) || /^https:\/\//i.test(p)) return p
  return ''
}

export function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片编码失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

// A vision endpoint may not support animated GIF data; extract a static frame for
// model input, while the actual chat attachment remains animated for the user.
export function gifFirstFrame(dataUrl) {
  if (!/^data:image\/gif;base64,/i.test(dataUrl) || typeof document === 'undefined') return Promise.resolve(dataUrl)
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight, 1))
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch { resolve(dataUrl) }
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export async function visionPartForAttachment(attachment, fetchAttachment) {
  const a = attachment || {}
  if (!imageMime(a.type)) return { part: null, problem: '' }
  let url = String(a.dataUrl || '')
  if (!dataImage(url)) {
    const ref = stableAttachmentReference(a)
    if (!ref) return { part: null, problem: '图片原始数据已丢失：' + String(a.name || '未命名图片') }
    if (dataImage(ref)) url = ref
    else {
      try {
        const response = await fetchAttachment(ref)
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const blob = await response.blob()
        if (blob.size > MAX_IMAGE_BYTES) throw new Error('图片超过 12 MB')
        if (!imageMime(blob.type || a.type)) throw new Error('附件不是可用图片')
        url = await dataUrlFromBlob(blob)
      } catch {
        return { part: null, problem: '无法读取图片内容：' + String(a.name || '未命名图片') }
      }
    }
  }
  if (!dataImage(url)) return { part: null, problem: '图片格式不受支持：' + String(a.name || '未命名图片') }
  url = await gifFirstFrame(url)
  return { part: { type: 'image_url', image_url: { url } }, problem: '' }
}

export async function messageWithVision(role, text, attachments, fetchAttachment) {
  const parts = [{ type: 'text', text: String(text || '') }]
  const problems = []
  for (const a of attachments || []) {
    const { part, problem } = await visionPartForAttachment(a, fetchAttachment)
    if (part) parts.push(part)
    if (problem) problems.push(problem)
  }
  if (problems.length) parts[0].text += '\n[附件读取状态：' + problems.join('；') + '。请勿猜测缺失的图片内容]'
  return {
    role,
    content: parts.length > 1 ? parts : parts[0].text,
  }
}


// Historical image payloads are expensive and were previously outside the text
// compaction budget. Keep only the newest N user messages with images when
// rebuilding history; the current user message is handled separately and is
// never affected by this helper.
export function historyVisionMessageIndexes(messages, maxMessages = 1) {
  const list = Array.isArray(messages) ? messages : []
  const limit = Math.max(0, Number(maxMessages) || 0)
  if (!limit) return new Set()
  const indexes = []
  for (let i = list.length - 1; i >= 0 && indexes.length < limit; i--) {
    const message = list[i]
    if (message?.role !== 'user' || !Array.isArray(message?.attachments)) continue
    if (message.attachments.some(a => imageMime(a?.type))) indexes.push(i)
  }
  return new Set(indexes)
}

export function historicalMessageWithoutVision(message) {
  if (!message || message.role !== 'user' || !Array.isArray(message.attachments) || !message.attachments.length) {
    return { role: message?.role, content: message?.content }
  }
  const names = message.attachments.filter(a => imageMime(a?.type)).map(a => String(a?.name || '图片')).slice(0, 6)
  const suffix = names.length ? '\n[较早图片未重复发送：' + names.join('、') + '；需要重新看图时请让用户重发或引用最近图片。]' : ''
  return { role: message.role, content: String(message.content || '') + suffix }
}
