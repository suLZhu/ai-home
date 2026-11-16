// 兼容导入 Kelivo / 类似客户端的「模型配置」备份：
// 数组里每项有 name / apiEndpoint / apiKey / modelName（逗号分隔），转成栖间的供应商。
// 不读对方的思考参数、上下文设置；只迁移地址、Key 与模型名，避免把不兼容的字段带进来。

function text(value, max = 120) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

export function normalizeEndpoint(raw) {
  let endpoint = text(raw, 500).replace(/\/+$/, '')
  endpoint = endpoint.replace(/\/chat\/completions$/i, '').replace(/\/+$/, '')
  return /^https?:\/\//i.test(endpoint) ? endpoint : ''
}

export function splitModelNames(raw) {
  return [...new Set(text(raw, 4000).split(/[,，;；\n]+/).map(value => value.trim()).filter(Boolean))].slice(0, 100)
}

export function parseKelivoModelConfigs(input) {
  let data = input
  if (typeof input === 'string') {
    try { data = JSON.parse(input) } catch { return null }
  }
  if (data && !Array.isArray(data) && Array.isArray(data.configs)) data = data.configs
  if (!Array.isArray(data)) return null
  const configs = data.filter(item => item && typeof item === 'object'
    && (typeof item.apiEndpoint === 'string' || typeof item.modelName === 'string' || typeof item.apiKey === 'string'))
  return configs.length ? configs : null
}

function keysOf(config) {
  const values = []
  const push = value => {
    const key = text(value, 8192)
    if (key && !values.includes(key)) values.push(key)
  }
  push(config.apiKey)
  push(config.apiKeyValue)
  push(config.key)
  if (Array.isArray(config.apiKeyPool)) for (const item of config.apiKeyPool) push(item?.key ?? item?.value)
  if (Array.isArray(config.keys)) for (const item of config.keys) push(item?.key ?? item?.value)
  if (Array.isArray(config.apiKeys)) for (const item of config.apiKeys) push(item?.key ?? item?.value ?? item)
  return values
}

function uid() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch { /* 回退 */ }
  return 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * configs → Vendor[]。existing 用来避免重名；models 默认全选，用户可在模型面板取消。
 */
export function kelivoConfigsToVendors(configs, existing = []) {
  const list = Array.isArray(configs) ? configs : []
  const usedNames = new Set((Array.isArray(existing) ? existing : []).map(v => String(v?.name || '')))
  const vendors = []
  for (const config of list) {
    const endpoint = normalizeEndpoint(config?.apiEndpoint)
    const models = splitModelNames(config?.modelName)
    const keys = keysOf(config || {})
    if (!endpoint || (!keys.length && !models.length)) continue
    let name = text(config?.name, 60) || '导入的供应商'
    if (usedNames.has(name)) {
      let suffix = 2
      while (usedNames.has(name + '（' + suffix + '）')) suffix++
      name = name + '（' + suffix + '）'
    }
    usedNames.add(name)
    const vendorKeys = keys.map((value, index) => ({
      id: uid(),
      label: index === 0 ? 'Kelivo 主 Key' : 'Kelivo 备用 ' + index,
      value,
      role: index === 0 ? 'primary' : 'backup',
    }))
    vendors.push({
      id: 'kelivo-' + uid(),
      name,
      endpoint,
      apiPath: '',
      modelsPath: '',
      builtin: false,
      keys: vendorKeys,
      models: models.map(id => ({ id, name: id, selected: true, source: 'kelivo' })),
    })
  }
  return vendors
}

export function kelivoImportSummary(vendors) {
  return {
    vendors: vendors.length,
    models: vendors.reduce((sum, vendor) => sum + (Array.isArray(vendor.models) ? vendor.models.length : 0), 0),
    keys: vendors.reduce((sum, vendor) => sum + (Array.isArray(vendor.keys) ? vendor.keys.length : 0), 0),
  }
}
