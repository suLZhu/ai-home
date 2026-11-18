export type RequestWeights={context:number;tools:number;worldbook:number}
export function requestInputWeights(messages:unknown[],tools:unknown[],worldEntries?:unknown[]):RequestWeights
export function allocateInputTokens(total:number,weights:RequestWeights):RequestWeights
export function tokenCountLabel(value:number):string
