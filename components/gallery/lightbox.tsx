'use client'

import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  ImageIcon,
  NotebookPen,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { api, downloadUrl, formatTaken, refreshGallery } from '@/lib/client'
import type { Photo, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'

const TOP = 64
const BOTTOM = 92
const EASE = [0.22, 1, 0.36, 1] as const

function useViewport() {
  const [size, setSize] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

export function Lightbox({
  photos,
  index,
  role,
  onIndexChange,
  onClose,
}: {
  photos: Photo[]
  index: number
  role: Role
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const { w: vw, h: vh } = useViewport()
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [notes, setNotes] = useState<Record<number, string | null>>({})
  const [direction, setDirection] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const firstOpen = useRef(true)

  const photo = photos[index]
  const prev = photos[index - 1]
  const next = photos[index + 1]
  const note = photo ? (photo.id in notes ? notes[photo.id] : photo.note) : null
  const isAdmin = role === 'admin'

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => {
    setZoom(1)
    setRotation(0)
    setPan({ x: 0, y: 0 })
    setNoteOpen(false)
  }, [photo?.id])

  useEffect(() => {
    if (!photo) onClose()
  }, [photo, onClose])

  const go = useCallback(
    (delta: number) => {
      const target = index + delta
      if (target < 0 || target >= photos.length) return
      firstOpen.current = false
      setDirection(delta)
      onIndexChange(target)
    },
    [index, photos.length, onIndexChange],
  )

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const nz = Math.min(8, Math.max(0.5, z * factor))
      if (nz <= 1) setPan({ x: 0, y: 0 })
      return nz
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === '+' || e.key === '=') zoomBy(1.25)
      else if (e.key === '-') zoomBy(0.8)
      else if (e.key.toLowerCase() === 'r') setRotation((r) => r + 90)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, zoomBy])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      zoomBy(Math.exp(-e.deltaY * 0.0016))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy, mounted])

  if (!mounted || !photo) return null

  const side = vw < 640 ? 10 : Math.min(150, vw * 0.085)
  const availW = vw - side * 2
  const availH = vh - TOP - BOTTOM
  const odd = Math.abs(rotation / 90) % 2 === 1

  function fitFor(p: Photo, rotated: boolean, maxW: number, maxH: number) {
    const bw = rotated ? p.height : p.width
    const bh = rotated ? p.width : p.height
    const s = Math.min(maxW / bw, maxH / bh)
    return { w: p.width * s, h: p.height * s }
  }

  const fit = fitFor(photo, odd, availW, availH)
  const left = vw / 2 - fit.w / 2
  const top = TOP + availH / 2 - fit.h / 2

  function onPointerDown(e: ReactPointerEvent) {
    if (photo.kind === 'video' || e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointer.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
  }
  function onPointerMove(e: ReactPointerEvent) {
    const p = pointer.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true
    if (zoom > 1) {
      setDragging(true)
      setPan({ x: p.px + dx, y: p.py + dy })
    }
  }
  function onPointerUp(e: ReactPointerEvent) {
    const p = pointer.current
    pointer.current = null
    setDragging(false)
    if (!p || zoom > 1) return
    const dx = e.clientX - p.x
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - p.y)) go(dx < 0 ? 1 : -1)
  }

  async function toggleFavorite() {
    try {
      await api(`/api/photos/${photo.id}`, 'PATCH', { favorite: !photo.favorite })
      toast(photo.favorite ? '已取消收藏' : '已加入收藏')
      refreshGallery()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  async function setCover() {
    try {
      await api('/api/covers', 'POST', { photoId: photo.id })
      toast('已设为本月代表图')
      refreshGallery()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  async function remove() {
    if (photo.favorite) return toast('收藏的照片受保护，请先取消收藏', 'info')
    const ok = await confirmAction({
      title: '移入回收站？',
      description: '30 天内可在「维护 · 回收站」中恢复。',
      confirmText: '移入回收站',
      danger: true,
    })
    if (!ok) return
    await api('/api/photos/batch', 'POST', { action: 'trash', ids: [photo.id] })
    toast('已移入回收站')
    refreshGallery()
  }

  async function saveNote() {
    const value = noteDraft.trim()
    setNotes((n) => ({ ...n, [photo.id]: value || null }))
    setNoteOpen(false)
    try {
      await api(`/api/photos/${photo.id}`, 'PATCH', { note: value })
      toast('备注已保存')
      refreshGallery()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const neighborH = availH * 0.62
  const tool =
    'flex size-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-35'

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] select-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      role="dialog"
      aria-modal="true"
      aria-label="照片查看"
    >
      <div className="absolute inset-0 bg-[oklch(0.1_0.005_40/0.94)] backdrop-blur-xl" />
      <div
        ref={stageRef}
        className={`absolute inset-0 ${zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          if (photo.kind === 'video') return
          if (zoom > 1) {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          } else setZoom(2.5)
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pointer.current) onClose()
        }}
      >
        {vw >= 768 && prev && (
          <Neighbor key={`p-${prev.id}`} photo={prev} side="left" height={neighborH} vw={vw} top={TOP + availH / 2} offset={side} onClick={() => go(-1)} />
        )}
        {vw >= 768 && next && (
          <Neighbor key={`n-${next.id}`} photo={next} side="right" height={neighborH} vw={vw} top={TOP + availH / 2} offset={side} onClick={() => go(1)} />
        )}

        <AnimatePresence initial custom={direction}>
          <motion.div
            key={photo.id}
            className="absolute z-10 overflow-hidden rounded-md shadow-[0_30px_120px_-20px_rgba(0,0,0,0.8)]"
            style={{ transformOrigin: 'center center' }}
            initial={firstOpen.current ? { opacity: 0, scale: 0.9 } : { opacity: 0, scale: 0.6 }}
            animate={{
              opacity: 1,
              scale: zoom,
              rotate: rotation,
              x: pan.x,
              y: pan.y,
              width: fit.w,
              height: fit.h,
              left,
              top,
            }}
            exit={{ opacity: 0, y: pan.y + 140, scale: zoom * 0.9, transition: { duration: 0.5, ease: EASE } }}
            transition={{
              opacity: { duration: firstOpen.current ? 0.8 : 0.5, ease: EASE },
              scale: dragging ? { duration: 0 } : { duration: firstOpen.current ? 1.1 : 0.55, ease: EASE },
              rotate: { duration: 0.6, ease: EASE },
              width: { duration: 0.6, ease: EASE },
              height: { duration: 0.6, ease: EASE },
              left: { duration: 0.6, ease: EASE },
              top: { duration: 0.6, ease: EASE },
              x: dragging ? { duration: 0 } : { duration: 0.3, ease: EASE },
              y: dragging ? { duration: 0 } : { duration: 0.3, ease: EASE },
            }}
          >
            <MainMedia photo={photo} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between gap-4 bg-gradient-to-b from-black/50 to-transparent px-4 md:px-6">
        <div className="min-w-0 text-white">
          <p className="text-sm font-medium tracking-wide">{formatTaken(photo.takenAt)}</p>
          <p className="text-xs text-white/55 tabular-nums">
            {index + 1} / {photos.length}
            {photo.width ? ` · ${photo.width}×${photo.height}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭" className={`${tool} pointer-events-auto`}>
          <X className="size-5" />
        </button>
      </div>

      {note && !noteOpen && (
        <motion.p
          key={`note-${photo.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass absolute bottom-[92px] left-1/2 z-20 max-w-[min(90vw,560px)] -translate-x-1/2 rounded-xl border border-white/10 px-4 py-2 text-center text-sm leading-relaxed text-white/90"
        >
          {note}
        </motion.p>
      )}

      <AnimatePresence>
        {noteOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-[92px] left-1/2 z-30 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-popover p-3 shadow-2xl"
          >
            <label htmlFor="photo-note" className="mb-2 block text-xs text-muted-foreground">
              照片备注
            </label>
            <textarea
              id="photo-note"
              autoFocus
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="写下这一刻的故事…"
              className="w-full resize-none rounded-xl border bg-background/60 p-3 text-sm outline-none focus:border-primary/60"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteOpen(false)} className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                取消
              </button>
              <button type="button" onClick={saveNote} className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground">
                保存
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-3">
        <div className="glass flex items-center gap-0.5 rounded-full border border-white/10 p-1 shadow-2xl">
          <button type="button" className={tool} onClick={() => go(-1)} disabled={!prev} aria-label="上一张">
            <ChevronLeft className="size-5" />
          </button>
          {photo.kind === 'image' && (
            <>
              <button type="button" className={tool} onClick={() => zoomBy(0.8)} aria-label="缩小">
                <ZoomOut className="size-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                }}
                className="hidden w-12 text-center text-xs tabular-nums text-white/70 hover:text-white sm:block"
                aria-label="重置缩放"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className={tool} onClick={() => zoomBy(1.25)} aria-label="放大">
                <ZoomIn className="size-[18px]" />
              </button>
            </>
          )}
          <button type="button" className={tool} onClick={() => setRotation((r) => r + 90)} aria-label="旋转">
            <RotateCw className="size-[18px]" />
          </button>
          <a
            className={tool}
            href={downloadUrl(photo.originalUrl)}
            download
            aria-label="下载原图"
            title="下载原图"
          >
            <Download className="size-[18px]" />
          </a>
          {isAdmin && (
            <>
              <button
                type="button"
                className={tool}
                onClick={() => {
                  setNoteDraft(note ?? '')
                  setNoteOpen((v) => !v)
                }}
                aria-label="备注"
                title="备注"
              >
                <NotebookPen className="size-[18px]" />
              </button>
              <button
                type="button"
                className={tool}
                onClick={toggleFavorite}
                aria-label={photo.favorite ? '取消收藏' : '收藏'}
                title={photo.favorite ? '取消收藏' : '收藏'}
              >
                <Heart className={`size-[18px] ${photo.favorite ? 'fill-primary text-primary' : ''}`} />
              </button>
              <button type="button" className={tool} onClick={setCover} aria-label="设为月份代表图" title="设为月份代表图">
                <ImageIcon className="size-[18px]" />
              </button>
              <button
                type="button"
                className={tool}
                onClick={remove}
                aria-label="删除"
                title={photo.favorite ? '收藏照片受保护' : '移入回收站'}
              >
                <Trash2 className="size-[18px]" />
              </button>
            </>
          )}
          {!isAdmin && photo.favorite && (
            <span className="flex size-10 items-center justify-center" title="已收藏">
              <Heart className="size-[18px] fill-primary text-primary" aria-label="已收藏" />
            </span>
          )}
          <button type="button" className={tool} onClick={() => go(1)} disabled={!next} aria-label="下一张">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}

function MainMedia({ photo }: { photo: Photo }) {
  const [displayLoaded, setDisplayLoaded] = useState(false)
  const [originalLoaded, setOriginalLoaded] = useState(false)

  if (photo.kind === 'video') {
    return (
      <video
        src={photo.originalUrl}
        poster={photo.displayUrl}
        controls
        autoPlay
        playsInline
        className="size-full bg-black object-contain"
        onPointerDown={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <div className="relative size-full bg-muted">
      <img src={photo.thumbUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
      <img
        src={photo.displayUrl}
        alt=""
        draggable={false}
        onLoad={() => setDisplayLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${displayLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
      <img
        src={photo.originalUrl}
        alt={photo.note ?? `拍摄于 ${formatTaken(photo.takenAt)}`}
        draggable={false}
        decoding="async"
        onLoad={() => setOriginalLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${originalLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

function Neighbor({
  photo,
  side,
  height,
  vw,
  top,
  offset,
  onClick,
}: {
  photo: Photo
  side: 'left' | 'right'
  height: number
  vw: number
  top: number
  offset: number
  onClick: () => void
}) {
  const h = Math.min(height, (vw * 0.3 * photo.height) / photo.width)
  const w = (h * photo.width) / photo.height
  const visible = Math.min(w * 0.6, offset + 70)
  const x = side === 'left' ? visible - w : vw - visible
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={side === 'left' ? '上一张' : '下一张'}
      className="absolute z-0 overflow-hidden rounded-md"
      style={{ width: w, height: h, left: x, top: top - h / 2 }}
      initial={{ opacity: 0, x: side === 'left' ? -40 : 40 }}
      animate={{ opacity: 0.32, x: 0 }}
      exit={{ opacity: 0 }}
      whileHover={{ opacity: 0.6 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <img src={photo.thumbUrl} alt="" draggable={false} className="size-full object-cover blur-[1px]" />
    </motion.button>
  )
}
