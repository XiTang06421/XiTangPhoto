'use client'

import { motion } from 'motion/react'
import { CopyX, Download, Loader2, RotateCcw, ShieldCheck, Trash2, Users, Layers } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, formatTaken, refreshGallery } from '@/lib/client'
import type { SimilarGroup } from '@/lib/similar'
import type { Photo, Visitor } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'

type Tab = 'trash' | 'similar' | 'visitors'
const DAY = 86_400_000

export function Maintenance() {
  const [tab, setTab] = useState<Tab>('trash')
  const tabs: { id: Tab; label: string; icon: typeof Trash2 }[] = [
    { id: 'trash', label: '回收站', icon: Trash2 },
    { id: 'similar', label: '相似照片', icon: Layers },
    { id: 'visitors', label: '访客记录', icon: Users },
  ]

  async function cleanDuplicates() {
    const ok = await confirmAction({
      title: '一键清理重复照片？',
      description: '几乎完全相同的照片只保留画质最好的一张，其余移入回收站（30 天内可恢复，收藏照片不受影响）。',
      confirmText: '开始清理',
    })
    if (!ok) return
    const { affected } = await api<{ affected: number }>('/api/maintenance/similar', 'POST')
    toast(affected ? `已清理 ${affected} 张重复照片` : '没有发现重复照片')
    refreshGallery()
  }

  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-40 pt-12 md:px-8" aria-labelledby="mt-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="mt-title" className="font-serif text-2xl font-semibold tracking-wide md:text-3xl">
            维护
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            收藏的照片受保护：不会进入回收站，也不会被任何清理删除
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/backup"
          download
          className="flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition hover:bg-secondary"
          title="导出全部原图链接、SHA-256 校验值与备注，可用于离线备份或迁移"
        >
          <Download className="size-4" aria-hidden />
          导出备份清单
        </a>
        <button
          type="button"
          onClick={cleanDuplicates}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:scale-[1.02]"
        >
          <CopyX className="size-4" aria-hidden />
          一键清理重复照片
        </button>
        </div>
      </div>

      <div className="mt-8 flex w-fit rounded-full bg-secondary p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition ${tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab === t.id && <motion.span layoutId="mt-tab" className="absolute inset-0 rounded-full bg-primary" />}
            <t.icon className="relative size-4" aria-hidden />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === 'trash' && <TrashPanel />}
        {tab === 'similar' && <SimilarPanel />}
        {tab === 'visitors' && <VisitorsPanel />}
      </div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed py-20 text-center text-sm text-muted-foreground">{children}</p>
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="加载中" />
    </div>
  )
}

function TrashPanel() {
  const { data, isLoading } = useSWR<Photo[]>('/api/trash', fetcher)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const list = data ?? []

  async function run(action: 'restore' | 'purge' | 'purgeAll', ids: number[]) {
    if (action !== 'restore') {
      const ok = await confirmAction({
        title: action === 'purgeAll' ? '清空回收站？' : `彻底删除 ${ids.length} 项？`,
        description: '彻底删除后原图、压缩图和缩略图都会从云端移除，无法恢复。',
        danger: true,
        confirmText: '彻底删除',
      })
      if (!ok) return
    }
    const { affected } = await api<{ affected: number }>('/api/photos/batch', 'POST', { action, ids })
    toast(action === 'restore' ? `已恢复 ${affected} 项` : `已彻底删除 ${affected} 项`)
    setSelected(new Set())
    refreshGallery()
  }

  if (isLoading && !data) return <Loading />
  if (!list.length) return <Empty>回收站是空的。删除的照片会在这里保留 30 天。</Empty>

  const ids = Array.from(selected)
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          共 {list.length} 项 · 超过 30 天自动清理{ids.length ? ` · 已选 ${ids.length}` : ''}
        </p>
        <button
          type="button"
          onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((p) => p.id)))}
          className="rounded-full border px-4 py-1.5 text-sm hover:bg-secondary"
        >
          {selected.size === list.length ? '取消全选' : '全选'}
        </button>
        <button
          type="button"
          disabled={!ids.length}
          onClick={() => run('restore', ids)}
          className="flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm hover:bg-secondary disabled:opacity-40"
        >
          <RotateCcw className="size-4" aria-hidden />
          恢复
        </button>
        <button
          type="button"
          disabled={!ids.length}
          onClick={() => run('purge', ids)}
          className="rounded-full border border-destructive/40 px-4 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          彻底删除
        </button>
        <button
          type="button"
          onClick={() => run('purgeAll', [])}
          className="rounded-full bg-destructive/15 px-4 py-1.5 text-sm text-destructive hover:bg-destructive/25"
        >
          清空回收站
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {list.map((p) => {
          const left = Math.max(0, 30 - Math.floor((Date.now() - new Date(p.deletedAt!).getTime()) / DAY))
          const on = selected.has(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(selected)
                  if (on) next.delete(p.id)
                  else next.add(p.id)
                  setSelected(next)
                }}
                className={`group relative block aspect-square w-full overflow-hidden rounded-lg ring-2 transition ${on ? 'ring-primary' : 'ring-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="" loading="lazy" className={`size-full object-cover transition ${on ? 'scale-95 opacity-80' : 'opacity-60 group-hover:opacity-90'}`} />
                <span className="glass absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px]">剩 {left} 天</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SimilarPanel() {
  const [threshold, setThreshold] = useState(8)
  const { data, isLoading, mutate } = useSWR<SimilarGroup[]>(`/api/maintenance/similar?threshold=${threshold}`, fetcher, {
    revalidateOnFocus: false,
  })
  const groups = data ?? []
  const recommended = groups.flatMap((g) => g.items.filter((i) => i.recommendDelete && !i.favorite).map((i) => i.id))

  async function trash(ids: number[]) {
    if (!ids.length) return
    const ok = await confirmAction({
      title: `将 ${ids.length} 张照片移入回收站？`,
      description: '30 天内可在回收站恢复。收藏照片会被自动跳过。',
      confirmText: '移入回收站',
    })
    if (!ok) return
    const { affected } = await api<{ affected: number }>('/api/photos/batch', 'POST', { action: 'trash', ids })
    toast(`已移入回收站 ${affected} 张`)
    mutate()
    refreshGallery()
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          相似度阈值
          <input
            type="range"
            min={2}
            max={14}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="range w-40"
            style={{ '--fill': `${((threshold - 2) / 12) * 100}%` } as React.CSSProperties}
          />
          <span className="w-16 text-foreground">{threshold <= 4 ? '几乎相同' : threshold <= 9 ? '非常相似' : '比较相似'}</span>
        </label>
        <button
          type="button"
          disabled={!recommended.length}
          onClick={() => trash(recommended)}
          className="ml-auto rounded-full bg-primary/15 px-4 py-2 text-sm text-primary hover:bg-primary/25 disabled:opacity-40"
        >
          删除全部推荐项（{recommended.length}）
        </button>
      </div>

      {isLoading && !data ? (
        <Loading />
      ) : !groups.length ? (
        <Empty>没有发现相似的照片，相册很干净。</Empty>
      ) : (
        <ul className="flex flex-col gap-5">
          {groups.map((g) => (
            <li key={g.keepId} className="rounded-2xl border bg-card p-4">
              <p className="mb-3 text-sm text-muted-foreground">{g.items.length} 张相似照片 · 推荐保留画质最好的一张</p>
              <div className="thin-scroll flex gap-3 overflow-x-auto pb-1">
                {g.items.map((item) => (
                  <figure key={item.id} className="w-40 shrink-0">
                    <div className={`relative overflow-hidden rounded-lg ring-2 ${item.recommendDelete ? 'ring-destructive/60' : 'ring-primary'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      <span
                        className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${item.recommendDelete ? 'bg-destructive text-primary-foreground' : 'bg-primary text-primary-foreground'}`}
                      >
                        {item.favorite ? '已收藏' : item.recommendDelete ? '建议删除' : '保留'}
                      </span>
                    </div>
                    <figcaption className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {item.width}×{item.height}
                      </span>
                      {!item.favorite && (
                        <button type="button" onClick={() => trash([item.id])} className="text-destructive hover:underline">
                          删除
                        </button>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VisitorsPanel() {
  const { data, isLoading } = useSWR<Visitor[]>('/api/visitors', fetcher)
  if (isLoading && !data) return <Loading />
  if (!data?.length) return <Empty>还没有访问记录。</Empty>
  const total = data.reduce((s, v) => s + v.visits, 0)

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {data.length} 台设备 · 累计 {total} 次进入
      </p>
      <div className="thin-scroll overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">设备</th>
              <th className="px-4 py-3 font-medium">身份</th>
              <th className="px-4 py-3 font-medium">次数</th>
              <th className="px-4 py-3 font-medium">最近进入</th>
              <th className="px-4 py-3 font-medium">首次进入</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.deviceId} className="border-t">
                <td className="px-4 py-3">{v.device ?? '未知设备'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${v.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {v.role === 'admin' ? '管理员' : '访客'}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{v.visits}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatTaken(v.lastSeen)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatTaken(v.firstSeen)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{v.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
