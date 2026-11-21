export type VisionAttachment = {
  name?: string
  type?: string
  size?: number
  assetId?: string
  preview?: string
  dataUrl?: string
}
export type VisionPart = { type: 'image_url'; image_url: { url: string } }
export type VisionTextPart = { type: 'text'; text: string }
export function stableAttachmentReference(attachment: VisionAttachment): string
export function dataUrlFromBlob(blob: Blob): Promise<string>
export function gifFirstFrame(dataUrl: string): Promise<string>
export function visionPartForAttachment(attachment: VisionAttachment, fetchAttachment: (path: string) => Promise<Response>): Promise<{part: VisionPart|null;problem:string}>
export function messageWithVision(role: string, text: string, attachments: VisionAttachment[], fetchAttachment: (path: string) => Promise<Response>): Promise<{role:string;content:string | Array<VisionPart | VisionTextPart>}>

export function historyVisionMessageIndexes(messages: Array<{role?:string;attachments?:VisionAttachment[]}>, maxMessages?: number): Set<number>
export function historicalMessageWithoutVision(message: {role?:string;content?:unknown;attachments?:VisionAttachment[]}): {role:string|undefined;content:unknown}
