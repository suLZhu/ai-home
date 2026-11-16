import test from 'node:test'
import assert from 'node:assert/strict'
import { packFromZip } from '../src/themePack.mjs'

const enc = new TextEncoder()

function makeStoredZip(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = enc.encode(file.name)
    const data = file.data
    const local = new Uint8Array(30 + name.length + data.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, 0, true)
    dv.setUint16(8, 0, true)
    dv.setUint32(14, 0, true)
    dv.setUint32(18, data.length, true)
    dv.setUint32(22, data.length, true)
    dv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    chunks.push(local)

    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cen.set(name, 46)
    central.push(cen)
    offset += local.length
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const total = new Uint8Array(offset + centralSize + 22)
  let pos = 0
  for (const part of [...chunks, ...central, eocd]) { total.set(part, pos); pos += part.length }
  return total
}

test('从 ZIP 读取 pack.json 并把相对路径资源转成 data URL', async () => {
  const packJson = {
    format: 'qijian-theme-pack',
    name: '木屋',
    tokens: { accent: '#8a6b4f', surface: '#faf3ea' },
    background: { image: 'bg.png' },
    font: { family: 'pack', src: 'font.ttf' },
    bubble: { style: 'letter' },
  }
  const zip = makeStoredZip([
    { name: 'pack.json', data: enc.encode(JSON.stringify(packJson)) },
    { name: 'bg.png', data: new Uint8Array([137, 80, 78, 71]) },
    { name: 'font.ttf', data: new Uint8Array([0, 1, 0, 0]) },
  ])
  const pack = await packFromZip(zip)
  assert.equal(pack.name, '木屋')
  assert.match(pack.background.image, /^data:image\/png;base64,/)
  assert.match(pack.font.src, /^data:font\/ttf;base64,/)
})

test('ZIP 没有 pack.json 会报错', async () => {
  const zip = makeStoredZip([{ name: 'readme.txt', data: enc.encode('hi') }])
  await assert.rejects(() => packFromZip(zip), /pack\.json/)
})

test('ZIP 包内 icons 相对路径会转成 data URL', async () => {
  const zip = makeStoredZip([
    { name: 'pack.json', data: enc.encode(JSON.stringify({ format: 'qijian-theme-pack', name: '图标包', tokens: { accent: '#333' }, icons: { chat: 'icons/chat.png' } })) },
    { name: 'icons/chat.png', data: new Uint8Array([1, 2, 3]) },
  ])
  const pack = await packFromZip(zip)
  assert.match(pack.icons.chat, /^data:image\/png;base64,/)
})
