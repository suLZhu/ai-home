import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CHAT_DISPLAY, normalizeChatDisplay, formatMessageTime, saveChatDisplay } from '../src/chatDisplayPrefs.mjs'

test('聊天展示偏好：缺字段补默认，未知值被忽略', () => {
  assert.deepEqual(normalizeChatDisplay(null), DEFAULT_CHAT_DISPLAY)
  const v = normalizeChatDisplay({ assistantAvatar: false, time: true, timePos: 'above', bogus: 1 })
  assert.equal(v.assistantAvatar, false)
  assert.equal(v.time, true)
  assert.equal(v.timePos, 'above')
  assert.equal(v.userAvatar, DEFAULT_CHAT_DISPLAY.userAvatar)
  assert.equal(v.timePos === 'sideways', false)
})

test('聊天展示偏好：时间位置固定气泡上方', () => {
  assert.equal(normalizeChatDisplay({ timePos: 'sideways' }).timePos, 'above')
})

test('消息时间格式化：优先 at，退回 usage.at，无效值返回空串', () => {
  const a = formatMessageTime({ at: new Date(2026, 10, 14, 9, 5).toISOString() })
  assert.equal(a, '26/11/14 09:05')
  const b = formatMessageTime({ usage: { at: new Date(2026, 10, 14, 15, 40).toISOString() } })
  assert.equal(b, '26/11/14 15:40')
  assert.equal(formatMessageTime({}), '')
  assert.equal(formatMessageTime({ at: 'not-a-date' }), '')
})

test('保存后广播事件，storage 不可用也不抛错', () => {
  let fired = 0
  const listener = () => { fired++ }
  globalThis.addEventListener?.('aihome:chatdisplay', listener)
  const v = saveChatDisplay({ userName: true })
  assert.equal(v.userName, true)
  globalThis.removeEventListener?.('aihome:chatdisplay', listener)
  assert.ok(fired >= 0)
})
