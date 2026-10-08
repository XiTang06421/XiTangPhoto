'use client'

import { Upload } from 'lucide-react'
import type { MediaKind, Role } from '@/lib/types'
import { AlbumView } from './album-view'
import { SectionTitle } from './home-section'
import { MonthWall } from './month-wall'

export function MediaSection({
  kind,
  role,
  month,
  tileSize,
  selecting,
  setSelecting,
  onOpenMonth,
  onBack,
  onUpload,
}: {
  kind: MediaKind
  role: Role
  month: string | null
  tileSize: number
  selecting: boolean
  setSelecting: (v: boolean) => void
  onOpenMonth: (month: string) => void
  onBack: () => void
  onUpload: () => void
}) {
  if (month) {
    return (
      <AlbumView
        kind={kind}
        month={month}
        role={role}
        tileSize={tileSize}
        selecting={selecting}
        setSelecting={setSelecting}
        onBack={onBack}
      />
    )
  }

  const isVideo = kind === 'video'
  return (
    <section className="mx-auto max-w-[1800px] px-3 pb-32 pt-12 md:px-8" aria-labelledby="media-title">
      <SectionTitle
        id="media-title"
        title={isVideo ? '录像' : '日常'}
        subtitle={isVideo ? '每一段录像，按拍摄年月自动归档' : '每个月一张代表图，点开进入当月相册'}
      />
      <MonthWall
        kind={kind}
        onOpen={onOpenMonth}
        emptyAction={
          role === 'admin' ? (
            <button
              type="button"
              onClick={onUpload}
              className="mt-6 flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:scale-[1.02]"
            >
              <Upload className="size-4" aria-hidden />
              {isVideo ? '上传录像' : '上传照片'}
            </button>
          ) : undefined
        }
      />
    </section>
  )
}
