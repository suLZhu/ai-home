export type ModelType = 'chat' | 'embedding' | 'image'
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'pdf'
export type ModelAbility = 'tool' | 'reasoning' | 'structured'

export type ModelPricing = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  currency: 'USD' | 'CNY'
}

export type ModelReasoning = {
  dialect: string
  levels: string[]
  canDisable: boolean
  defaultLevel: string
  sampling: boolean
  replay: 'all' | 'off'
  replayField: string
}

export type ModelBuiltinTools = { codeInterpreter: boolean; imageGeneration: boolean; search?: boolean; urlContext?: boolean }
export type ModelKeyValue = { key: string; value: string }

export type ModelSpec = {
  displayName: string
  apiModelId: string
  type: ModelType
  input: Modality[]
  output: Modality[]
  abilities: ModelAbility[]
  contextWindow: number
  maxOutput: number
  pricing: ModelPricing
  reasoning: ModelReasoning
  builtinTools: ModelBuiltinTools
  headers: ModelKeyValue[]
  body: ModelKeyValue[]
}

export type ResolvedModelSpec = ModelSpec & { customized: boolean }

export type SpecBadge = { id: string; label: string; tone: string }

export declare const MODEL_TYPES: { id: ModelType; label: string }[]
export declare const INPUT_MODALITIES: { id: Modality; label: string }[]
export declare const OUTPUT_MODALITIES: { id: Modality; label: string }[]
export declare const MODEL_ABILITIES: { id: ModelAbility; label: string }[]
export declare const REASONING_DIALECTS: { id: string; label: string }[]
export declare const PRICING_CURRENCIES: { id: 'USD' | 'CNY'; label: string }[]
export declare const REASONING_LEVELS: { id: string; label: string }[]
export declare const REPLAY_MODES: { id: string; label: string }[]

export declare function emptyModelSpec(): ModelSpec
export declare function inferModelSpec(modelId: string): ModelSpec
export declare function normalizeModelSpec(raw: unknown): ModelSpec
export declare function resolveModelSpec(modelId: string, overrides: unknown): ResolvedModelSpec
export declare function specForModel(vendor: unknown, modelId: string): ResolvedModelSpec
export declare function withModelSpec(vendor: unknown, modelId: string, spec: unknown): unknown
export declare function clearModelSpec(vendor: unknown, modelId: string): unknown
export declare function specBadges(spec: unknown): SpecBadge[]
export declare function formatTokens(n: unknown): string
export declare function specSummary(spec: unknown): string
export declare function modelDisplayName(modelId: string, spec: unknown): string
