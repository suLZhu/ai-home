// Subscription window usage, not API token billing. Percentages come from
// account quota endpoints and are never estimated from local chat history.
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null
const clamp=v=>Math.round(Math.min(100,Math.max(0,v))*10)/10
const codexWindow=(label,v)=>{
  if(n(v?.used_percent)===null)return null
  return {label,used:clamp(v.used_percent),remaining:clamp(100-v.used_percent),resetAt:v.reset_at||null}
}
const claudeWindow=(label,v)=>{
  if(n(v?.utilization)===null)return null
  const pct=v.utilization>1?v.utilization:v.utilization*100
  return {label,used:clamp(pct),remaining:clamp(100-pct),resetAt:v.resets_at||null}
}
export function parseSubscriptionUsage(channel, data) {
  if(!data||typeof data!=='object')return []
  if(channel==='gpt'){
    const r=data.rate_limit||data
    return [
      codexWindow('主要限额',r.primary_window),
      codexWindow('次要限额',r.secondary_window)
    ].filter(Boolean)
  }
  if(channel==='claude')return [
    claudeWindow('5 小时',data.five_hour),
    claudeWindow('7 天',data.seven_day)
  ].filter(Boolean)
  if(channel==='grok'){
    const v=data.config?.creditUsagePercent
    if(n(v)===null)return []
    return [{label:'订阅积分周期',used:clamp(v),remaining:clamp(100-v),resetAt:data.config?.currentPeriod?.end||data.config?.billingPeriodEnd||null}]
  }
  return []
}
export function subscriptionUsageRequest(channel, token, accountId='') {
  if(!token)return null
  if(channel==='gpt')return {
    url:'https://chatgpt.com/backend-api/wham/usage',
    headers:{Authorization:'Bearer '+token,'Accept':'application/json',...(accountId?{'chatgpt-account-id':accountId}:{})}
  }
  if(channel==='claude')return {
    url:'https://api.anthropic.com/api/oauth/usage',
    headers:{Authorization:'Bearer '+token,'anthropic-beta':'oauth-2025-04-20','Accept':'application/json'}
  }
  if(channel==='grok')return {
    url:'https://cli-chat-proxy.grok.com/v1/billing?format=credits',
    headers:{Authorization:'Bearer '+token,'X-XAI-Token-Auth':'xai-grok-cli','Accept':'application/json'}
  }
  return null
}
export async function fetchSubscriptionUsage(channel,token,accountId,get) {
  const req=subscriptionUsageRequest(channel,token,accountId)
  if(!req)return {windows:[],error:'该账号没有可用的订阅凭据'}
  const result=await get(req.url,req.headers)
  if(!result)return {windows:[],error:'当前版本的原生网络桥不支持用量查询'}
  if(result.error)return {windows:[],error:'用量查询失败：'+String(result.error).slice(0,100)}
  const status=Number(result.status)||0
  if(status>=400)return {windows:[],error:'用量接口返回 HTTP '+status+'，可能是未授权、限流或接口已变更'}
  let data
  try{data=JSON.parse(String(result.body||''))}catch{return {windows:[],error:'用量接口未返回有效 JSON'}}
  const windows=parseSubscriptionUsage(channel,data)
  return windows.length?{windows,error:''}:{windows:[],error:'此账号的订阅端点暂未提供可识别的用量数据'}
}
