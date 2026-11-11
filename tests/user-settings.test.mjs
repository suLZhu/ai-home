import test from 'node:test'
import assert from 'node:assert/strict'
import { USER_SETTINGS_KEY, blankUserSettings, normalizeUserSettings, buildUserContext } from '../src/userSettings.mjs'

const PEOPLE = ['assistant-yanweixi', 'assistant-yanshuo']

test('用户设置：按助手归一化、非法数据补空、字段限长', () => {
  assert.equal(USER_SETTINGS_KEY, 'ai-home.userSettings')
  const out = normalizeUserSettings({
    'assistant-yanweixi': { callName: '  小顺  ', userName: 42, preferences: 'x'.repeat(900), junk: 'ignored' },
    'assistant-yanshuo': null,
    'unknown-id': { callName: '不该出现' },
  }, PEOPLE)
  assert.deepEqual(Object.keys(out), PEOPLE)
  assert.equal(out[PEOPLE[0]].callName, '小顺')
  assert.equal(out[PEOPLE[0]].userName, '42')
  assert.equal(out[PEOPLE[0]].preferences.length, 600)
  assert.deepEqual(out[PEOPLE[1]], blankUserSettings())
  assert.deepEqual(normalizeUserSettings(null, PEOPLE)[PEOPLE[0]], blankUserSettings())
})

test('用户设置：提示词只收录填过的字段，称呼优先级最高', () => {
  assert.equal(buildUserContext(blankUserSettings()), '')
  const text = buildUserContext({
    callName: '小顺', userName: '李小顺', identity: '船厂安环部',
    relationship: '搭档', preferences: '回复简短', notes: '别用客套话',
  }, { roomName: '用户' })
  assert.ok(text.startsWith('【用户设定（请始终遵守）】'))
  assert.ok(text.includes('请始终称呼用户为「小顺」'))
  assert.ok(text.includes('用户的名字是「李小顺」'))
  assert.ok(text.includes('船厂安环部') && text.includes('搭档'))
  assert.ok(text.includes('回复简短') && text.includes('别用客套话'))
  assert.ok(!text.includes('用户在应用里给自己起的名字'))
})

test('用户设置：没填名字时才用应用昵称，且忽略默认「用户」', () => {
  assert.equal(buildUserContext({ callName: '' }, { roomName: '用户' }), '')
  assert.ok(buildUserContext({ identity: '安环部' }, { roomName: '阿顺' }).includes('阿顺'))
})
