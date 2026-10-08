'use client'

import { AnimatePresence, motion } from 'motion/react'
import { KeyRound, Link2, LogOut, Repeat, Settings, ShieldCheck, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '@/lib/client'
import type { Role } from '@/lib/types'
import { toast } from '../ui/feedback'
import { Modal } from '../ui/modal'

const inputCls =
  'w-full rounded-xl border bg-background/60 px-4 py-2.5 text-sm outline-none transition focus:border-primary/60'

export function SettingsMenu({ role, onRoleChange }: { role: Role; onRoleChange: (r: Role) => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const target: Role = role === 'admin' ? 'visitor' : 'admin'

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  async function logout() {
    await api('/api/auth/logout', 'POST')
    router.refresh()
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.origin)
    toast('链接已复制，朋友打开后需输入访客密码')
    setOpen(false)
  }

  const item =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-secondary'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="设置"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground"
      >
        <Settings className={`size-4 transition-transform duration-500 ${open ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-12 z-50 w-60 origin-top-right rounded-2xl border bg-popover p-2 shadow-2xl"
          >
            <div className="mb-1 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              {role === 'admin' ? (
                <ShieldCheck className="size-4 text-primary" aria-hidden />
              ) : (
                <User className="size-4" aria-hidden />
              )}
              当前身份：<span className="text-foreground">{role === 'admin' ? '管理员' : '访客'}</span>
            </div>
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false)
                setSwitchOpen(true)
              }}
            >
              <Repeat className="size-4 text-muted-foreground" aria-hidden />
              切换为{target === 'admin' ? '管理员' : '访客'}
            </button>
            {role === 'admin' && (
              <button
                type="button"
                className={item}
                onClick={() => {
                  setOpen(false)
                  setPwOpen(true)
                }}
              >
                <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                修改密码
              </button>
            )}
            <button type="button" className={item} onClick={copyLink}>
              <Link2 className="size-4 text-muted-foreground" aria-hidden />
              复制分享链接
            </button>
            <div className="my-1 h-px bg-border" />
            <button type="button" className={`${item} text-destructive`} onClick={logout}>
              <LogOut className="size-4" aria-hidden />
              退出
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <SwitchRoleModal
        open={switchOpen}
        target={target}
        onClose={() => setSwitchOpen(false)}
        onSwitched={(r) => {
          setSwitchOpen(false)
          onRoleChange(r)
          toast(`已切换为${r === 'admin' ? '管理员' : '访客'}`)
        }}
      />
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

function SwitchRoleModal({
  open,
  target,
  onClose,
  onSwitched,
}: {
  open: boolean
  target: Role
  onClose: () => void
  onSwitched: (r: Role) => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError('')
    }
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { role } = await api<{ role: Role }>('/api/auth/login', 'POST', { password })
      if (role !== target) throw new Error(`这不是${target === 'admin' ? '管理员' : '访客'}密码`)
      onSwitched(role)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const label = target === 'admin' ? '管理员' : '访客'
  return (
    <Modal open={open} onClose={onClose} title={`切换为${label}`} description={`请输入${label}密码`} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="switch-pw" className="sr-only">
          {label}密码
        </label>
        <input
          id="switch-pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder={`${label}密码`}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!password || loading}
          className="mt-2 rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
        >
          {loading ? '验证中…' : '确认切换'}
        </button>
      </form>
    </Modal>
  )
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [target, setTarget] = useState<Role>('visitor')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setPw('')
      setPw2('')
      setError('')
    }
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw !== pw2) return setError('两次输入不一致')
    setLoading(true)
    setError('')
    try {
      await api('/api/auth/password', 'POST', { target, password: pw })
      toast(`${target === 'admin' ? '管理员' : '访客'}密码已更新`)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="修改密码" description="修改后，对应身份需使用新密码进入" size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1" role="radiogroup" aria-label="修改对象">
          {(['visitor', 'admin'] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={target === r}
              onClick={() => setTarget(r)}
              className={`rounded-full py-1.5 text-sm transition ${
                target === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {r === 'admin' ? '管理员密码' : '访客密码'}
            </button>
          ))}
        </div>
        <input
          type="password"
          aria-label="新密码"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={inputCls}
          placeholder="新密码（至少 4 位）"
        />
        <input
          type="password"
          aria-label="确认新密码"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={inputCls}
          placeholder="再次输入新密码"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!pw || !pw2 || loading}
          className="mt-2 rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
        >
          {loading ? '保存中…' : '保存'}
        </button>
      </form>
    </Modal>
  )
}
