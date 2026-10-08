'use client'

import { upload } from '@vercel/blob/client'
import { useSyncExternalStore } from 'react'
import { api, refreshGallery } from './client'
import { hashFile, monthKey, processImage, processVideo, readTakenAt } from './media'
import { POOL_SIZE, hashInWorker, processImageInWorker } from './worker-pool'

export type UploadStatus = 'queued' | 'hashing' | 'ready' | 'processing' | 'uploading' | 'done' | 'skipped' | 'error'

export type UploadItem = {
  id: string
  file: File
  name: string
  status: UploadStatus
  progress: number
  hash?: string
  message?: string
}

/** Stage 1 (content hash + duplicate check) runs ahead of stage 2 so duplicates are skipped instantly. */
const HASH_CONCURRENCY = POOL_SIZE + 1
const UPLOAD_CONCURRENCY = 4
const MAX_READY_AHEAD = 24
const ESTIMATED_BYTES_PER_SEC = 2.5 * 1024 * 1024

let items: UploadItem[] = []
let paused = false
const controllers = new Map<string, AbortController>()
let hashing = 0
let uploading = 0
const seenHashes = new Set<string>()
const listeners = new Set<() => void>()
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let emitFrame: number | null = null

function emit() {
  if (emitFrame !== null) return
  emitFrame = requestAnimationFrame(() => {
    emitFrame = null
    items = [...items]
    listeners.forEach((l) => l())
  })
}

function patch(id: string, data: Partial<UploadItem>) {
  const item = items.find((i) => i.id === id)
  if (item) Object.assign(item, data)
  emit()
}

function scheduleRefresh() {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshGallery()
  }, 1500)
}

type CheckResult = { hash: string; deleted: boolean }
type CheckRequest = { hash: string; resolve: (r: CheckResult | null) => void; reject: (e: Error) => void }
let checkBatch: CheckRequest[] = []
let checkTimer: ReturnType<typeof setTimeout> | null = null

/** Collects hashes for a moment and checks them against the server in one request. */
function checkExisting(hash: string) {
  return new Promise<CheckResult | null>((resolve, reject) => {
    checkBatch.push({ hash, resolve, reject })
    if (checkBatch.length >= 200) flushChecks()
    else if (!checkTimer) checkTimer = setTimeout(flushChecks, 60)
  })
}

async function flushChecks() {
  if (checkTimer) clearTimeout(checkTimer)
  checkTimer = null
  const batch = checkBatch
  checkBatch = []
  if (!batch.length) return
  try {
    const rows = await api<CheckResult[]>('/api/photos/check', 'POST', { hashes: batch.map((b) => b.hash) })
    const found = new Map(rows.map((r) => [r.hash, r]))
    batch.forEach((b) => b.resolve(found.get(b.hash) ?? null))
  } catch (error) {
    batch.forEach((b) => b.reject(error as Error))
  }
}

const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/')

export function enqueueFiles(files: FileList | File[]) {
  const list = Array.from(files).filter(isMedia)
  for (const file of list) {
    items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      status: 'queued',
      progress: 0,
    })
  }
  emit()
  pump()
  return list.length
}

function resetForRetry(item: UploadItem) {
  if (item.hash) seenHashes.delete(item.hash)
  Object.assign(item, { status: 'queued', progress: 0, message: undefined, hash: undefined })
}

export function retryUpload(id: string) {
  const item = items.find((i) => i.id === id)
  if (!item) return
  resetForRetry(item)
  emit()
  pump()
}

export function retryAllFailed() {
  items.filter((i) => i.status === 'error').forEach(resetForRetry)
  emit()
  pump()
}

export function clearUploadHistory(statuses: UploadStatus[] = ['done', 'skipped', 'error']) {
  const removable = new Set(statuses)
  items = items.filter((i) => !removable.has(i.status))
  emit()
}

export function clearFinished() {
  clearUploadHistory()
}

const ACTIVE: UploadStatus[] = ['processing', 'uploading']

/** Stops starting new files and aborts in-flight transfers; they resume from the start of the file later. */
export function pauseUploads() {
  paused = true
  for (const item of items) {
    if (ACTIVE.includes(item.status)) {
      controllers.get(item.id)?.abort()
      Object.assign(item, { status: 'ready', progress: 0.03, message: undefined })
    }
  }
  emit()
}

export function resumeUploads() {
  paused = false
  emit()
  pump()
}

export function cancelUpload(id: string) {
  const item = items.find((i) => i.id === id)
  if (!item) return
  controllers.get(id)?.abort()
  if (item.hash && item.status !== 'done') seenHashes.delete(item.hash)
  items = items.filter((i) => i.id !== id)
  emit()
  pump()
}

export function cancelAllPending() {
  const finished = new Set<UploadStatus>(['done', 'skipped'])
  for (const item of items) {
    if (finished.has(item.status)) continue
    controllers.get(item.id)?.abort()
    if (item.hash) seenHashes.delete(item.hash)
  }
  items = items.filter((i) => finished.has(i.status))
  paused = false
  emit()
}

function friendlyError(error: unknown) {
  const message = (error as Error)?.message || ''
  if (/suspend/i.test(message)) return '云存储已满被暂停，请先升级存储容量'
  if (/quota|limit|exceed/i.test(message)) return '云存储容量不足'
  return message || '上传失败'
}

function pump() {
  if (paused) {
    emit()
    return
  }
  const ready = items.filter((i) => i.status === 'ready').length
  while (hashing < HASH_CONCURRENCY && ready + hashing < MAX_READY_AHEAD) {
    const next = items.find((i) => i.status === 'queued')
    if (!next) break
    hashing++
    next.status = 'hashing'
    identify(next).finally(() => {
      hashing--
      pump()
    })
  }
  while (uploading < UPLOAD_CONCURRENCY) {
    const next = items.find((i) => i.status === 'ready')
    if (!next) break
    uploading++
    next.status = 'processing'
    transfer(next).finally(() => {
      uploading--
      pump()
    })
  }
  emit()
}

async function identify(item: UploadItem) {
  try {
    const hash = await hashInWorker(item.file, hashFile)
    if (seenHashes.has(hash)) {
      patch(item.id, { status: 'skipped', progress: 1, message: '本次已上传过' })
      return
    }
    seenHashes.add(hash)
    const existing = await checkExisting(hash)
    if (existing) {
      patch(item.id, {
        status: 'skipped',
        progress: 1,
        message: existing.deleted ? '已存在于回收站' : '重复，已跳过',
      })
      return
    }
    patch(item.id, { status: 'ready', progress: 0.03, hash })
  } catch (error) {
    patch(item.id, { status: 'error', message: (error as Error).message || '识别失败' })
  }
}

function extension(file: File) {
  const fromName = file.name.split('.').pop()
  if (fromName && fromName.length <= 5 && fromName !== file.name) return fromName.toLowerCase()
  return file.type.split('/')[1] ?? 'bin'
}

async function transfer(item: UploadItem) {
  const { file } = item
  const hash = item.hash as string
  const controller = new AbortController()
  controllers.set(item.id, controller)
  try {
    patch(item.id, { status: 'processing', progress: 0.05 })
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    const [meta, takenAt] = await Promise.all([
      kind === 'video' ? processVideo(file) : processImageInWorker(file, processImage),
      readTakenAt(file),
    ])
    const month = monthKey(takenAt)
    const base = `photos/${month}/${hash.slice(0, 20)}`

    patch(item.id, { status: 'uploading', progress: 0.1 })
    const sizes = [file.size, meta.display.size, meta.thumb.size]
    const total = sizes.reduce((a, b) => a + b, 0) || 1
    const finished = [false, false, false]
    const startedAt = performance.now()
    // Streamed progress in @vercel/blob races with concurrent/retried requests
    // ("Cannot write to a closing writable stream"), so progress is estimated instead.
    const ticker = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000
      const estimated = Math.min(0.92, (elapsed * ESTIMATED_BYTES_PER_SEC) / total)
      const done = sizes.reduce((sum, s, i) => sum + (finished[i] ? s : 0), 0) / total
      patch(item.id, { progress: 0.1 + 0.88 * Math.max(done, estimated) })
    }, 300)
    const opts = { access: 'public' as const, handleUploadUrl: '/api/upload', abortSignal: controller.signal }
    const ext = (b: Blob) => (b.type === 'image/webp' ? 'webp' : 'jpg')
    const send = async (slot: number, path: string, body: Blob, extra?: Record<string, unknown>) => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await upload(path, body, { ...opts, ...extra })
          finished[slot] = true
          return result
        } catch (error) {
          lastError = error
          if (controller.signal.aborted || /suspend/i.test((error as Error)?.message ?? '')) throw error
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt))
        }
      }
      throw lastError instanceof Error ? lastError : new Error('上传失败，请稍后重试')
    }
    let original
    let display
    let thumb
    try {
      // Keep the three Blob streams sequential. This avoids closing one stream while
      // the browser is still backpressuring another stream on large batches.
      original = await send(0, `${base}.${extension(file)}`, file, {
        contentType: file.type || undefined,
        multipart: file.size > 24 * 1024 * 1024,
      })
      display = await send(1, `${base}-display.${ext(meta.display)}`, meta.display)
      thumb = await send(2, `${base}-thumb.${ext(meta.thumb)}`, meta.thumb)
    } finally {
      clearInterval(ticker)
    }
    patch(item.id, { progress: 0.98 })

    const result = await api<{ duplicate: boolean }>('/api/photos', 'POST', {
      hash,
      phash: meta.phash,
      kind,
      originalUrl: original.url,
      displayUrl: display.url,
      thumbUrl: thumb.url,
      width: meta.width,
      height: meta.height,
      size: file.size,
      duration: meta.duration,
      takenAt: takenAt.toISOString(),
      month,
    })
    patch(item.id, {
      status: result.duplicate ? 'skipped' : 'done',
      progress: 1,
      message: result.duplicate ? '重复��已跳过' : undefined,
    })
    scheduleRefresh()
  } catch (error) {
    // Paused or cancelled: pauseUploads/cancelUpload already set the item's state.
    if (controller.signal.aborted) return
    seenHashes.delete(hash)
    const message = friendlyError(error)
    patch(item.id, { status: 'error', message })
    // A suspended store rejects every file, so stop the queue instead of failing thousands of items.
    if (/suspend/i.test((error as Error)?.message ?? '')) pauseUploads()
  } finally {
    controllers.delete(item.id)
  }
}

export function useUploadPaused() {
  return useSyncExternalStore(subscribe, () => paused, () => false)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useUploadQueue() {
  return useSyncExternalStore(subscribe, () => items, () => items)
}
