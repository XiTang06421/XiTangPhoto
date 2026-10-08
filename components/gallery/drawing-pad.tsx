'use client'

import { Eraser, Paintbrush, Trash2, Undo2 } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

const COLORS = ['#1f1a17', '#e2726a', '#f0b45a', '#6cae86', '#5b8fd6', '#9b7bd8', '#f5f1ea']
const PAPER = '#f3ede4'
const W = 960
const H = 600

export type DrawingPadHandle = { toBlob: () => Promise<Blob | null>; isEmpty: () => boolean; clear: () => void }

export const DrawingPad = forwardRef<DrawingPadHandle>(function DrawingPad(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState(COLORS[1])
  const [size, setSize] = useState(8)
  const [eraser, setEraser] = useState(false)
  const history = useRef<ImageData[]>([])
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const strokes = useRef(0)

  const ctx = () => canvas.current?.getContext('2d', { willReadFrequently: true }) ?? null

  useEffect(() => {
    const c = ctx()
    if (!c) return
    c.lineCap = 'round'
    c.lineJoin = 'round'
  }, [])

  useImperativeHandle(ref, () => ({
    isEmpty: () => strokes.current === 0,
    clear,
    toBlob: () =>
      new Promise((resolve) => {
        const src = canvas.current
        if (!src) return resolve(null)
        const out = document.createElement('canvas')
        out.width = W
        out.height = H
        const o = out.getContext('2d')!
        o.fillStyle = PAPER
        o.fillRect(0, 0, W, H)
        o.drawImage(src, 0, 0)
        out.toBlob(resolve, 'image/png')
      }),
  }))

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ctx()
    if (!c) return
    e.currentTarget.setPointerCapture(e.pointerId)
    history.current.push(c.getImageData(0, 0, W, H))
    if (history.current.length > 30) history.current.shift()
    drawing.current = true
    last.current = point(e)
    strokes.current++
    draw(e)
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ctx()
    if (!drawing.current || !c || !last.current) return
    const p = point(e)
    const pressure = e.pressure && e.pointerType === 'pen' ? 0.5 + e.pressure : 1
    c.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    c.strokeStyle = color
    c.lineWidth = (eraser ? size * 2.5 : size) * pressure
    c.beginPath()
    c.moveTo(last.current.x, last.current.y)
    c.lineTo(p.x + 0.01, p.y)
    c.stroke()
    last.current = p
  }

  function end() {
    drawing.current = false
    last.current = null
  }

  function undo() {
    const c = ctx()
    const prev = history.current.pop()
    if (c && prev) {
      c.putImageData(prev, 0, 0)
      strokes.current = Math.max(0, strokes.current - 1)
    }
  }

  function clear() {
    ctx()?.clearRect(0, 0, W, H)
    history.current = []
    strokes.current = 0
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="涂鸦画板"
        style={{ backgroundColor: PAPER, cursor: eraser ? 'cell' : 'crosshair' }}
        className="aspect-[8/5] w-full touch-none rounded-lg"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="颜色">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={!eraser && color === c}
              aria-label={`颜色 ${c}`}
              onClick={() => {
                setColor(c)
                setEraser(false)
              }}
              style={{ backgroundColor: c }}
              className={`size-6 rounded-full ring-offset-2 ring-offset-card transition ${!eraser && color === c ? 'scale-110 ring-2 ring-primary' : 'ring-1 ring-border'}`}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          粗细
          <input
            type="range"
            min={2}
            max={40}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="range w-24"
            style={{ '--fill': `${((size - 2) / 38) * 100}%` } as React.CSSProperties}
          />
          <span className="w-5 tabular-nums">{size}</span>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton active={!eraser} onClick={() => setEraser(false)} label="画笔">
            <Paintbrush className="size-4" />
          </ToolButton>
          <ToolButton active={eraser} onClick={() => setEraser(true)} label="橡皮">
            <Eraser className="size-4" />
          </ToolButton>
          <ToolButton onClick={undo} label="撤销">
            <Undo2 className="size-4" />
          </ToolButton>
          <ToolButton onClick={clear} label="清空">
            <Trash2 className="size-4" />
          </ToolButton>
        </div>
      </div>
    </div>
  )
})

function ToolButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
