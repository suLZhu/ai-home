export function isZip(bytes: Uint8Array): boolean
export function readZip(input: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>>
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string
