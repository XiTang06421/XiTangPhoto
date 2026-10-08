'use client'

import { upload } from '@vercel/blob/client'
import { AnimatePresence, motion } from 'motion/react'
import {
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { api, fetcher, formatDuration } from '@/lib/client'
import type { Role, Track } from '@/lib/types'
import { DraggableDock } from '../ui/draggable-dock'
import { confirmAction, toast } from '../ui/feedback'

type PlayMode = 'sequence' | 'loop-one' | 'shuffle'
const MODES: { id: PlayMode; label: string; icon: typeof Repeat }[] = [
  { id: 'sequence', label: '顺序播放', icon: Repeat },
  { id: 'loop-one', label: '单曲循环', icon: Repeat1 },
  { id: 'shuffle', label: '随机播放', icon: Shuffle },
]

export function MusicPlayer({ role }: { role: Role }) {
  const { data: tracks, mutate } = useSWR<Track[]>('/api/tracks', fetcher, { revalidateOnFocus: false })
  const audio = useRef<HTMLAudioElement>(null)
  const volumeFill = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PlayMode>('shuffle')
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(false)
  const [query, setQuery] = useState('')
  const [time, setTime] = useState({ now: 0, total: 0 })
  const [adding, setAdding] = useState(false)
  const started = useRef(false)
  const list = tracks ?? []

  const play = useCallback((track: Track) => {
    const el = audio.current
    if (!el) return
    setCurrent(track)
    if (el.src !== track.url) el.src = track.url
    el.play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true))
  }, [])

  useEffect(() => {
    const saved = Number(localStorage.getItem('xt-volume'))
    const v = Number.isFinite(saved) && saved > 0 ? saved : 0.6
    setVolume(v)
    if (audio.current) audio.current.volume = v
  }, [])

  useEffect(() => {
    if (started.current || !list.length) return
    started.current = true
    play(list[Math.floor(Math.random() * list.length)])
  }, [list, play])

  useEffect(() => {
    if (!blocked) return
    const resume = () => {
      audio.current
        ?.play()
        .then(() => setBlocked(false))
        .catch(() => {})
    }
    // 'click' (not 'pointerdown') bubbles to window after the player's own button handler,
    // so pressing play while blocked doesn't start and then immediately pause the track.
    window.addEventListener('click', resume, { once: true })
    window.addEventListener('keydown', resume, { once: true })
    return () => {
      window.removeEventListener('click', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [blocked])

  useEffect(() => {
    if (audio.current) audio.current.loop = mode === 'loop-one'
  }, [mode])

  function step(dir: 1 | -1) {
    if (!list.length) return
    if (mode === 'shuffle' && list.length > 1) {
      let next = current
      while (next?.id === current?.id) next = list[Math.floor(Math.random() * list.length)]
      return play(next!)
    }
    const i = list.findIndex((t) => t.id === current?.id)
    play(list[(i + dir + list.length) % list.length])
  }

  function toggle() {
    const el = audio.current
    if (!el) return
    if (!current && list.length) return play(list[Math.floor(Math.random() * list.length)])
    if (el.paused || blocked) el.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
    else el.pause()
  }

  function onVolume(v: number) {
    if (audio.current) {
      audio.current.volume = v
      audio.current.muted = false
    }
    setMuted(false)
    setVolume(v)
  }

  function cycleMode() {
    const i = MODES.findIndex((m) => m.id === mode)
    const next = MODES[(i + 1) % MODES.length]
    setMode(next.id)
    toast(next.label, 'info')
  }

  async function addTracks(files: FileList) {
    setAdding(true)
    let ok = 0
    for (const file of Array.from(files)) {
      try {
        const res = await upload(`music/${file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '')}`, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          multipart: file.size > 20 * 1024 * 1024,
        })
        const base = file.name.replace(/\.[^.]+$/, '')
        const [artist, title] = base.includes(' - ') ? base.split(' - ', 2) : [null, base]
        await api('/api/tracks', 'POST', { title: title.trim(), artist: artist?.trim(), url: res.url })
        ok++
      } catch {
        toast(`${file.name} 添加失败`, 'error')
      }
    }
    setAdding(false)
    if (ok) toast(`已添加 ${ok} 首歌`)
    mutate()
  }

  async function removeTrack(t: Track) {
    const yes = await confirmAction({ title: `删除「${t.title}」？`, danger: true, confirmText: '删除' })
    if (!yes) return
    await api(`/api/tracks/${t.id}`, 'DELETE')
    if (current?.id === t.id) {
      audio.current?.pause()
      setCurrent(null)
    }
    mutate()
  }

  const filtered = query
    ? list.filter((t) => `${t.title} ${t.artist ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : list
  const ModeIcon = MODES.find((m) => m.id === mode)!.icon
  const progress = time.total ? (time.now / time.total) * 100 : 0
  const shownVolume = muted ? 0 : volume

  return (
    <>
      <audio
        ref={audio}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => mode !== 'loop-one' && step(1)}
        onTimeUpdate={(e) => setTime({ now: e.currentTarget.currentTime, total: e.currentTarget.duration || 0 })}
        onLoadedMetadata={(e) => setTime({ now: 0, total: e.currentTarget.duration || 0 })}
        onVolumeChange={(e) => localStorage.setItem('xt-volume', String(e.currentTarget.volume))}
      />

      <AnimatePresence>
        {blocked && current && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={toggle}
            className="glass fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-2xl"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            浏览器拦截了自动播放，点一下播放音乐
          </motion.button>
        )}
      </AnimatePresence>

      <DraggableDock storageKey="xt-dock-music" defaultPos={{ h: 'left', v: 'bottom', x: 16, y: 16 }} label="音乐播放器">
        {(anchor, grip) => (
      <div
        className={`flex gap-2 ${anchor.v === 'top' ? 'flex-col-reverse' : 'flex-col'} ${anchor.h === 'right' ? 'items-end' : 'items-start'}`}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="glass w-[min(92vw,340px)] overflow-hidden rounded-2xl border shadow-2xl"
              role="dialog"
              aria-label="音乐面板"
            >
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <ListMusic className="size-4 text-primary" aria-hidden />
                <p className="flex-1 text-sm font-medium">播放列表 · {list.length}</p>
                {role === 'admin' && (
                  <label className="flex cursor-pointer items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary hover:bg-primary/25">
                    {adding ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                    添加音乐
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      className="sr-only"
                      disabled={adding}
                      onChange={(e) => {
                        if (e.target.files?.length) addTracks(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="收起" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>

              <div className="px-4 pt-3">
                <label className="flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1.5">
                  <Search className="size-4 text-muted-foreground" aria-hidden />
                  <span className="sr-only">搜索歌曲</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索歌曲"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
              </div>

              <ul className="thin-scroll mt-2 max-h-64 overflow-y-auto px-2 pb-2">
                {!filtered.length && (
                  <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {list.length ? '没有匹配的歌曲' : role === 'admin' ? '还没有音乐，点右上角添加' : '还没有音乐'}
                  </li>
                )}
                {filtered.map((t) => {
                  const active = t.id === current?.id
                  return (
                    <li key={t.id} className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => play(t)}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-secondary/70 ${active ? 'text-primary' : ''}`}
                      >
                        {active && playing ? <Equalizer /> : <Music2 className="size-4 shrink-0 opacity-60" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{t.title}</span>
                          {t.artist && <span className="block truncate text-xs text-muted-foreground">{t.artist}</span>}
                        </span>
                      </button>
                      {role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => removeTrack(t)}
                          aria-label={`删除 ${t.title}`}
                          className="rounded-full p-2 text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="flex items-center gap-3 border-t px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    const v = muted || volume === 0 ? volume || 0.6 : volume
                    if (audio.current) audio.current.muted = !muted
                    setMuted(!muted)
                    setVolume(v)
                  }}
                  aria-label={muted ? '取消静音' : '静音'}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {shownVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <input
                  ref={volumeFill}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={shownVolume}
                  onInput={(e) => onVolume(Number(e.currentTarget.value))}
                  onChange={(e) => onVolume(Number(e.currentTarget.value))}
                  aria-label="音量"
                  className="range flex-1"
                  style={{ '--fill': `${shownVolume * 100}%` } as React.CSSProperties}
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{Math.round(shownVolume * 100)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass flex items-center gap-1 rounded-full border py-1.5 pl-1 pr-3 shadow-2xl">
          {grip}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="打开音乐面板"
            aria-expanded={open}
            className="relative flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary"
          >
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="16.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
              <circle
                cx="18"
                cy="18"
                r="16.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={103.7}
                strokeDashoffset={103.7 * (1 - progress / 100)}
                strokeLinecap="round"
              />
            </svg>
            <Music2 className={`size-4 ${playing ? 'animate-[spin_6s_linear_infinite]' : ''}`} />
          </button>
          <div className="hidden w-28 min-w-0 px-1 sm:block">
            <p className="truncate text-xs font-medium">{current?.title ?? '未播放'}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatDuration(time.now)} / {formatDuration(time.total)}
            </p>
          </div>
          <IconBtn label="上一首" onClick={() => step(-1)}>
            <SkipBack className="size-4" />
          </IconBtn>
          <IconBtn label={playing ? '暂停' : '播放'} onClick={toggle} primary>
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </IconBtn>
          <IconBtn label="下一首" onClick={() => step(1)}>
            <SkipForward className="size-4" />
          </IconBtn>
          <IconBtn label={`播放模式：${MODES.find((m) => m.id === mode)!.label}`} onClick={cycleMode}>
            <ModeIcon className="size-4" />
          </IconBtn>
        </div>
      </div>
        )}
      </DraggableDock>
    </>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  primary,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-8 items-center justify-center rounded-full transition ${primary ? 'bg-foreground text-background hover:scale-105' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

function Equalizer() {
  return (
    <span className="flex h-4 w-4 shrink-0 items-end justify-between" aria-hidden>
      {[0, 0.2, 0.4].map((d) => (
        <motion.span
          key={d}
          className="w-[3px] rounded-full bg-primary"
          animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: d }}
        />
      ))}
    </span>
  )
}
