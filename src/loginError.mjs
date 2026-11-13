// 订阅账号登录错误友好化（P1-9 的「显示问题」）。
// 上游授权页 / 原生登录弹层可能把整段原始 JSON 或错误码抛回来，旧实现直接
// setError(e.message) 铺在登录页。这里统一映射成中文短句，原始内容只作为
// 「查看详情」里的 detail 保留，默认绝不展示。
//
// 注意：这里只解决显示问题。地区限制、订阅 OAuth token 与 /v1/chat/completions
// 不兼容属于「功能问题」，见交付报告，不靠文案掩盖。

/**
 * @typedef {Object} LoginErrorInfo
 * @property {'region'|'denied'|'config'|'network'|'timeout'|'generic'|'friendly'} kind
 * @property {string} title   中文主提示
 * @property {string} hint    可选的补充建议
 * @property {string} detail  原始错误（仅「查看详情」展开时显示；无原始内容时为空）
 */

const REGION_HINT = '这通常是当前网络出口地区被官方服务限制，与账号密码无关。可换到可用网络后重试，或改用「令牌」方式。'

function rawText(raw) {
  if (raw instanceof Error) return String(raw.message || '')
  if (typeof raw === 'string') return raw
  return String(raw ?? '')
}

// 明显的「原始报文」：长文本、JSON 片段、错误码。这类永远不直接当标题。
function looksRaw(text) {
  const hasJsonChars = ['{', '}', '[', ']'].some(ch => text.includes(ch))
  return text.length > 120 || hasJsonChars || /(?:unsupported_|error_code|"error"|HTTP\s?\d{3})/i.test(text)
}

export function formatLoginError(raw) {
  const text = rawText(raw).trim()
  if (!text) return { kind: 'generic', title: '登录未完成，请再试一次', hint: '', detail: '' }
  const has = (re) => re.test(text)

  // OpenAI 官方授权页按出口 IP / 地区拒绝（真机上看到的 unsupported_country_region_territory）。
  if (has(/unsupported_country_region_territory|unsupported[_\s-]?country|region[_\s-]?not[_\s-]?supported|country[_\s-]?not[_\s-]?supported/i)) {
    return { kind: 'region', title: '当前地区暂不支持此账号登录', hint: REGION_HINT, detail: text }
  }
  if (has(/access_denied|consent_required|user_cancelled|用户取消|授权被拒绝/i)) {
    return { kind: 'denied', title: '授权未完成或已被取消', hint: '可以重新点一次登录并走完授权流程。', detail: looksRaw(text) ? text : '' }
  }
  if (has(/invalid_client|invalid_request|unauthorized_client|client_id/i)) {
    return { kind: 'config', title: '登录配置已失效，暂时无法使用网页登录', hint: '官方客户端的授权配置可能已变更，可先改用「令牌」方式。', detail: looksRaw(text) ? text : '' }
  }
  if (has(/登录超时|timeout|timed?\s?out/i)) {
    return { kind: 'timeout', title: '登录超时，请重新点一次登录', hint: '', detail: '' }
  }
  if (has(/failed to fetch|networkerror|网络(?:错误|失败|不可用)|ENOTFOUND|ECONNREFUSED|无法连接/i)) {
    return { kind: 'network', title: '网络连接失败，登录没有完成', hint: '请检查网络后重试。', detail: '' }
  }
  if (has(/HTTP\s?\d{3}|令牌接口|不是 JSON|没有返回 access_token/i)) {
    return { kind: 'generic', title: '登录服务暂时不可用，请稍后重试', hint: '', detail: text }
  }
  // 已经是简短中文提示（本项目自己抛的错误）：原样展示，不套壳、不给「查看详情」。
  if (!looksRaw(text)) return { kind: 'friendly', title: text, hint: '', detail: '' }
  return { kind: 'generic', title: '登录未完成，请查看详情', hint: '', detail: text }
}
