import test from 'node:test'
import assert from 'node:assert/strict'
import {messageWithVision,stableAttachmentReference,visionPartForAttachment,historyVisionMessageIndexes,historicalMessageWithoutVision} from '../src/visionAttachments.mjs'

test('image sticker data URL is actually sent as image_url', async()=>{
  const url='data:image/webp;base64,AAAA'
  const result=await messageWithVision('user','这个呢？',[{name:'图片表情1.webp',type:'image/webp',dataUrl:url}],async()=>{throw Error('should not fetch')})
  assert.equal(result.content[1].image_url.url,url)
  assert.equal(result.content[0].text,'这个呢？')
})
test('history rehydrates stable asset instead of only its filename',async()=>{
  const url='data:image/png;base64,AA=='
  const oldFileReader=globalThis.FileReader
  globalThis.FileReader=class {readAsDataURL(){this.result=url;this.onload()}}
  try{
    const msg=await messageWithVision('user','看上次的图',[{name:'test.png',type:'image/png',assetId:'image-123'}],async path=>{
      assert.equal(path,'/api/attachments/image-123')
      return {ok:true,blob:async()=>({size:123,type:'image/png'})}
    })
    assert.equal(msg.content[1].image_url.url,url)
  }finally{globalThis.FileReader=oldFileReader}
})
test('missing image bytes emit explicit missing-content warning, not a claim of seeing image',async()=>{
  const msg=await messageWithVision('user','看图',[{name:'lost.gif',type:'image/gif'}],async()=>{throw Error('unexpected')})
  assert.match(msg.content,/图片原始数据已丢失/)
  assert.match(msg.content,/请勿猜测/)
})
test('stable reference excludes stale blob URLs',()=>{
  assert.equal(stableAttachmentReference({preview:'blob:123'}),'')
  assert.equal(stableAttachmentReference({assetId:'a1'}),'/api/attachments/a1')
})


test('history vision budget keeps only newest image message',()=>{
  const messages=[
    {role:'user',content:'旧图',attachments:[{name:'old.png',type:'image/png'}]},
    {role:'assistant',content:'看到了'},
    {role:'user',content:'新图',attachments:[{name:'new.png',type:'image/png'}]},
  ]
  assert.deepEqual([...historyVisionMessageIndexes(messages,1)],[2])
})

test('older image history becomes a lightweight textual marker',()=>{
  const out=historicalMessageWithoutVision({role:'user',content:'之前这张',attachments:[{name:'huge.png',type:'image/png'}]})
  assert.equal(out.role,'user')
  assert.match(String(out.content),/较早图片未重复发送/)
  assert.match(String(out.content),/huge\.png/)
})
