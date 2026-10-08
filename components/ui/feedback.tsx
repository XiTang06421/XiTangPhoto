'use client'

import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Modal } from './modal'

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' }
type Confirm = {
  title: string
  description?: string
  confirmText?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

let toasts: Toast[] = []
let confirmState: Confirm | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function toast(message: string, tone: Toast['tone'] = 'success') {
  const id = Date.now() + Math.random()
  toasts = [...toasts, { id, message, tone }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 3200)
}

export function confirmAction(options: Omit<Confirm, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    confirmState = { ...options, resolve }
    emit()
  })
}

function closeConfirm(ok: boolean) {
  confirmState?.resolve(ok)
  confirmState = null
  emit()
}

export function FeedbackLayer() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts)
  const confirm = useSyncExternalStore(subscribe, () => confirmState, () => confirmState)

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-5 z-[200] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        <AnimatePresence>
          {list.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="glass pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-2xl"
            >
              {t.tone === 'success' && <CheckCircle2 className="size-4 text-primary" aria-hidden />}
              {t.tone === 'error' && <AlertTriangle className="size-4 text-destructive" aria-hidden />}
              {t.tone === 'info' && <Info className="size-4 text-accent" aria-hidden />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Modal open={!!confirm} onClose={() => closeConfirm(false)} title={confirm?.title ?? ''} size="sm">
        {confirm?.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{confirm.description}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => closeConfirm(false)}
            className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => closeConfirm(true)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              confirm?.danger
                ? 'bg-destructive text-white hover:opacity-90'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {confirm?.confirmText ?? '确定'}
          </button>
        </div>
      </Modal>
    </>
  )
}
