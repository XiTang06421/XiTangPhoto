'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CalendarRange, CheckSquare, Heart, HeartOff, ImageIcon, Loader2, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, formatMonth, refreshGallery, usePhotos } from '@/lib/client'
import type { MediaKind, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'
import { Modal } from '../ui/modal'
import { Lightbox } from './lightbox'
import { Masonry } from './masonry'

export function AlbumView({
  kind,
  month,
  role,
  tileSize,
  selecting,
  setSelecting,
  onBack,
}: {
  kind: MediaKind
  month: string
  role: Role
  tileSize: number
  selecting: boolean
  setSelecting: (v: boolean) => void
  onBack: () => void
}) {
  const { data: photos, isLoading } = usePhotos(kind, month)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastIndex = useRef<number | null>(null)
  const list = photos ?? []

  useEffect(() => {
    setSelected(new Set())
    setOpenIndex(null)
    window.scrollTo({ top: 0 })
  }, [month, kind])

  useEffect(() => {
    if (!selecting) setSelected(new Set())
  }, [selecting])

  const onToggle = useCallback(
    (id: number, index: number, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (shift && lastIndex.current !== null) {
          const [a, b] = [lastIndex.current, index].sort((x, y) => x - y)
          for (let i = a; i <= b; i++) next.add(list[i].id)
        } else if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      lastIndex.current = index
    },
    [list],
  )

  async function batch(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const res = await api<{ affected: number; skipped: number }>('/api/photos/batch', 'POST', {
        action,
        ids: Array.from(selected),
        ...extra,
      })
      return res
    } catch (e) {
      toast((e as Error).message, 'error')
      return null
    } finally {
      setBusy(false)
      refreshGallery()
    }
  }

  async function onTrash() {
    const ok = await confirmAction({
      title: `将 ${selected.size} 项移入回收站？`,
      description: '收藏的照片受保护会被自动跳过。30 天内可在回收站恢复。',
      confirmText: '移入回收站',
      danger: true,
    })
    if (!ok) return
    const res = await batch('trash')
    if (res) {
      toast(`已移入回收站 ${res.affected} 项${res.skipped ? `，跳过受保护收藏 ${res.skipped} 项` : ''}`)
      setSelected(new Set())
    }
  }

  async function onFavorite(fav: boolean) {
    const res = await batch(fav ? 'favorite' : 'unfavorite')
    if (res) toast(fav ? `已收藏 ${res.affected} 项` : `已取消收藏 ${res.affected} 项`)
  }

  async function onCover() {
    const [id] = Array.from(selected)
    await api('/api/covers', 'POST', { photoId: id })
    toast('已设为本月代表图')
    refreshGallery()
  }

  const isAdmin = role === 'admin'
  const unit = kind === 'video' ? '段录像' : '张照片'

  return (
    <section className="mx-auto max-w-[1800px] px-3 pb-32 pt-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回月份墙"
            className="flex size-10 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-wide md:text-4xl">{formatMonth(month)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              共 <span className="tabular-nums text-foreground">{list.length}</span> {unit}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setSelecting(!selecting)}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition ${
              selecting ? 'border-primary/60 bg-primary/10 text-primary' : 'hover:border-primary/40'
            }`}
          >
            <CheckSquare className="size-4" aria-hidden />
            {selecting ? '完成' : '批量管理'}
          </button>
        )}
      </div>

      {isLoading && !photos ? (
        <div className="flex justify-center py-32">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length ? (
        <Masonry
          photos={list}
          tileSize={tileSize}
          onOpen={setOpenIndex}
          selecting={selecting}
          selected={selected}
          onToggle={onToggle}
        />
      ) : (
        <p className="py-32 text-center text-muted-foreground">这个月份没有内容了</p>
      )}

      <AnimatePresence>
        {openIndex !== null && list[openIndex] && (
          <Lightbox
            photos={list}
            index={openIndex}
            role={role}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-3"
          >
            <div className="glass flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border p-1.5 shadow-2xl">
              <span className="px-3 text-sm tabular-nums">
                已选 <span className="text-primary">{selected.size}</span>
              </span>
              <BarButton
                onClick={() =>
                  setSelected(selected.size === list.length ? new Set() : new Set(list.map((p) => p.id)))
                }
              >
                {selected.size === list.length ? '取消全选' : '全选'}
              </BarButton>
              <BarButton disabled={!selected.size || busy} onClick={() => onFavorite(true)}>
                <Heart className="size-4" aria-hidden /> 收藏
              </BarButton>
              <BarButton disabled={!selected.size || busy} onClick={() => onFavorite(false)}>
                <HeartOff className="size-4" aria-hidden /> 取消收藏
              </BarButton>
              <BarButton disabled={!selected.size || busy} onClick={() => setMoveOpen(true)}>
                <CalendarRange className="size-4" aria-hidden /> 移动月份
              </BarButton>
              <BarButton disabled={selected.size !== 1 || busy} onClick={onCover}>
                <ImageIcon className="size-4" aria-hidden /> 设为代表图
              </BarButton>
              <BarButton disabled={!selected.size || busy} onClick={onTrash} danger>
                <Trash2 className="size-4" aria-hidden /> 删除
              </BarButton>
              <button
                type="button"
                onClick={() => setSelecting(false)}
                aria-label="退出选择"
                className="rounded-full p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MoveMonthModal
        open={moveOpen}
        current={month}
        count={selected.size}
        onClose={() => setMoveOpen(false)}
        onConfirm={async (target) => {
          setMoveOpen(false)
          const res = await batch('move', { month: target })
          if (res) {
            toast(`已移动 ${res.affected} 项到 ${formatMonth(target)}`)
            setSelected(new Set())
          }
        }}
      />
    </section>
  )
}

function BarButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition disabled:pointer-events-none disabled:opacity-40 ${
        danger ? 'text-destructive hover:bg-destructive/15' : 'hover:bg-secondary'
      }`}
    >
      {children}
    </button>
  )
}

function MoveMonthModal({
  open,
  current,
  count,
  onClose,
  onConfirm,
}: {
  open: boolean
  current: string
  count: number
  onClose: () => void
  onConfirm: (month: string) => void
}) {
  const [value, setValue] = useState(current)
  useEffect(() => {
    if (open) setValue(current)
  }, [open, current])
  return (
    <Modal open={open} onClose={onClose} title="移动到其他月份" description={`将选中的 ${count} 项移动到：`} size="sm">
      <label htmlFor="move-month" className="sr-only">
        目标月份
      </label>
      <input
        id="move-month"
        type="month"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl border bg-background/60 px-4 py-2.5 text-sm outline-none [color-scheme:dark] focus:border-primary/60"
      />
      <button
        type="button"
        disabled={!value || value === current}
        onClick={() => onConfirm(value)}
        className="mt-5 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        确认移动
      </button>
    </Modal>
  )
}
