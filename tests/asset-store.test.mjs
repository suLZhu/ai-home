import test from 'node:test'
import assert from 'node:assert/strict'
import { loadCustomAssets, saveCustomAssets } from '../src/assetStore.mjs'

const EMPTY = { bg1: '', bg2: '', bubble: '', fontName: '', fontData: '' }

test('loadCustomAssets：无 IDB/无 localStorage 时安全回退到 fallback', async () => {
  const got = await loadCustomAssets(EMPTY)
  assert.deepEqual(got, EMPTY)
})

test('loadCustomAssets：fallback 字段不被丢弃', async () => {
  const base = { ...EMPTY, fontName: 'keep.ttf' }
  const got = await loadCustomAssets(base)
  assert.equal(got.fontName, 'keep.ttf')
})

test('saveCustomAssets：环境不支持时显式抛错（调用方回退 localStorage）', async () => {
  await assert.rejects(() => saveCustomAssets(EMPTY), /IndexedDB/)
})
