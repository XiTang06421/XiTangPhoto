'use client'

import { motion } from 'motion/react'
import { Upload } from 'lucide-react'
import { useStats } from '@/lib/client'
import type { Role, Section } from '@/lib/types'
import { SettingsMenu } from './settings-menu'

const SECTIONS: { id: Section; label: string; adminOnly?: boolean }[] = [
  { id: 'home', label: '首页' },
  { id: 'daily', label: '日常' },
  { id: 'favorites', label: '收藏' },
  { id: 'videos', label: '录像' },
  { id: 'guestbook', label: '留言板' },
  { id: 'maintenance', label: '维护', adminOnly: true },
]

export function TopNav({
  role,
  section,
  onNavigate,
  onRoleChange,
  onUpload,
}: {
  role: Role
  section: Section
  onNavigate: (s: Section) => void
  onRoleChange: (r: Role) => void
  onUpload: () => void
}) {
  const { data: stats } = useStats()
  const counts: Partial<Record<Section, number | undefined>> = {
    daily: stats?.images,
    favorites: stats?.favorites,
    videos: stats?.videos,
    guestbook: stats?.messages,
  }

  return (
    <header className="glass sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-4 px-4 md:px-8">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 font-serif text-sm font-bold text-primary ring-1 ring-primary/30">
            棠
          </span>
          <span className="hidden font-serif text-lg font-semibold tracking-wider sm:inline">溪棠的照片墙</span>
        </button>

        <nav aria-label="板块" className="scrollbar-none mx-auto flex min-w-0 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {SECTIONS.filter((s) => !s.adminOnly || role === 'admin').map((s) => {
              const active = section === s.id
              const count = counts[s.id]
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(s.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition ${
                      active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-primary"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative">{s.label}</span>
                    {typeof count === 'number' && count > 0 && (
                      <span className={`relative text-[11px] tabular-nums ${active ? 'opacity-70' : 'opacity-60'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {role === 'admin' && (
            <button
              type="button"
              onClick={onUpload}
              className="hidden items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition hover:border-primary/50 hover:text-primary md:flex"
            >
              <Upload className="size-4" aria-hidden />
              上传
            </button>
          )}
          <SettingsMenu role={role} onRoleChange={onRoleChange} />
        </div>
      </div>
    </header>
  )
}
