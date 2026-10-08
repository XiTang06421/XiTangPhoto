'use client'

const DISPLAY_MAX = 2560
const THUMB_MAX = 800

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Content hash for de-duplication. Large videos are hashed by head + tail + size for speed. */
export async function hashFile(file: File) {
  const LIMIT = 96 * 1024 * 1024
  if (file.size <= LIMIT) return toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
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

const NAME_DATE = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[ _T-]+(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})/

export function parseDateFromName(name: string) {
  const m = name.match(NAME_DATE)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[]
  const date = new Date(y, mo - 1, d, h, mi, s)
  if (Number.isNaN(date.getTime()) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return date
}

export async function readTakenAt(file: File) {
  const fromName = parseDateFromName(file.name)
  if (fromName) return fromName
  if (file.type.startsWith('image/')) {
    try {
      const exifr = (await import('exifr')).default
      const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
      const d = data?.DateTimeOriginal ?? data?.CreateDate
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d
    } catch {}
  }
  return new Date(file.lastModified || Date.now())
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

type Drawable = ImageBitmap | HTMLVideoElement

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

async function encode(source: Drawable, sw: number, sh: number, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality))
  if (blob && blob.type === 'image/webp') return blob
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality)))!
}

/** 64-bit difference hash used for similar-photo detection. */
function dHash(source: Drawable) {
  const canvas = makeCanvas(9, 8)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, 9, 8)
  const { data } = ctx.getImageData(0, 0, 9, 8)
  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) gray.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0'
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

export type Processed = {
  width: number
  height: number
  duration: number | null
  display: Blob
  thumb: Blob
  phash: string | null
}

export async function processImage(file: File): Promise<Processed> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const [display, thumb] = await Promise.all([
      encode(bitmap, width, height, DISPLAY_MAX, 0.88),
      encode(bitmap, width, height, THUMB_MAX, 0.8),
    ])
    return { width, height, duration: null, display, thumb, phash: dHash(bitmap) }
  } finally {
    bitmap.close()
  }
}

export async function processVideo(file: File): Promise<Processed> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('无法读取视频'))
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    video.currentTime = Math.min(1.2, duration / 3 || 0)
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      setTimeout(resolve, 3000)
    })
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const [display, thumb] = await Promise.all([
      encode(video, width, height, 1920, 0.85),
      encode(video, width, height, THUMB_MAX, 0.8),
    ])
    return { width, height, duration, display, thumb, phash: null }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function readImageSize(blob: Blob) {
  return createImageBitmap(blob).then((b) => {
    const size = { width: b.width, height: b.height }
    b.close()
    return size
  })
}
