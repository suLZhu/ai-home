export type VendorKey = { id: string; label: string; value: string; role: 'primary' | 'backup' }
export type VendorModel = { id: string; name: string; selected: boolean }
export type Vendor = {
  id: string
  name: string
  endpoint: string
  builtin: boolean
  keys: VendorKey[]
  models: VendorModel[]
}

export type VendorKeyOption = VendorKey & { vendorId: string; vendorName: string }

export declare function keyRoleLabel(role: string): string
export declare function orderedKeys(keys: unknown): VendorKey[]

export declare const BUILTIN_VENDORS: { id: string; name: string; endpoint: string; models: string[] }[]
export declare function normalizeVendors(raw: unknown): Vendor[]
export declare function vendorModelProfileId(vendorId: string, modelId: string): string
export declare function syncVendorProfiles(vendors: unknown, profiles: unknown): {
  id: string; name: string; endpoint: string; model: string
  vendor: string; vendorId: string
  inputPrice: string; outputPrice: string; cachedInputPrice: string; usdToCny: string
}[]
export declare function allVendorKeys(vendors: unknown): VendorKeyOption[]
export declare function resolveVendorKey(vendors: unknown, keyId: string): string
export declare function resolveKeyCandidates(vendors: unknown, keyId: string, fallbackKey?: string, vendorId?: string): string[]
export declare function isRetryableKeyStatus(status: number): boolean
export declare function readKeyCandidates(body: unknown): string[]
export declare function blankVendor(name?: string, endpoint?: string): Vendor
