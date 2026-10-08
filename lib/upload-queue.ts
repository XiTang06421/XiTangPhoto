'use client'

import { upload } from '@vercel/blob/client'
import { useSyncExternalStore } from 'react'
import { api, refreshGallery } from './client'
import { hashFile, monthKey, processImage, processVideo, readTakenAt } from './media'

export type UploadStatus = 'queued' | 'hashing' | 'processing' | 'uploading' | 'done' | 'skipped' | 'error'

export type UploadItem = {
  id: string
  file: File
  name: string
  status: UploadStatus
  progress: number
  message?: string
}

const CONCURRENCY = 3
let items: UploadItem[] = []
let active = 0
const seenHashes = new Set<string>()
const listeners = new Set<() => void>()
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function emit() {
  items = [...items]
  listeners.forEach((l) => l())
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
  }, 1200)
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

export function retryUpload(id: string) {
  patch(id, { status: 'queued', progress: 0, message: undefined })
  pump()
}

export function retryAllFailed() {
  items.filter((i) => i.status === 'error').forEach((i) => Object.assign(i, { status: 'queued', progress: 0, message: undefined }))
  emit()
  pump()
}

export function clearFinished() {
  items = items.filter((i) => !['done', 'skipped'].includes(i.status))
  emit()
}

function pump() {
  while (active < CONCURRENCY) {
    const next = items.find((i) => i.status === 'queued')
    if (!next) return
    active++
    next.status = 'hashing'
    emit()
    run(next).finally(() => {
      active--
      pump()
    })
  }
}

function extension(file: File) {
  const fromName = file.name.split('.').pop()
  if (fromName && fromName.length <= 5 && fromName !== file.name) return fromName.toLowerCase()
  return file.type.split('/')[1] ?? 'bin'
}

async function run(item: UploadItem) {
  const { file } = item
  try {
    const hash = await hashFile(file)
    if (seenHashes.has(hash)) {
      patch(item.id, { status: 'skipped', progress: 1, message: '本次已上传过' })
      return
    }
    const existing = await api<{ hash: string; deleted: boolean }[]>('/api/photos/check', 'POST', { hashes: [hash] })
    if (existing.length) {
      seenHashes.add(hash)
      patch(item.id, {
        status: 'skipped',
        progress: 1,
        message: existing[0].deleted ? '已存在于回收站' : '重复，已跳过',
      })
      return
    }

    patch(item.id, { status: 'processing', progress: 0.04 })
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    const [meta, takenAt] = await Promise.all([
      kind === 'video' ? processVideo(file) : processImage(file),
      readTakenAt(file),
    ])
    const month = monthKey(takenAt)
    const base = `photos/${month}/${hash.slice(0, 20)}`

    patch(item.id, { status: 'uploading', progress: 0.08 })
    const total = file.size + meta.display.size + meta.thumb.size
    const loaded = [0, 0, 0]
    const track = (slot: number) => (e: { loaded: number }) => {
      loaded[slot] = e.loaded
      patch(item.id, { progress: 0.08 + 0.9 * Math.min(1, (loaded[0] + loaded[1] + loaded[2]) / total) })
    }
    const opts = { access: 'public' as const, handleUploadUrl: '/api/upload' }
    const [original, display, thumb] = await Promise.all([
      upload(`${base}.${extension(file)}`, file, {
        ...opts,
        contentType: file.type || undefined,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: track(0),
      }),
      upload(`${base}-display.${meta.display.type === 'image/webp' ? 'webp' : 'jpg'}`, meta.display, {
        ...opts,
        onUploadProgress: track(1),
      }),
      upload(`${base}-thumb.${meta.thumb.type === 'image/webp' ? 'webp' : 'jpg'}`, meta.thumb, {
        ...opts,
        onUploadProgress: track(2),
      }),
    ])

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
    seenHashes.add(hash)
    patch(item.id, {
      status: result.duplicate ? 'skipped' : 'done',
      progress: 1,
      message: result.duplicate ? '重复，已跳过' : undefined,
    })
    scheduleRefresh()
  } catch (error) {
    patch(item.id, { status: 'error', message: (error as Error).message || '上传失败' })
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useUploadQueue() {
  return useSyncExternalStore(subscribe, () => items, () => items)
}
