'use client'

import { Check, Heart, Play } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatDuration, formatTaken, seeded } from '@/lib/client'
import type { Photo } from '@/lib/types'
import { orientedSize, RotatedImg } from './rotated-img'

const GAP = 10
const OVERSCAN = 1200

type Placed = { photo: Photo; index: number; x: number; y: number; w: number; h: number }

function layout(photos: Photo[], width: number, target: number) {
  const cols = Math.max(1, Math.round((width + GAP) / (target + GAP)))
  const colW = (width - GAP * (cols - 1)) / cols
  const heights = new Array(cols).fill(0)
  const items: Placed[] = []

  photos.forEach((photo, index) => {
    const size = orientedSize(photo)
    const ratio = size.h / size.w
    const wide = size.w / size.h > 1.15
    const span = cols >= 3 && wide && (photo.favorite || seeded(photo.id) > 0.82) ? 2 : 1

    let col = 0
    let top = Number.POSITIVE_INFINITY
    for (let c = 0; c <= cols - span; c++) {
      const t = Math.max(...heights.slice(c, c + span))
      if (t < top - 1) {
        top = t
        col = c
      }
    }
    const w = colW * span + GAP * (span - 1)
    const h = Math.round(w * ratio)
    for (let c = col; c < col + span; c++) heights[c] = top + h + GAP
    items.push({ photo, index, x: col * (colW + GAP), y: top, w, h })
  })

  return { items, height: Math.max(0, ...heights) - GAP }
}

export function Masonry({
  photos,
  tileSize,
  onOpen,
  selecting = false,
  selected,
  onToggle,
}: {
  photos: Photo[]
  tileSize: number
  onOpen: (index: number) => void
  selecting?: boolean
  selected?: Set<number>
  onToggle?: (id: number, index: number, shift: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [range, setRange] = useState({ top: 0, bottom: 3000 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const offset = el.getBoundingClientRect().top + window.scrollY
      const top = window.scrollY - offset - OVERSCAN
      setRange((prev) => {
        const next = { top, bottom: top + window.innerHeight + OVERSCAN * 2 }
        return Math.abs(prev.top - next.top) < 120 ? prev : next
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const { items, height } = useMemo(
    () => (width ? layout(photos, width, tileSize) : { items: [], height: 0 }),
    [photos, width, tileSize],
  )

  const visible = items.filter((it) => it.y + it.h > range.top && it.y < range.bottom)

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {visible.map((it) => (
        <Tile
          key={it.photo.id}
          item={it}
          selecting={selecting}
          isSelected={!!selected?.has(it.photo.id)}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

const Tile = memo(function Tile({
  item,
  selecting,
  isSelected,
  onOpen,
  onToggle,
}: {
  item: Placed
  selecting: boolean
  isSelected: boolean
  onOpen: (index: number) => void
  onToggle?: (id: number, index: number, shift: boolean) => void
}) {
  const { photo, x, y, w, h, index } = item
  const [loaded, setLoaded] = useState(false)
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  const src = w * dpr > 820 ? photo.displayUrl : photo.thumbUrl

  return (
    <button
      type="button"
      onClick={(e) => (selecting ? onToggle?.(photo.id, index, e.shiftKey) : onOpen(index))}
      aria-label={`${photo.kind === 'video' ? '录像' : '照片'} ${formatTaken(photo.takenAt)}`}
      aria-pressed={selecting ? isSelected : undefined}
      className="group absolute left-0 top-0 overflow-hidden rounded-lg bg-muted outline-none transition-[transform,width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-primary"
      style={{ width: w, height: h, transform: `translate3d(${x}px, ${y}px, 0)` }}
    >
      <RotatedImg
        src={src}
        rotation={photo.rotation}
        box={{ w, h }}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`object-cover transition-[opacity,scale,filter] duration-700 ease-out group-hover:scale-[1.03] ${
          loaded ? 'scale-100 opacity-100 blur-0' : 'scale-[1.04] opacity-0 blur-sm'
        } ${isSelected ? 'scale-[0.94]' : ''}`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 pt-10 text-left opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <span className="text-xs tracking-wide text-white/90">{formatTaken(photo.takenAt)}</span>
        {photo.note && <span className="truncate text-xs text-white/70">{photo.note}</span>}
      </div>
      {photo.kind === 'video' && (
        <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">
          <Play className="size-3 fill-current" aria-hidden />
          {formatDuration(photo.duration)}
        </span>
      )}
      {photo.favorite && !selecting && (
        <Heart
          className="pointer-events-none absolute left-2 top-2 size-4 fill-primary text-primary drop-shadow"
          aria-label="已收藏"
        />
      )}
      {selecting && (
        <span
          className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition ${
            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/80 bg-black/30'
          }`}
        >
          {isSelected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
      {selecting && isSelected && <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset ring-primary" />}
    </button>
  )
})
