/** DOM-free media helpers shared by the main thread and the processing worker. */

export const DISPLAY_MAX = 2560
export const THUMB_MAX = 800
export const HASH_FULL_LIMIT = 96 * 1024 * 1024

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Content hash for de-duplication. Large videos are hashed by head + tail + size for speed. */
export async function hashFile(file: Blob) {
  if (file.size <= HASH_FULL_LIMIT) return toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  const chunk = 8 * 1024 * 1024
  const head = new Uint8Array(await file.slice(0, chunk).arrayBuffer())
  const tail = new Uint8Array(await file.slice(file.size - chunk).arrayBuffer())
  const size = new TextEncoder().encode(String(file.size))
  const merged = new Uint8Array(head.length + tail.length + size.length)
  merged.set(head, 0)
  merged.set(tail, head.length)
  merged.set(size, head.length + tail.length)
  return toHex(await crypto.subtle.digest('SHA-256', merged))
}

/** 64-bit difference hash from a 9x8 RGBA pixel buffer, used for similar-photo detection. */
export function dHashFromPixels(data: Uint8ClampedArray) {
  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) gray.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0'
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

export function fitSize(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

export type Processed = {
  width: number
  height: number
  duration: number | null
  display: Blob
  thumb: Blob
  phash: string | null
}
