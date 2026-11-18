// Estimate proportions only. Exact per-category token counts are not reported by
// model providers. Redistribute each round's measured input tokens by content size.
const textSize=value=>{try{return JSON.stringify(value).length}catch{return 0}}
export function requestInputWeights(messages,tools,worldEntries=[]) {
  const all=Array.isArray(messages)?messages:[]
  let context=0,toolResults=0
  for(const m of all) {
    const weight=textSize(m)
    if(m?.role==='tool')toolResults+=weight
    else context+=weight
  }
  const declarations=textSize(Array.isArray(tools)?tools:[])
  const tool=toolResults+declarations
  const worldHint=Array.isArray(worldEntries)?worldEntries.reduce((sum,e)=>sum+String(e?.title||'').length+String(e?.content||'').length+18,0):0
  const worldbook=Math.min(context,worldHint)
  context=Math.max(0,context-worldbook)
  return {context,tools:tool,worldbook}
}
export function allocateInputTokens(total,weights) {
  const count=Number(total)
  if(!Number.isFinite(count)||count<=0)return {context:0,tools:0,worldbook:0}
  const a=Math.max(0,Number(weights?.context)||0)
  const b=Math.max(0,Number(weights?.tools)||0)
  const c=Math.max(0,Number(weights?.worldbook)||0)
  const sum=a+b+c
  if(!sum)return {context:Math.round(count),tools:0,worldbook:0}
  const tools=Math.round(count*b/sum)
  const worldbook=Math.round(count*c/sum)
  return {context:Math.max(0,Math.round(count)-tools-worldbook),tools,worldbook}
}
export function tokenCountLabel(value) {
  const n=Math.max(0,Number(value)||0)
  return n>=1000?(Math.round(n/100)/10).toLocaleString('zh-CN',{maximumFractionDigits:1})+'k':Math.round(n).toLocaleString('zh-CN')
}
