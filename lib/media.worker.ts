/// <reference lib="webworker" />
import { DISPLAY_MAX, THUMB_MAX, dHashFromPixels, fitSize, hashFile, type Processed } from './media-core'

type Job = { id: number; op: 'hash' | 'image'; file: File }

async function resize(bitmap: ImageBitmap, max: number, quality: number) {
  const { w, h } = fitSize(bitmap.width, bitmap.height, max)
  let source: ImageBitmap = bitmap
  if (w !== bitmap.width) {
    try {
      source = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    } catch {
      source = bitmap
    }
  }
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  if (source !== bitmap) source.close()
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality })
  return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/jpeg', quality })
}

function dHash(bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(9, 8)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, 9, 8)
  return dHashFromPixels(ctx.getImageData(0, 0, 9, 8).data)
}

async function processImage(file: File): Promise<Processed> {
  const bitmap = await createImageBitmap(file)
  try {
    const [display, thumb] = await Promise.all([resize(bitmap, DISPLAY_MAX, 0.88), resize(bitmap, THUMB_MAX, 0.8)])
    return { width: bitmap.width, height: bitmap.height, duration: null, display, thumb, phash: dHash(bitmap) }
  } finally {
    bitmap.close()
  }
}

self.onmessage = async (event: MessageEvent<Job>) => {
  const { id, op, file } = event.data
  try {
    const result = op === 'hash' ? await hashFile(file) : await processImage(file)
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: (error as Error)?.message || '处理失败' })
  }
}
