export function normalizeEndpoint(raw: string): string
export function splitModelNames(raw: string): string[]
export function parseKelivoModelConfigs(input: string | unknown): any[] | null
export function kelivoConfigsToVendors(configs: any[], existing?: any[]): any[]
export function kelivoImportSummary(vendors: any[]): { vendors: number; models: number; keys: number }
