import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CHAT_TOOL_PREFS, normalizeChatToolPrefs, normalizeAssistantChatToolPrefs } from '../src/chatToolPrefs.mjs'
import { fetchWeatherContext } from '../src/weatherContext.mjs'
import { runRouteChat } from '../src/chatRouteRunner.mjs'

test('legacy assistants keep time and tools enabled; weather is opt-in',()=>{
  assert.deepEqual(normalizeChatToolPrefs(null),DEFAULT_CHAT_TOOL_PREFS)
  const people=normalizeAssistantChatToolPrefs({a:{time:false,tools:false,weather:true,city:'北京'}},['a','b'])
  assert.deepEqual(people.a,{time:false,weather:true,tools:false,city:'北京'})
  assert.deepEqual(people.b,DEFAULT_CHAT_TOOL_PREFS)
})
test('weather cannot infer location when city is empty',async()=>{
  let called=false
  const got=await fetchWeatherContext('',{fetchImpl:async()=>{called=true;throw Error('should not fetch')}})
  assert.equal(got,null)
  assert.equal(called,false)
})
test('weather uses city explicitly and safely caches result',async()=>{
  const fetchImpl=async(url)=>{
    if(url.includes('geocoding'))return {ok:true,json:async()=>({results:[{name:'示例城',country:'示例国',latitude:35,longitude:139}]})}
    return {ok:true,json:async()=>({current:{time:'2026-11-17T12:00',temperature_2m:20,weather_code:0}})}
  }
  const value=await fetchWeatherContext('示例城',{fetchImpl,now:1234567890000})
  assert.match(value,/示例城/)
  assert.match(value,/20°C/)
  assert.doesNotMatch(value,/用户当前所在地/)
})
test('route chat skips time injection when disabled',async()=>{
  let sent
  const result=await runRouteChat({
    routes:[{routeId:'one',label:'one',endpoint:'https://example.test/v1',apiKeys:['test']}],
    body:{model:'test-model',messages:[{role:'user',content:'hello'}]},
    includeTimeContext:false,
    fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return {ok:true,status:200,headers:new Headers(),body:null}},
  })
  assert.equal(result.ok,true)
  assert.deepEqual(sent.messages,[{role:'user',content:'hello'}])
})
