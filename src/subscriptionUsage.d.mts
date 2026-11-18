export type SubscriptionUsageWindow={label:string;used:number;remaining:number;resetAt:number|string|null}
export function parseSubscriptionUsage(channel:string,data:unknown):SubscriptionUsageWindow[]
export function subscriptionUsageRequest(channel:string,token:string,accountId?:string):{url:string;headers:Record<string,string>}|null
export function fetchSubscriptionUsage(channel:string,token:string,accountId:string,get:(url:string,headers:Record<string,string>)=>Promise<{status?:number;body?:string;error?:string}|null>):Promise<{windows:SubscriptionUsageWindow[];error:string}>
