'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Upload } from 'lucide-react'
import { useState } from 'react'
import { useRecent, useStats } from '@/lib/client'
import type { Role, Section } from '@/lib/types'
import { Lightbox } from './lightbox'
import { Masonry } from './masonry'
import { MonthWall } from './month-wall'

export function HomeSection({
  role,
  tileSize,
  onNavigate,
  onOpenMonth,
  onUpload,
}: {
  role: Role
  tileSize: number
  onNavigate: (s: Section) => void
  onOpenMonth: (month: string) => void
  onUpload: () => void
}) {
  const { data: stats } = useStats()
  const { data: recent } = useRecent()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const heroPhotos = (recent ?? []).slice(0, 5)

  const statItems = [
    { label: '照片', value: stats?.images, go: 'daily' as Section },
    { label: '录像', value: stats?.videos, go: 'videos' as Section },
    { label: '收藏', value: stats?.favorites, go: 'favorites' as Section },
    { label: '月份', value: stats?.months, go: 'daily' as Section },
  ]

  return (
    <div className="pb-32">
      <section className="relative isolate flex min-h-[78vh] items-end overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden>
          {heroPhotos.length ? (
            <div className="grid size-full grid-cols-5 gap-1 opacity-70">
              {heroPhotos.map((p, i) => (
                <motion.img
                  key={p.id}
                  src={p.displayUrl}
                  alt=""
                  className="size-full object-cover"
                  initial={{ opacity: 0, scale: 1.15 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1.8, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </div>
          ) : (
            <motion.img
              src="/images/gate-bg.png"
              alt=""
              className="size-full object-cover opacity-70"
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 2.4 }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        </div>

        <div className="mx-auto w-full max-w-[1800px] px-5 pb-14 md:px-12">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xs tracking-[0.5em] text-muted-foreground"
          >
            VRCHAT · MEMORIES
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 font-serif text-5xl font-semibold tracking-[0.08em] text-balance md:text-7xl"
          >
            溪棠的照片墙
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-4 max-w-xl leading-relaxed text-muted-foreground"
          >
            在虚拟世界里按下快门的每一刻，都被好好地收在这里。
          </motion.p>
          <motion.dl
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.75 }}
            className="mt-10 flex flex-wrap gap-x-10 gap-y-4"
          >
            {statItems.map((s) => (
              <button key={s.label} type="button" onClick={() => onNavigate(s.go)} className="group text-left">
                <dt className="text-xs tracking-[0.25em] text-muted-foreground">{s.label}</dt>
                <dd className="font-serif text-3xl font-semibold tabular-nums transition group-hover:text-primary md:text-4xl">
                  {s.value ?? '—'}
                </dd>
              </button>
            ))}
          </motion.dl>
          {role === 'admin' && !stats?.images && !stats?.videos && (
            <button
              type="button"
              onClick={onUpload}
              className="mt-10 flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:scale-[1.02]"
            >
              <Upload className="size-4" aria-hidden />
              上传第一批照片
            </button>
          )}
        </div>
      </section>

      {!!recent?.length && (
        <section className="mx-auto max-w-[1800px] px-3 pt-10 md:px-8" aria-labelledby="recent-title">
          <SectionTitle id="recent-title" title="最近的回忆" action="查看全部" onAction={() => onNavigate('daily')} />
          <Masonry photos={recent} tileSize={tileSize} onOpen={setOpenIndex} />
        </section>
      )}

      <section className="mx-auto max-w-[1800px] px-3 pt-20 md:px-8" aria-labelledby="months-title">
        <SectionTitle id="months-title" title="月份墙" action="全部月份" onAction={() => onNavigate('daily')} />
        <MonthWall kind="image" onOpen={onOpenMonth} limit={8} />
      </section>

      <AnimatePresence>
        {openIndex !== null && recent?.[openIndex] && (
          <Lightbox
            photos={recent}
            index={openIndex}
            role={role}
            onIndexChange={setOpenIndex}
            onClose={() => setOpenIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export function SectionTitle({
  id,
  title,
  subtitle,
  action,
  onAction,
}: {
  id?: string
  title: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 px-1">
      <div>
        <h2 id={id} className="font-serif text-2xl font-semibold tracking-wide md:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="group flex items-center gap-1 text-sm text-muted-foreground transition hover:text-primary"
        >
          {action}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
