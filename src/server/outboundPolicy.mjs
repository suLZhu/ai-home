/**
 * 栖间请求出站策略（服务器端意图，不含代理凭据）。
 *
 * subscription: 订阅协议请求需要通过预设代理出站，不能静默改为直连。
 * direct: 普通 API 中转（包含国内模型及用户配置的自定义 API）默认直连。
 * 不能根据模型名称/品牌推断：同一个 Claude/GPT 模型也可能在国内中转上使用。
 *
 * 代理 dispatcher 注入/部署配置在服务端网络层单独实现。
 */
export function outboundPolicy({ subscriptionProtocol = '', subscription = false } = {}) {
  return subscriptionProtocol || subscription ? 'subscription-proxy' : 'direct'
}

/** 显式代理未配置或不可用时，不要把订阅凭据发送到未经授权的出口。 */
export function checkOutboundPolicy({ policy, proxyReady }) {
  if (policy === 'subscription-proxy' && !proxyReady) {
    return { allowed: false, reason: '订阅专用代理尚未配置或不可用' }
  }
  return { allowed: true, reason: '' }
}
