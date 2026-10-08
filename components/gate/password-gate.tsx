'use client'

import { motion } from 'motion/react'
import { ArrowRight, Loader2, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function PasswordGate() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim() || loading) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.refresh()
      return
    }
    setLoading(false)
    setError(
    res.status === 401
      ? ((await res.json().catch(() => ({}))).error ?? '密码不正确')
      : '服务器正在唤醒，请稍后再试一次',
  )
    setShakeKey((k) => k + 1)
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <motion.img
        src="/images/gate-bg.png"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        initial={{ scale: 1.12, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-background" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.65)_100%)]" aria-hidden />

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <p className="mb-4 text-xs tracking-[0.5em] text-white/60">VRCHAT · MEMORIES</p>
        <h1 className="font-serif text-4xl font-semibold tracking-[0.12em] text-white text-balance md:text-5xl">
          溪棠的照片墙
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/65">这里收着每一次相遇与每一束光</p>

        <form
          key={shakeKey}
          onSubmit={onSubmit}
          className={`mt-10 w-full ${shakeKey ? 'animate-shake' : ''}`}
        >
          <label htmlFor="gate-password" className="sr-only">
            访问密码
          </label>
          <div className="glass flex items-center gap-2 rounded-full border border-white/15 p-1.5 pl-5 shadow-2xl">
            <Lock className="size-4 shrink-0 text-white/50" aria-hidden />
            <input
              id="gate-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="进入"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:opacity-70"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            </button>
          </div>
          <p className="mt-3 h-5 text-sm text-red-300" role="alert">
            {error}
          </p>
        </form>
      </motion.section>
    </main>
  )
}
