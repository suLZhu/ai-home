// 一键启动脚本 scripts/start-server.mjs 的纯函数验收：
// env 解析、密码生成/保留、启动环境合并（局域网默认值）、局域网 IP 挑选。
// 不真正拉起服务（那部分由 tests/android-login.test.mjs 的真实进程套件覆盖）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEnvFile, generatePassword, ensurePassword, buildServerEnv, pickLanIPv4 } from '../scripts/start-server.mjs'

test('parseEnvFile：注释/空行/引号/非法行', () => {
  const env = parseEnvFile([
    '# 注释行',
    '',
    'AI_HOME_SECRET_KEY=abcdef',
    'AI_HOME_PASSWORD="p w d"',
    "AI_HOME_DB='C:/data/x.sqlite'",
    '没有等号的行',
    '=无键值',
  ].join('\n'))
  assert.equal(env.AI_HOME_SECRET_KEY, 'abcdef')
  assert.equal(env.AI_HOME_PASSWORD, 'p w d')
  assert.equal(env.AI_HOME_DB, 'C:/data/x.sqlite')
  assert.equal(env['没有等号的行'], undefined)
  assert.equal(env[''], undefined)
  assert.deepEqual(parseEnvFile(''), {})
  assert.deepEqual(parseEnvFile(null), {})
})

test('generatePassword：24 位、无易混淆字符、每次不同', () => {
  const p1 = generatePassword()
  const p2 = generatePassword()
  assert.equal(p1.length, 24)
  assert.ok(!/[0O1lI]/.test(p1), '不含易混淆字符')
  assert.match(p1, /^[A-Za-z2-9]+$/)
  assert.notEqual(p1, p2)
})

test('ensurePassword：缺失生成并写回 / 已有保留 / 过短替换', () => {
  const files = new Map()
  const fs = {
    readFileSync: path => {
      if (!files.has(path)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e }
      return files.get(path)
    },
    writeFileSync: (path, data) => { files.set(path, data) },
  }
  const path = '/proj/.ai-home.env'

  // 缺失 → 生成
  const first = ensurePassword(path, fs)
  assert.equal(first.created, true)
  assert.ok(first.password.length >= 16)
  assert.ok(files.get(path).includes(`AI_HOME_PASSWORD=${first.password}`))

  // 已有且够长 → 原样保留
  const second = ensurePassword(path, fs)
  assert.equal(second.created, false)
  assert.equal(second.password, first.password)

  // 过短 → 替换，但不动其他键
  files.set(path, 'AI_HOME_SECRET_KEY=zz\nAI_HOME_PASSWORD=short\n')
  const third = ensurePassword(path, fs)
  assert.equal(third.created, true)
  assert.ok(third.password.length >= 16)
  assert.ok(!files.get(path).includes('AI_HOME_PASSWORD=short'))
  assert.ok(files.get(path).includes('AI_HOME_SECRET_KEY=zz'))
})

test('buildServerEnv：局域网默认值 + 文件优先于 shell', () => {
  const defaults = buildServerEnv({}, { AI_HOME_SECRET_KEY: 'k', PATH: '/usr/bin' })
  assert.equal(defaults.AI_HOME_BIND, '0.0.0.0', '默认绑全部网卡（手机可达）')
  assert.equal(defaults.AI_HOME_ALLOWED_ORIGIN, 'https://localhost', '默认放行 Android WebView 源')
  assert.equal(defaults.AI_HOME_SECRET_KEY, 'k', '其他环境变量透传')
  assert.equal(defaults.PATH, '/usr/bin')

  const fileWins = buildServerEnv({ AI_HOME_BIND: '127.0.0.1', AI_HOME_ALLOWED_ORIGIN: 'https://a.b' }, { AI_HOME_BIND: '9.9.9.9' })
  assert.equal(fileWins.AI_HOME_BIND, '127.0.0.1', 'env 文件覆盖 shell')
  assert.equal(fileWins.AI_HOME_ALLOWED_ORIGIN, 'https://a.b')

  const shellWins = buildServerEnv({}, { AI_HOME_ALLOWED_ORIGIN: 'https://from-shell' })
  assert.equal(shellWins.AI_HOME_ALLOWED_ORIGIN, 'https://from-shell', 'shell 覆盖默认值')
})

test('pickLanIPv4：排除假地址段，家用网卡优先，支持强制指定', () => {
  const nets = {
    // Clash TUN（fake-IP）+ Docker + 真实以太网并存的典型多网卡场景
    'Meta': [{ family: 'IPv4', internal: false, address: '198.18.0.1' }],
    'docker0': [{ family: 'IPv4', internal: false, address: '172.17.0.1' }],
    '以太网': [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.8.4' }],
    'Loopback': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    'vEthernet': [{ family: 'IPv4', internal: false, address: '169.254.3.4' }],
    'Tailscale': [{ family: 'IPv4', internal: false, address: '100.101.2.3' }],
  }
  assert.equal(pickLanIPv4(nets), '192.168.8.4', '家用 192.168 胜出，fake-IP/docker/链路本地/CGNAT 全被排除')
  assert.equal(pickLanIPv4({ wsl: [{ family: 'IPv4', internal: false, address: '172.20.1.2' }] }), '172.20.1.2')
  assert.equal(pickLanIPv4(nets, '10.1.2.3'), '10.1.2.3', 'AI_HOME_LAN_IP 强制指定优先')
  assert.equal(pickLanIPv4({ only: [{ family: 'IPv4', internal: false, address: '198.18.0.1' }] }), '', '只有假地址段时返回空串')
  assert.equal(pickLanIPv4({ v: [{ family: 4, internal: false, address: '10.0.0.2' }] }), '10.0.0.2', '兼容数字 family')
  assert.equal(pickLanIPv4({}), '')
  assert.equal(pickLanIPv4(null), '')
})
