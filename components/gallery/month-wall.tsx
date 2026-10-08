'use client'

import { motion } from 'motion/react'
import { Film, ImageIcon } from 'lucide-react'
import { seeded, useMonths } from '@/lib/client'
import type { MediaKind } from '@/lib/types'

export function MonthWall({
  kind,
  onOpen,
  limit,
  emptyAction,
}: {
  kind: MediaKind
  onOpen: (month: string) => void
  limit?: number
  emptyAction?: React.ReactNode
}) {
  const { data, isLoading } = useMonths(kind)
  const months = limit ? data?.slice(0, limit) : data
  const unit = kind === 'video' ? '段' : '张'

  if (isLoading && !data) {
    return (
      <div className="flex flex-wrap justify-center gap-8 py-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 w-60 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (!months?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
        {kind === 'video' ? (
          <Film className="size-10 text-muted-foreground/50" aria-hidden />
        ) : (
          <ImageIcon className="size-10 text-muted-foreground/50" aria-hidden />
        )}
        <p className="text-muted-foreground">{kind === 'video' ? '还没有录像' : '还没有照片'}</p>
        {emptyAction}
      </div>
    )
  }

  return (
    <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4 px-2 py-6 md:gap-x-10">
      {months.map((m, i) => {
        const r1 = seeded(Number(m.month.replace('-', '')), 1)
        const r2 = seeded(Number(m.month.replace('-', '')), 2)
        const rotate = (r1 - 0.5) * 7
        const width = 210 + Math.round(r2 * 110)
        const ratio = m.width && m.height ? m.height / m.width : 0.75
        const imgH = Math.round(width * Math.min(1.35, Math.max(0.62, ratio)))
        const offset = Math.round((seeded(i + 3, 5) - 0.5) * 48)
        const [y, mo] = m.month.split('-')
        return (
          <motion.li
            key={m.month}
            initial={{ opacity: 0, y: 40, rotate: rotate * 2 }}
            whileInView={{ opacity: 1, y: 0, rotate }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.8, delay: (i % 8) * 0.06, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginTop: offset > 0 ? offset : 0 }}
          >
            <motion.button
              type="button"
              onClick={() => onOpen(m.month)}
              whileHover={{ rotate: 0, y: -10, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="group block rounded-[4px] bg-[oklch(0.95_0.01_80)] p-2.5 pb-0 text-left shadow-[0_18px_40px_-14px_rgba(0,0,0,0.75)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ width }}
              aria-label={`${y}年${Number(mo)}月，共 ${m.count} ${unit}`}
            >
              <div className="relative overflow-hidden bg-neutral-300" style={{ height: imgH }}>
                {m.thumb && (
                  <img
                    src={m.thumb}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition duration-700 group-hover:scale-105"
                  />
                )}
                {kind === 'video' && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white backdrop-blur">
                    <Film className="size-3.5" aria-hidden />
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between px-1 py-3 text-neutral-800">
                <span className="font-serif text-lg font-semibold">
                  {y}
                  <span className="mx-0.5 text-neutral-400">/</span>
                  {Number(mo)}月
                </span>
                <span className="text-xs tabular-nums text-neutral-500">
                  {m.count} {unit}
                </span>
              </div>
            </motion.button>
          </motion.li>
        )
      })}
    </ul>
  )
}
