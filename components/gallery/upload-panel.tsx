'use client'

import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, CheckCircle2, ChevronDown, CopyX, Loader2, RotateCw, X } from 'lucide-react'
import { useState } from 'react'
import { clearUploadHistory, clearFinished, retryAllFailed, retryUpload, useUploadQueue, type UploadItem } from '@/lib/upload-queue'
import { DraggableDock } from '../ui/draggable-dock'

const STATUS_LABEL: Record<UploadItem['status'], string> = {
  queued: '排队中',
  hashing: '识别内容',
  ready: '等待上传',
  processing: '生成预览',
  uploading: '上传中',
  done: '完成',
  skipped: '已跳过',
  error: '失败',
}

export function UploadPanel() {
  const items = useUploadQueue()
  const [collapsed, setCollapsed] = useState(false)
  if (!items.length) return null

  const done = items.filter((i) => i.status === 'done').length
  const skipped = items.filter((i) => i.status === 'skipped').length
  const failed = items.filter((i) => i.status === 'error').length
  const finished = done + skipped + failed
  const running = finished < items.length
  const overall = items.reduce((s, i) => s + (i.status === 'error' ? 1 : i.progress), 0) / items.length

  return (
    <DraggableDock storageKey="xt-dock-upload" defaultPos={{ h: 'right', v: 'bottom', x: 88, y: 24 }} label="上传面板">
      {(_anchor, grip) => (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[min(92vw,360px)] overflow-hidden rounded-2xl border bg-popover shadow-2xl"
      aria-label="上传进度"
    >
      <header className="flex items-center gap-3 py-3 pl-2 pr-4">
        {grip}
        {running ? (
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        ) : failed ? (
          <AlertCircle className="size-4 text-destructive" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 text-primary" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {running ? `正在上传 ${finished}/${items.length}` : '上传完成'}
          </p>
          <p className="text-xs text-muted-foreground">
            成功 {done} · 跳过重复 {skipped}
            {failed ? <span className="text-destructive"> · 失败 {failed}</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '展开' : '收起'}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-4 transition ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        {!running && (
          <button type="button" onClick={clearFinished} aria-label="关闭" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </header>
      <div className="h-0.5 bg-secondary">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${overall * 100}%` }} />
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              {failed > 0 && (
                <button
                  type="button"
                  onClick={retryAllFailed}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <RotateCw className="size-3.5" aria-hidden />
                  重试失败项
                </button>
              )}
              {finished > 0 && (
                <button
                  type="button"
                  onClick={() => clearUploadHistory()}
                  className="flex-1 rounded-lg py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  清除已结束记录
                </button>
              )}
            </div>
            <ul className="thin-scroll max-h-72 overflow-y-auto py-1">
              {items
                .slice()
                .sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error'))
                .slice(0, 300)
                .map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-2 text-xs ${item.status === 'error' ? 'bg-destructive/10' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${item.status === 'error' ? 'text-destructive' : ''}`}>{item.name}</p>
                      {['uploading', 'processing', 'hashing'].includes(item.status) ? (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${item.progress * 100}%` }} />
                        </div>
                      ) : (
                        <p className={item.status === 'error' ? 'text-destructive/80' : 'text-muted-foreground'}>
                          {item.message ?? STATUS_LABEL[item.status]}
                        </p>
                      )}
                    </div>
                    {item.status === 'error' ? (
                      <button
                        type="button"
                        onClick={() => retryUpload(item.id)}
                        className="flex items-center gap-1 rounded-full border border-destructive/50 px-2 py-0.5 text-destructive hover:bg-destructive/15"
                      >
                        <RotateCw className="size-3" aria-hidden />
                        重试
                      </button>
                    ) : item.status === 'skipped' ? (
                      <CopyX className="size-4 text-muted-foreground" aria-label="已跳过" />
                    ) : item.status === 'done' ? (
                      <CheckCircle2 className="size-4 text-primary" aria-label="完成" />
                    ) : (
                      <span className="tabular-nums text-muted-foreground">
                        {item.status === 'queued' || item.status === 'ready' ? '等待' : `${Math.round(item.progress * 100)}%`}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
      )}
    </DraggableDock>
  )
}
