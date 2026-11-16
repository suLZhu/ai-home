export function decodeHtml(value: string): string
export function stripHtml(value: string): string
export function parseSearchResults(html: string, limit?: number): { title: string; url: string; snippet: string }[]
