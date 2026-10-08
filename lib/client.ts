'use client'

import useSWR, { mutate } from 'swr'
import type { MediaKind, MonthSummary, Photo, Stats } from './types'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '加载失败')
  return res.json()
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? '操作失败')
  return data as T
}

export function refreshGallery() {
  return mutate(
    (key) =>
      typeof key === 'string' &&
      (key.startsWith('/api/photos') ||
        key.startsWith('/api/months') ||
        key.startsWith('/api/stats') ||
        key.startsWith('/api/trash') ||
        key.startsWith('/api/maintenance')),
  )
}

const swrOpts = { revalidateOnFocus: false, keepPreviousData: true }

export const useMonths = (kind: MediaKind) => useSWR<MonthSummary[]>(`/api/months?kind=${kind}`, fetcher, swrOpts)
export const usePhotos = (kind: MediaKind, month: string | null) =>
  useSWR<Photo[]>(month ? `/api/photos?kind=${kind}&month=${month}` : null, fetcher, swrOpts)
export const useFavorites = () => useSWR<Photo[]>('/api/photos?favorites=1', fetcher, swrOpts)
export const useRecent = () => useSWR<Photo[]>('/api/photos?recent=24', fetcher, swrOpts)
export const useStats = () => useSWR<Stats>('/api/stats', fetcher, swrOpts)

export function formatMonth(month: string) {
  const [y, m] = month.split('-')
  return `${y}年${Number(m)}月`
}

export function formatTaken(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function seeded(id: number, salt = 1) {
  const x = Math.sin(id * 9301 + salt * 49297) * 233280
  return x - Math.floor(x)
}

export function downloadUrl(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}
