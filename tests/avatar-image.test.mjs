import test from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_EDGE, AVATAR_MAX_INPUT_BYTES, canUseAsAvatar, avatarCropRect, isAvatarDataUrl } from '../src/avatarImage.mjs'

test('头像文件：只收图片、限制体积', () => {
  assert.equal(canUseAsAvatar({ type: 'image/png', size: 1024 }), true)
  assert.equal(canUseAsAvatar({ type: 'image/jpeg', size: AVATAR_MAX_INPUT_BYTES }), true)
  assert.equal(canUseAsAvatar({ type: 'image/png', size: AVATAR_MAX_INPUT_BYTES + 1 }), false)
  assert.equal(canUseAsAvatar({ type: 'text/plain', size: 100 }), false)
  assert.equal(canUseAsAvatar(null), false)
  assert.equal(canUseAsAvatar({ type: 'image/png', size: 0 }), false)
})

test('头像裁切：横图 / 竖图 / 方图都居中取正方形，不变形', () => {
  assert.deepEqual(avatarCropRect(400, 200), { sx: 100, sy: 0, sw: 200, sh: 200 })
  assert.deepEqual(avatarCropRect(200, 400), { sx: 0, sy: 100, sw: 200, sh: 200 })
  assert.deepEqual(avatarCropRect(300, 300), { sx: 0, sy: 0, sw: 300, sh: 300 })
  assert.equal(avatarCropRect(0, 100), null)
  assert.equal(avatarCropRect(NaN, 100), null)
  assert.equal(AVATAR_EDGE, 256)
})

test('头像 dataURL：只认图片 base64，拦掉脚本与外链', () => {
  assert.equal(isAvatarDataUrl('data:image/jpeg;base64,AAAA'), true)
  assert.equal(isAvatarDataUrl('data:image/png;base64,iVBORw0KGgo='), true)
  assert.equal(isAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='), true)
  assert.equal(isAvatarDataUrl('data:text/html;base64,PHNjcmlwdD4='), false)
  assert.equal(isAvatarDataUrl('https://example.com/a.png'), false)
  assert.equal(isAvatarDataUrl(''), false)
})
