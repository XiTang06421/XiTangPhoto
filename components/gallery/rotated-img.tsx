/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react'
import type { Photo } from '@/lib/types'

export function normRotation(deg: number) {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360
}

export function isQuarterTurn(deg: number) {
  return normRotation(deg) % 180 === 90
}

export function orientedSize(photo: Pick<Photo, 'width' | 'height' | 'rotation'>) {
  const w = Math.max(1, photo.width || 1)
  const h = Math.max(1, photo.height || 1)
  return isQuarterTurn(photo.rotation ?? 0) ? { w: h, h: w } : { w, h }
}

export function RotatedImg({
  rotation = 0,
  box,
  className = '',
  style,
  alt = '',
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { rotation?: number; box?: { w: number; h: number } }) {
  const r = normRotation(rotation)
  const quarter = r % 180 === 90
  // Without a fixed box, the parent must set `container-type: size` so cqw/cqh track it while it animates.
  const width = box ? (quarter ? box.h : box.w) : quarter ? '100cqh' : '100cqw'
  const height = box ? (quarter ? box.w : box.h) : quarter ? '100cqw' : '100cqh'
  return (
    <img
      {...props}
      alt={alt}
      draggable={false}
      className={`absolute left-1/2 top-1/2 max-w-none ${className}`}
      style={{
        ...style,
        width,
        height,
        transform: `translate(-50%, -50%) rotate(${r}deg)`,
      }}
    />
  )
}
