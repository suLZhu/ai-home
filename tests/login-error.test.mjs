import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLoginError } from '../src/loginError.mjs'

test('地区限制：裸错误码 → 中文友好提示 + 原始内容进详情', () => {
  const r = formatLoginError('unsupported_country_region_territory')
  assert.equal(r.kind, 'region')
  assert.equal(r.title, '当前地区暂不支持此账号登录')
  assert.match(r.hint, /网络出口地区/)
  assert.equal(r.detail, 'unsupported_country_region_territory')
})

test('地区限制：整段原始 JSON 也不会铺成标题', () => {
  const json = '{"error":"unsupported_country_region_territory","error_description":"Access not supported in this region","status":403}'
  const r = formatLoginError(json)
  assert.equal(r.kind, 'region')
  assert.equal(r.title, '当前地区暂不支持此账号登录')
  assert.equal(r.detail, json)
})

test('地区限制：大小写 / 连字符变体也能识别', () => {
  for (const s of ['UNSUPPORTED_COUNTRY_REGION_TERRITORY', 'unsupported country', 'region_not_supported']) {
    assert.equal(formatLoginError(s).kind, 'region')
  }
})

test('授权被取消 / 配置失效 / 超时 / 网络失败各有中文提示', () => {
  assert.equal(formatLoginError('access_denied').kind, 'denied')
  assert.equal(formatLoginError('invalid_client').kind, 'config')
  assert.equal(formatLoginError('登录超时，请重新点一次登录').kind, 'timeout')
  assert.equal(formatLoginError('Failed to fetch').kind, 'network')
  assert.equal(formatLoginError('令牌接口返回 HTTP 401').kind, 'generic')
})

test('项目自己的简短中文错误：原样展示，不套壳、不显示「查看详情」', () => {
  const r = formatLoginError('网页授权登录需要在 App 内完成，请安装最新版 APK')
  assert.equal(r.kind, 'friendly')
  assert.equal(r.title, '网页授权登录需要在 App 内完成，请安装最新版 APK')
  assert.equal(r.detail, '')
})

test('未知的长 JSON / HTTP 报文：中文通用标题，原文完整保留在 detail', () => {
  const raw = '{"foo":"bar","trace_id":"abc123","message":"something broke upstream"}'
  const r = formatLoginError(raw)
  assert.equal(r.kind, 'generic')
  assert.equal(r.title, '登录未完成，请查看详情')
  assert.equal(r.detail, raw)
})

test('Error 对象 / 空值 / 非字符串输入不抛异常', () => {
  assert.equal(formatLoginError(new Error('Failed to fetch')).kind, 'network')
  assert.equal(formatLoginError('').detail, '')
  assert.equal(formatLoginError(null).kind, 'generic')
  assert.equal(formatLoginError(undefined).title, '登录未完成，请再试一次')
  assert.equal(formatLoginError(123).kind, 'friendly')
})
