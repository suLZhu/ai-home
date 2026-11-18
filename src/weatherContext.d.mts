export function fetchWeatherContext(city:string, options?:{fetchImpl?:typeof fetch;timeoutMs?:number;now?:number}):Promise<string|null>
