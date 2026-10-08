'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import useSWRImmutable from 'swr/immutable'
import { enqueueFiles } from '@/lib/upload-queue'
import type { Role, Section } from '@/lib/types'
import { FeedbackLayer } from '../ui/feedback'
import { FavoritesWall } from './favorites-wall'
import { Guestbook } from './guestbook'
import { HomeSection } from './home-section'
import { Maintenance } from './maintenance'
import { MediaSection } from './media-section'
import { MusicPlayer } from './music-player'
import { SideRail } from './side-rail'
import { TopNav } from './top-nav'
import { UploadPanel } from './upload-panel'

const recordVisit = (url: string) => fetch(url, { method: 'POST', credentials: 'same-origin' }).then(() => true)

export function GalleryApp({ initialRole }: { initialRole: Role }) {
  const [role, setRole] = useState<Role>(initialRole)
  const [section, setSection] = useState<Section>('home')
  const [month, setMonth] = useState<string | null>(null)
  const [tileSize, setTileSize] = useState(300)
  const [selecting, setSelecting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useSWRImmutable(`/api/visit?r=${role}`, recordVisit)

  function navigate(next: Section) {
    setSection(next)
    setMonth(null)
    setSelecting(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function changeRole(next: Role) {
    setRole(next)
    if (next !== 'admin') {
      setSelecting(false)
      if (section === 'maintenance') setSection('home')
    }
  }

  function openMonth(m: string, target: Section = section === 'videos' ? 'videos' : 'daily') {
    setSection(target)
    setMonth(m)
    setSelecting(false)
    window.scrollTo({ top: 0 })
  }

  const openUpload = () => fileInput.current?.click()
  const kind = section === 'videos' ? 'video' : 'image'
  const showRail = section === 'home' || section === 'daily' || section === 'videos'

  return (
    <div className="min-h-dvh">
      <TopNav role={role} section={section} onNavigate={navigate} onRoleChange={changeRole} onUpload={openUpload} />

      {showRail && (
        <SideRail
          role={role}
          kind={kind}
          currentMonth={month}
          tileSize={tileSize}
          onTileSize={setTileSize}
          selecting={selecting}
          onToggleSelecting={() => {
            if (!month) {
              setSelecting(false)
              return
            }
            setSelecting((v) => !v)
          }}
          onJump={(m) => openMonth(m, section === 'videos' ? 'videos' : 'daily')}
          onFavorites={() => navigate('favorites')}
          onUpload={openUpload}
        />
      )}

      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${section}-${month ?? ''}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {section === 'home' && (
              <HomeSection
                role={role}
                tileSize={tileSize}
                onNavigate={navigate}
                onOpenMonth={(m) => openMonth(m, 'daily')}
                onUpload={openUpload}
              />
            )}
            {(section === 'daily' || section === 'videos') && (
              <MediaSection
                kind={kind}
                role={role}
                month={month}
                tileSize={tileSize}
                selecting={selecting}
                setSelecting={setSelecting}
                onOpenMonth={(m) => openMonth(m)}
                onBack={() => setMonth(null)}
                onUpload={openUpload}
              />
            )}
            {section === 'favorites' && <FavoritesWall role={role} />}
            {section === 'guestbook' && <Guestbook role={role} />}
            {section === 'maintenance' && role === 'admin' && <Maintenance />}
          </motion.div>
        </AnimatePresence>
      </main>

      {role === 'admin' && (
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files?.length) enqueueFiles(e.target.files)
            e.target.value = ''
          }}
        />
      )}

      <UploadPanel />
      <MusicPlayer role={role} />
      <FeedbackLayer />
    </div>
  )
}
