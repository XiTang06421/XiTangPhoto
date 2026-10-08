'use client'

import { AnimatePresence, motion, useMotionValue } from 'motion/react'
import { Download, HeartOff, Move, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, downloadUrl, formatTaken, refreshGallery, seeded, useFavorites } from '@/lib/client'
import type { Photo, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'

const CELL = 340
const CARD_W = 240

type Placed = { photo: Photo; x: number; y: number; w: number; h: number; rotate: number }
type Opened = { item: Placed; rect: DOMRect }

function layout(photos: Photo[]) {
  const cols = Math.max(3, Math.ceil(Math.sqrt(photos.length * 1.7)))
  const placed: Placed[] = photos.map((photo, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const ratio = photo.height / Math.max(1, photo.width)
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
  const width = cols * CELL + CELL
  const height = (Math.ceil(photos.length / cols) + 0.5) * CELL
  return { placed, width, height }
}

export function FavoritesWall({ role }: { role: Role }) {
  const { data: photos, isLoading } = useFavorites()
  const { placed, width, height } = useMemo(() => layout(photos ?? []), [photos])
  const viewport = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
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
    x.set(Math.min(40, (view.w - width) / 2))
    y.set(Math.min(60, (view.h - height) / 2))
  }, [view.w, view.h, width, height, x, y])

  const constraints = {
    left: Math.min(0, view.w - width - 80),
    right: 80,
    top: Math.min(0, view.h - height - 80),
    bottom: 80,
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
          <p className="glass flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
            <Move className="size-3.5" aria-hidden />
            拖拽整面墙平移
          </p>
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
          style={{ x, y, width, height }}
          className="absolute left-0 top-0"
        >
          {placed.map((item, i) => (
            <WallCard
              key={item.photo.id}
              item={item}
              index={i}
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
  hidden,
  onOpen,
}: {
  item: Placed
  index: number
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbUrl}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ height: h }}
        className="w-full bg-muted object-cover"
      />
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
  const ratio = photo.width / Math.max(1, photo.height)
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
        <div className="relative size-full bg-muted">
          {photo.kind === 'video' ? (
            <video src={photo.originalUrl} poster={photo.displayUrl} controls autoPlay playsInline className="size-full object-contain" />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.displayUrl} alt="" className="absolute inset-0 size-full object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.originalUrl}
                alt={`拍摄于 ${formatTaken(photo.takenAt)}`}
                onLoad={() => setHdLoaded(true)}
                className={`absolute inset-0 size-full object-contain transition-opacity duration-700 ${hdLoaded ? 'opacity-100' : 'opacity-0'}`}
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
