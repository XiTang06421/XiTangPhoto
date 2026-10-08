'use client'

import { animate, AnimatePresence, motion, useMotionValue } from 'motion/react'
import { Download, HeartOff, Move, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, downloadUrl, formatTaken, refreshGallery, seeded, useFavorites } from '@/lib/client'
import type { Photo, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'
import { orientedSize, RotatedImg } from './rotated-img'

const CELL = 340
const CARD_W = 240
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2.5

type Placed = { photo: Photo; x: number; y: number; w: number; h: number; rotate: number }
type Opened = { item: Placed; rect: DOMRect }

function layout(photos: Photo[]) {
  const cols = Math.max(3, Math.ceil(Math.sqrt(photos.length * 1.7)))
  const placed: Placed[] = photos.map((photo, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const size = orientedSize(photo)
    const ratio = size.h / size.w
    const scale = 0.8 + seeded(photo.id, 3) * 0.45
    const w = CARD_W * scale * (ratio > 1.2 ? 0.82 : 1)
    const h = w * ratio
    return {
      photo,
      w,
      h,
      x: col * CELL + (row % 2) * (CELL / 2) + (seeded(photo.id, 1) - 0.5) * 90,
      y: row * CELL * 0.92 + (seeded(photo.id, 2) - 0.5) * 80,
      rotate: (seeded(photo.id, 4) - 0.5) * 16,
    }
  })
  if (!placed.length) return { placed, width: 0, height: 0 }
  const PAD = 48
  const minX = Math.min(...placed.map((p) => p.x))
  const minY = Math.min(...placed.map((p) => p.y))
  for (const p of placed) {
    p.x += PAD - minX
    p.y += PAD - minY
  }
  const width = Math.max(...placed.map((p) => p.x + p.w + 16)) + PAD
  const height = Math.max(...placed.map((p) => p.y + p.h + 56)) + PAD
  return { placed, width, height }
}

/** Centers the wall on an axis when it fits; otherwise keeps its edges from leaving the viewport. */
function clampAxis(pos: number, content: number, viewport: number) {
  if (content <= viewport) return (viewport - content) / 2
  return Math.min(0, Math.max(viewport - content, pos))
}

export function FavoritesWall({ role }: { role: Role }) {
  const { data: photos, isLoading } = useFavorites()
  const { placed, width, height } = useMemo(() => layout(photos ?? []), [photos])
  const viewport = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState({ w: 0, h: 0 })
  const [opened, setOpened] = useState<Opened | null>(null)

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!view.w) return
    const s = scale.get()
    x.set(clampAxis(0, width * s, view.w))
    y.set(clampAxis(0, height * s, view.h))
  }, [view.w, view.h, width, height, x, y, scale])

  const zoomTo = useCallback(
    (next: number, cx = view.w / 2, cy = view.h / 2, animated = true) => {
      const s = scale.get()
      const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
      if (ns === s) return
      const nx = clampAxis(cx - ((cx - x.get()) * ns) / s, width * ns, view.w)
      const ny = clampAxis(cy - ((cy - y.get()) * ns) / s, height * ns, view.h)
      setZoom(ns)
      if (animated) {
        const opts = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }
        animate(scale, ns, opts)
        animate(x, nx, opts)
        animate(y, ny, opts)
      } else {
        scale.set(ns)
        x.set(nx)
        y.set(ny)
      }
    },
    [scale, x, y, view.w, view.h, width, height],
  )

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      zoomTo(scale.get() * factor, e.clientX - rect.left, e.clientY - rect.top, false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomTo, scale])

  const fitsX = width * zoom <= view.w
  const fitsY = height * zoom <= view.h
  const constraints = {
    left: fitsX ? clampAxis(0, width * zoom, view.w) - 60 : view.w - width * zoom - 60,
    right: fitsX ? clampAxis(0, width * zoom, view.w) + 60 : 60,
    top: fitsY ? clampAxis(0, height * zoom, view.h) - 60 : view.h - height * zoom - 60,
    bottom: fitsY ? clampAxis(0, height * zoom, view.h) + 60 : 60,
  }

  function open(item: Placed, el: HTMLElement) {
    if (dragged.current) return
    setOpened({ item, rect: el.getBoundingClientRect() })
  }

  return (
    <section aria-labelledby="fav-title" className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-5 pt-8 md:px-10">
        <div>
          <h2 id="fav-title" className="font-serif text-2xl font-semibold tracking-wide md:text-3xl">
            收藏
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {photos ? `共 ${photos.length} 张 · 收藏的照片永远不会被清理` : '加载中…'}
          </p>
        </div>
        {!!photos?.length && (
          <div className="flex flex-col items-end gap-2">
            <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-full border p-1 shadow-lg">
              <button
                type="button"
                onClick={() => zoomTo(zoom / 1.25)}
                disabled={zoom <= MIN_ZOOM}
                aria-label="缩小收藏墙"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-35"
              >
                <ZoomOut className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => zoomTo(1)}
                aria-label="重置缩放"
                title="重置为 100%"
                className="w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => zoomTo(zoom * 1.25)}
                disabled={zoom >= MAX_ZOOM}
                aria-label="放大收藏墙"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-35"
              >
                <ZoomIn className="size-4" />
              </button>
            </div>
            <p className="glass hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <Move className="size-3.5" aria-hidden />
              拖拽平移 · 滚轮缩放
            </p>
          </div>
        )}
      </div>

      <div
        ref={viewport}
        className="relative h-[calc(100dvh-4rem)] cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      >
        {!isLoading && !photos?.length && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p className="font-serif text-xl text-foreground">还没有收藏</p>
            <p className="text-sm">在相册里打开喜欢的照片，点一下爱心就会贴到这面墙上。</p>
          </div>
        )}
        <motion.div
          drag
          dragConstraints={constraints}
          dragElastic={0.12}
          dragTransition={{ power: 0.25, timeConstant: 260 }}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={() => setTimeout(() => (dragged.current = false), 60)}
          style={{ x, y, scale, width, height, transformOrigin: '0 0' }}
          className="absolute left-0 top-0"
        >
          {placed.map((item, i) => (
            <WallCard
              key={item.photo.id}
              item={item}
              index={i}
              hd={zoom > 1.4}
              hidden={opened?.item.photo.id === item.photo.id}
              onOpen={open}
            />
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {opened && <FavoriteViewer key={opened.item.photo.id} opened={opened} role={role} onClose={() => setOpened(null)} />}
      </AnimatePresence>
    </section>
  )
}

function WallCard({
  item,
  index,
  hd,
  hidden,
  onOpen,
}: {
  item: Placed
  index: number
  hd: boolean
  hidden: boolean
  onOpen: (item: Placed, el: HTMLElement) => void
}) {
  const { photo, x, y, w, h, rotate } = item
  return (
    <motion.button
      type="button"
      onClick={(e) => onOpen(item, e.currentTarget)}
      aria-label={`查看 ${formatTaken(photo.takenAt)} 的收藏`}
      initial={{ opacity: 0, scale: 0.3, rotate: rotate - 25 }}
      animate={{ opacity: hidden ? 0 : 1, scale: 1, rotate }}
      whileHover={{ scale: 1.06, rotate: rotate * 0.4, zIndex: 5 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
        delay: hidden ? 0 : Math.min(index, 40) * 0.05,
        opacity: { duration: hidden ? 0.01 : 0.3 },
      }}
      style={{ left: x, top: y, width: w + 16 }}
      className="group absolute rounded-sm bg-foreground p-2 pb-8 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.7)]"
    >
      <div className="relative w-full overflow-hidden bg-muted" style={{ height: h }}>
        <RotatedImg
          src={hd && photo.kind === 'image' ? photo.displayUrl : photo.thumbUrl}
          rotation={photo.rotation}
          box={{ w, h }}
          loading="lazy"
          decoding="async"
          className="object-cover"
        />
      </div>
      <span className="absolute inset-x-0 bottom-2 text-center font-serif text-xs text-background/70">
        {formatTaken(photo.takenAt).split(' ')[0]}
      </span>
    </motion.button>
  )
}

function FavoriteViewer({ opened, role, onClose }: { opened: Opened; role: Role; onClose: () => void }) {
  const { item, rect } = opened
  const { photo } = item
  const [hdLoaded, setHdLoaded] = useState(false)
  const [vw, vh] = typeof window === 'undefined' ? [1200, 800] : [window.innerWidth, window.innerHeight]
  const oriented = orientedSize(photo)
  const ratio = oriented.w / oriented.h
  const maxW = vw * 0.9
  const maxH = vh * 0.82
  const targetW = Math.min(maxW, maxH * ratio)
  const targetH = targetW / ratio

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const prevent = (e: WheelEvent) => e.preventDefault()
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', prevent, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', prevent)
    }
  }, [onClose])

  const origin = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    rotate: item.rotate,
    opacity: 1,
  }

  async function unfavorite() {
    const ok = await confirmAction({ title: '取消收藏？', description: '照片会回到普通相册，不会被删除。', confirmText: '取消收藏' })
    if (!ok) return
    await api('/api/photos/batch', 'POST', { action: 'unfavorite', ids: [photo.id] })
    toast('已取消收藏')
    onClose()
    refreshGallery()
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal aria-label="收藏照片">
      <motion.button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-background/85 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      />
      <motion.div
        className="absolute overflow-hidden rounded-sm bg-foreground p-2 shadow-2xl"
        initial={origin}
        animate={{
          left: (vw - targetW) / 2 - 8,
          top: (vh - targetH) / 2 - 8,
          width: targetW + 16,
          height: targetH + 16,
          rotate: 360,
        }}
        exit={{ ...origin, transition: { duration: 0.65, ease: [0.65, 0, 0.35, 1] } }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative size-full overflow-hidden bg-muted" style={{ containerType: 'size' }}>
          {photo.kind === 'video' ? (
            <video src={photo.originalUrl} poster={photo.displayUrl} controls autoPlay playsInline className="size-full object-contain" />
          ) : (
            <>
              <RotatedImg src={photo.displayUrl} rotation={photo.rotation} className="object-cover" />
              <RotatedImg
                src={photo.originalUrl}
                rotation={photo.rotation}
                alt={`拍摄于 ${formatTaken(photo.takenAt)}`}
                onLoad={() => setHdLoaded(true)}
                className={`object-cover transition-opacity duration-700 ${hdLoaded ? 'opacity-100' : 'opacity-0'}`}
              />
            </>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.5 } }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        className="glass absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border p-1.5 shadow-2xl"
      >
        <span className="px-3 text-xs text-muted-foreground">{formatTaken(photo.takenAt)}</span>
        <a
          href={downloadUrl(photo.originalUrl)}
          download
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-secondary"
        >
          <Download className="size-4" aria-hidden />
          原图
        </a>
        {role === 'admin' && (
          <button
            type="button"
            onClick={unfavorite}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <HeartOff className="size-4" aria-hidden />
            取消收藏
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 hover:bg-secondary">
          <X className="size-4" />
        </button>
      </motion.div>
    </div>
  )
}
