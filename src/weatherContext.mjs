// Weather is strictly opt-in with an explicit city. Never infer GPS, IP or address.
// Cache successful lookups briefly so chat doesn't pay a network penalty every turn.
const cache=new Map()
const weatherLabels={0:'晴',1:'大致晴朗',2:'局部多云',3:'阴天',45:'有雾',48:'雾凇',51:'小毛毛雨',53:'毛毛雨',55:'较强毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'较强阵雨',82:'强阵雨',95:'雷雨',96:'雷雨伴冰雹',99:'强雷雨伴冰雹'}
const numberOrNull=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null
export async function fetchWeatherContext(city,{fetchImpl=fetch,timeoutMs=4000,now=Date.now()}={}) {
  const name=String(city||'').trim().slice(0,80)
  if(!name)return null
  const key=name.toLowerCase()
  const previous=cache.get(key)
  if(previous&&now-previous.at<15*60*1000)return previous.text
  const ctrl=new AbortController()
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs)
  try{
    const geoUrl='https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(name)+'&count=1&language=zh&format=json'
    const geoRes=await fetchImpl(geoUrl,{signal:ctrl.signal})
    if(!geoRes.ok)return null
    const geo=await geoRes.json()
    const place=geo?.results?.[0]
    const lat=numberOrNull(place?.latitude),lon=numberOrNull(place?.longitude)
    if(lat===null||lon===null)return null
    const forecastUrl='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+'&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto'
    const res=await fetchImpl(forecastUrl,{signal:ctrl.signal})
    if(!res.ok)return null
    const body=await res.json(),current=body?.current
    if(!current||numberOrNull(current.temperature_2m)===null)return null
    const label=weatherLabels[Number(current.weather_code)]||'天气状况未识别'
    const title=[place.name,place.admin1,place.country].filter(Boolean).join(' · ')
    const parts=[
      '【实时天气参考】城市：'+title,
      '观测时间：'+String(current.time||'未知')+'（当地时间）',
      '天气：'+label,
      '气温：'+current.temperature_2m+'°C',
      Number.isFinite(Number(current.relative_humidity_2m))?'相对湿度：'+current.relative_humidity_2m+'%':'',
      Number.isFinite(Number(current.wind_speed_10m))?'风速：'+current.wind_speed_10m+' km/h':'',
      '天气仅供参考，可能存在延迟；不可推断用户实际所在地。'
    ].filter(Boolean)
    const text=parts.join('\n')
    cache.set(key,{at:now,text})
    return text
  }catch{return null}finally{clearTimeout(timer)}
}
