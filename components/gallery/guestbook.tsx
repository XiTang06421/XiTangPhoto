'use client'

import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, ImagePlus, Loader2, Palette, Send, Trash2, Type, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { api, fetcher, uploadToCos } from '@/lib/client'
import { readImageSize } from '@/lib/media'
import type { Message, Role } from '@/lib/types'
import { confirmAction, toast } from '../ui/feedback'
import { DrawingPad, type DrawingPadHandle } from './drawing-pad'

type Mode = 'text' | 'drawing' | 'image'
const PAGE = 20

export function Guestbook({ role }: { role: Role }) {
  const { data, size, setSize, isValidating, mutate } = useSWRInfinite<Message[]>(
    (index, prev) => {
      if (prev && prev.length < PAGE) return null
      if (index === 0) return '/api/messages'
      return `/api/messages?before=${prev![prev!.length - 1].id}`
    },
    fetcher,
    { revalidateFirstPage: false, revalidateOnFocus: false },
  )
  const messages = data?.flat() ?? []
  const reachedEnd = !!data && data[data.length - 1]?.length < PAGE
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isValidating && !reachedEnd) setSize(size + 1)
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isValidating, reachedEnd, size, setSize])

  async function remove(id: number) {
    const ok = await confirmAction({ title: '删除这条留言？', danger: true, confirmText: '删除' })
    if (!ok) return
    await api(`/api/messages/${id}`, 'DELETE')
    mutate((pages) => pages?.map((p) => p.filter((m) => m.id !== id)), { revalidate: false })
    toast('留言已删除')
  }

  return (
    <section className="mx-auto max-w-3xl px-4 pb-40 pt-12" aria-labelledby="gb-title">
      <h2 id="gb-title" className="font-serif text-2xl font-semibold tracking-wide md:text-3xl">
        留言板
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">写几句话、画一幅涂鸦，或者分享一张图。</p>

      <Composer role={role} onPosted={(m) => mutate((pages) => [[m, ...(pages?.[0] ?? [])], ...(pages?.slice(1) ?? [])], { revalidate: false })} />

      <ol className="mt-12 flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.li
              key={m.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.45, delay: Math.min(i % PAGE, 8) * 0.03 }}
            >
              <MessageCard message={m} canDelete={role === 'admin'} onDelete={() => remove(m.id)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      <div ref={sentinel} className="flex justify-center py-10 text-sm text-muted-foreground">
        {isValidating ? (
          <Loader2 className="size-5 animate-spin" aria-label="加载中" />
        ) : reachedEnd ? (
          messages.length ? '— 已经到底啦 —' : '还没有人留言，来做第一个吧'
        ) : null}
      </div>
    </section>
  )
}

function MessageCard({ message: m, canDelete, onDelete }: { message: Message; canDelete: boolean; onDelete: () => void }) {
  const when = new Date(m.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <article className={`group rounded-2xl border bg-card p-5 ${m.isAdmin ? 'ring-1 ring-primary/30' : ''}`}>
      <header className="flex items-center gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-sm ${m.isAdmin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
          aria-hidden
        >
          {(m.nickname ?? (m.isAdmin ? '溪' : '客')).slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{m.nickname ?? (m.isAdmin ? '溪棠' : '匿名访客')}</span>
            {m.isAdmin && (
              <span className="flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                <BadgeCheck className="size-3" aria-hidden />
                管理员
              </span>
            )}
          </p>
          <time dateTime={m.createdAt} className="text-xs text-muted-foreground">
            {when}
          </time>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="删除留言"
            className="rounded-full p-2 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </header>
      {m.body && <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
      {m.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.imageUrl}
          alt={m.kind === 'drawing' ? '涂鸦留言' : '图片留言'}
          loading="lazy"
          width={m.imageWidth ?? undefined}
          height={m.imageHeight ?? undefined}
          className="mt-3 max-h-[480px] w-auto max-w-full rounded-lg"
        />
      )}
    </article>
  )
}

function Composer({ role, onPosted }: { role: Role; onPosted: (m: Message) => void }) {
  const [mode, setMode] = useState<Mode>('text')
  const [nickname, setNickname] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pad = useRef<DrawingPadHandle>(null)

  useEffect(() => {
    setNickname(localStorage.getItem('xt-nickname') ?? '')
  }, [])

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function uploadImage(blob: Blob, name: string) {
    const size = await readImageSize(blob)
  const res = await uploadToCos(`messages/${name}`, blob)
  return { imageUrl: res.url, imageWidth: size.width, imageHeight: size.height }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      let payload: Record<string, unknown> = { kind: mode, body: text, nickname }
      if (mode === 'drawing') {
        if (pad.current?.isEmpty()) throw new Error('先画点什么吧')
        const blob = await pad.current!.toBlob()
        if (!blob) throw new Error('画板导出失败')
        payload = { ...payload, ...(await uploadImage(blob, `drawing-${Date.now()}.png`)) }
      } else if (mode === 'image') {
        if (!file) throw new Error('请选择一张图片')
        if (file.size > 15 * 1024 * 1024) throw new Error('图片不能超过 15MB')
        payload = { ...payload, ...(await uploadImage(file, `${Date.now()}-${file.name.replace(/[^\w.-]/g, '')}`)) }
      }
      const msg = await api<Message>('/api/messages', 'POST', payload)
      localStorage.setItem('xt-nickname', nickname)
      onPosted(msg)
      setText('')
      setFile(null)
      pad.current?.clear()
      toast('留言成功')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Mode; label: string; icon: typeof Type }[] = [
    { id: 'text', label: '文字', icon: Type },
    { id: 'drawing', label: '涂鸦', icon: Palette },
    { id: 'image', label: '图片', icon: ImagePlus },
  ]

  return (
    <form onSubmit={submit} className="mt-8 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-secondary p-1" role="tablist" aria-label="留言类型">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => setMode(t.id)}
              className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${mode === t.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {mode === t.id && (
                <motion.span layoutId="gb-tab" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <t.icon className="relative size-4" aria-hidden />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="sr-only">昵称（可选）</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            placeholder={role === 'admin' ? '溪棠' : '昵称（可选）'}
            className="w-36 rounded-full border bg-background px-3.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      <div className="mt-4">
        {mode === 'drawing' && <DrawingPad ref={pad} />}
        {mode === 'image' && (
          <div className="flex flex-col items-start gap-3">
            {preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="待发送的图片" className="max-h-72 rounded-lg" />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="移除图片"
                  className="glass absolute right-2 top-2 rounded-full p-1.5"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
                <ImagePlus className="size-6" aria-hidden />
                点击选择图片（最大 15MB）
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          rows={mode === 'text' ? 4 : 2}
          placeholder={mode === 'text' ? '想说点什么…' : '配一句话（可选）'}
          className={`w-full resize-none rounded-lg border bg-background px-4 py-3 leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring ${mode === 'text' ? '' : 'mt-3'}`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{text.length}/2000</span>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:scale-[1.02] disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          发布
        </button>
      </div>
    </form>
  )
}
