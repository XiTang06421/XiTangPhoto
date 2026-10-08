'use client'

import { GripVertical } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type DockAnchor = { h: 'left' | 'right'; v: 'top' | 'bottom' }
type DockPos = DockAnchor & { x: number; y: number }

const MARGIN = 8
const DRAG_THRESHOLD = 4
const INTERACTIVE = 'button, a, input, textarea, select, label, li, [role="slider"], [data-no-drag]'

function readStored(key: string): DockPos | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as DockPos
    return typeof p.x === 'number' && typeof p.y === 'number' ? p : null
  } catch {
    return null
  }
}

function posFromRect(rect: DOMRect): DockPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const h = rect.left + rect.width / 2 < vw / 2 ? 'left' : 'right'
  const v = rect.top + rect.height / 2 < vh / 2 ? 'top' : 'bottom'
  return {
    h,
    v,
    x: Math.round(h === 'left' ? rect.left : vw - rect.right),
    y: Math.round(v === 'top' ? rect.top : vh - rect.bottom),
  }
}

/**
 * A fixed panel that can be dragged anywhere on screen. Its anchor follows the nearest
 * corner, so content that expands (lists, panels) grows toward the middle of the screen.
 */
export function DraggableDock({
  storageKey,
  defaultPos,
  className = '',
  label,
  children,
}: {
  storageKey: string
  defaultPos: DockPos
  className?: string
  label: string
  children: (anchor: DockAnchor, grip: ReactNode) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<DockPos>(defaultPos)
  const [dragging, setDragging] = useState(false)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    const stored = readStored(storageKey)
    if (stored) setPos(stored)
  }, [storageKey])

  const commit = useCallback(
    (next: DockPos) => {
      setPos(next)
      localStorage.setItem(storageKey, JSON.stringify(next))
    },
    [storageKey],
  )

  const keepInView = useCallback(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, vw - rect.width - MARGIN))
    const top = Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, vh - rect.height - MARGIN))
    if (Math.abs(left - rect.left) < 1 && Math.abs(top - rect.top) < 1) return
    setPos((p) => ({
      ...p,
      x: Math.round(p.h === 'left' ? left : vw - left - rect.width),
      y: Math.round(p.v === 'top' ? top : vh - top - rect.height),
    }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(keepInView)
    observer.observe(el)
    window.addEventListener('resize', keepInView)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', keepInView)
    }
  }, [keepInView])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const onGrip = !!target.closest('[data-drag-grip]')
    if (!onGrip && (e.pointerType !== 'mouse' || target.closest(INTERACTIVE))) return
    const el = ref.current
    if (!el) return
    const start = { x: e.clientX, y: e.clientY, rect: el.getBoundingClientRect() }
    let active = false

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        active = true
        setDragging(true)
        el.setPointerCapture(ev.pointerId)
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.min(Math.max(MARGIN, start.rect.left + dx), vw - start.rect.width - MARGIN)
      const top = Math.min(Math.max(MARGIN, start.rect.top + dy), vh - start.rect.height - MARGIN)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!active) return
      suppressClick.current = true
      const next = posFromRect(el.getBoundingClientRect())
      el.style.left = el.style.top = el.style.right = el.style.bottom = ''
      setDragging(false)
      commit(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const grip = (
    <span
      data-drag-grip
      role="button"
      tabIndex={-1}
      aria-label={`拖动${label}（双击复位）`}
      title="拖动移动位置，双击复位"
      onDoubleClick={() => commit(defaultPos)}
      className="flex shrink-0 cursor-grab touch-none items-center self-stretch px-0.5 text-muted-foreground/60 transition hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </span>
  )

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
      className={`fixed z-50 ${dragging ? 'cursor-grabbing select-none' : ''} ${className}`}
      style={{ [pos.h]: pos.x, [pos.v]: pos.y }}
    >
      {children({ h: pos.h, v: pos.v }, grip)}
    </div>
  )
}
