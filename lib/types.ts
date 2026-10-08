export type Role = 'admin' | 'visitor'
export type MediaKind = 'image' | 'video'

export type Photo = {
  id: number
  kind: MediaKind
  originalUrl: string
  displayUrl: string
  thumbUrl: string
  width: number
  height: number
  size: number
  duration: number | null
  takenAt: string
  month: string
  note: string | null
  favorite: boolean
  rotation: number
  deletedAt: string | null
  private: boolean
}

export type MonthSummary = {
  month: string
  count: number
  coverId: number | null
  thumb: string | null
  width: number | null
  height: number | null
}

export type Stats = {
  images: number
  videos: number
  favorites: number
  months: number
  messages: number
}

export type Message = {
  id: number
  nickname: string | null
  isAdmin: boolean
  kind: 'text' | 'drawing' | 'image'
  body: string | null
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  createdAt: string
}

export type Track = {
  id: number
  title: string
  artist: string | null
  url: string
}

export type Visitor = {
  deviceId: string
  role: Role
  device: string | null
  ip: string | null
  visits: number
  firstSeen: string
  lastSeen: string
}

export type Section = 'home' | 'daily' | 'favorites' | 'videos' | 'guestbook' | 'maintenance'
