'use client'

import { motion } from 'motion/react'
import { CalendarDays, CopyX, Heart, LayoutGrid, Maximize2, PanelLeftOpen, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, formatMonth, refreshGallery, useMonths } from '@/lib/client'
import type { MediaKind, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'

export function SideRail({
  role,
  kind,
  currentMonth,
  tileSize,
  onTileSize,
  selecting,
  onToggleSelecting,
  onJump,
  onFavorites,
  onUpload,
}: {
  role: Role
  kind: MediaKind
  currentMonth: string | null
  tileSize: number
  onTileSize: (n: number) => void
  selecting: boolean
  onToggleSelecting: () => void
  onJump: (month: string) => void
  onFavorites: () => void
  onUpload: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [pinned, setPinned] = useState(false)
  const { data: months } = useMonths(kind)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (e.clientX < 28) setVisible(true)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const shown = visible || pinned
  const fill = ((tileSize - 160) / (560 - 160)) * 100

  async function cleanDuplicates() {
    const ok = await confirmAction({
      title: '一键清理重复照片？',
      description: '几乎完全相同的照片只保留画质最好的一张，其余移入回收站（收藏照片不受影响）。',
      confirmText: '开始清理',
    })
    if (!ok) return
    const { affected } = await api<{ affected: number }>('/api/maintenance/similar', 'POST')
    toast(affected ? `已清理 ${affected} 张重复照片` : '没有发现重复照片')
    refreshGallery()
  }

  const btn =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground'

  return (
    <>
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        aria-label="打开侧边栏"
        className="glass fixed left-0 top-1/2 z-30 flex h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 text-muted-foreground"
      >
        <PanelLeftOpen className="size-3.5" aria-hidden />
      </button>
      <motion.aside
        aria-label="相册工具"
        onPointerLeave={() => setVisible(false)}
        initial={false}
        animate={{ x: shown ? 0 : -300, opacity: shown ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="glass fixed left-3 top-24 z-40 flex max-h-[calc(100dvh-8rem)] w-60 flex-col gap-4 rounded-2xl border p-3 shadow-2xl"
      >
        <div className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 pt-1 text-[11px] tracking-[0.2em] text-muted-foreground">整理</p>
          {role === 'admin' && (
            <>
              <button type="button" className={`${btn} ${selecting ? 'bg-primary/15 text-primary' : ''}`} onClick={onToggleSelecting}>
                <LayoutGrid className="size-4" aria-hidden />
                {selecting ? '退出批量选择' : '批量选择'}
              </button>
              <button type="button" className={btn} onClick={onUpload}>
                <Upload className="size-4" aria-hidden />
                上传照片 / 录像
              </button>
              <button type="button" className={btn} onClick={cleanDuplicates}>
                <CopyX className="size-4" aria-hidden />
                一键清理重复
              </button>
            </>
          )}
          <button type="button" className={btn} onClick={onFavorites}>
            <Heart className="size-4" aria-hidden />
            收藏墙
          </button>
        </div>

        <div className="px-3">
          <label htmlFor="tile-size" className="mb-2 flex items-center justify-between text-[11px] tracking-[0.2em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Maximize2 className="size-3" aria-hidden />
              图片大小
            </span>
            <span className="tabular-nums tracking-normal">{tileSize}px</span>
          </label>
          <input
            id="tile-size"
            type="range"
            min={160}
            max={560}
            step={10}
            value={tileSize}
            onChange={(e) => onTileSize(Number(e.target.value))}
            className="range w-full"
            style={{ ['--fill' as string]: `${fill}%` }}
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] tracking-[0.2em] text-muted-foreground">
            <CalendarDays className="size-3" aria-hidden />
            月份跳转
          </p>
          <ul className="thin-scroll -mr-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-1">
            {months?.map((m) => (
              <li key={m.month}>
                <button
                  type="button"
                  onClick={() => onJump(m.month)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition hover:bg-secondary ${
                    currentMonth === m.month ? 'bg-secondary text-primary' : 'text-foreground/85'
                  }`}
                >
                  {formatMonth(m.month)}
                  <span className="text-xs tabular-nums text-muted-foreground">{m.count}</span>
                </button>
              </li>
            ))}
            {months && !months.length && <li className="px-3 py-2 text-xs text-muted-foreground">暂无内容</li>}
          </ul>
        </div>
      </motion.aside>
    </>
  )
}
