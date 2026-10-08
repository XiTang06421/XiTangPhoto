'use client'

import type { Processed } from './media-core'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }
type Slot = { worker: Worker; busy: number }

let slots: Slot[] | null = null
let broken = false
let nextId = 1
const pending = new Map<number, Pending>()

export const POOL_SIZE =
  typeof navigator === 'undefined' ? 2 : Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))

function supported() {
  return !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function getSlots() {
  if (slots) return slots
  slots = Array.from({ length: POOL_SIZE }, () => {
    const worker = new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const job = pending.get(e.data.id)
      if (!job) return
      pending.delete(e.data.id)
      if (e.data.error) job.reject(new Error(e.data.error))
      else job.resolve(e.data.result)
    }
    worker.onerror = () => {
      broken = true
    }
    return { worker, busy: 0 }
  })
  return slots
}

function run<T>(op: 'hash' | 'image', file: File) {
  const slot = getSlots().reduce((a, b) => (b.busy < a.busy ? b : a))
  const id = nextId++
  slot.busy++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    slot.worker.postMessage({ id, op, file })
  }).finally(() => {
    slot.busy--
  })
}

/** Runs in a worker when possible so hashing never blocks scrolling or animations. */
export async function hashInWorker(file: File, fallback: (f: File) => Promise<string>) {
  if (!supported()) return fallback(file)
  try {
    return await run<string>('hash', file)
  } catch {
    return fallback(file)
  }
}

export async function processImageInWorker(file: File, fallback: (f: File) => Promise<Processed>) {
  if (!supported()) return fallback(file)
  try {
    return await run<Processed>('image', file)
  } catch {
    return fallback(file)
  }
}
