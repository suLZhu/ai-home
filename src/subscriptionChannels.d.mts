export type SubscriptionChannel = {
  id: string
  name: string
  short: string
  category: string
  aliases: string[]
  endpoint: string
  vendorId: string
  hint: string
  needsCompatibleUrl: boolean
}

export type SubscriptionAccount = {
  id: string
  channelId: string
  label: string
  endpoint: string
  apiPath: string
  modelsPath: string
  apiKey: string
  vendorId: string
  vendorKeyId: string
  loggedIn: boolean
  modelCount: number
  lastVerified: string
  availableModels: string[]
  pickedModels: string[]
}

export const SUBSCRIPTION_STORAGE_KEY: string
export const SUBSCRIPTION_CHANNELS: SubscriptionChannel[]
export const SUBSCRIPTION_QUICK_TERMS: string[]
export declare function channelById(id: string): SubscriptionChannel | undefined
export declare function searchSubscriptionChannels(query?: string, limit?: number): SubscriptionChannel[]
export declare function normalizeSubscriptions(raw: unknown): SubscriptionAccount[]
export declare function blankSubscription(channel: SubscriptionChannel): SubscriptionAccount
