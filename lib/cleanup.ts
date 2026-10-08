import { del } from '@vercel/blob'
import { q } from './db'

type UrlRow = { id: number; original_url: string; display_url: string; thumb_url: string }

async function deleteBlobs(rows: UrlRow[]) {
  const urls = Array.from(new Set(rows.flatMap((r) => [r.original_url, r.display_url, r.thumb_url])))
  for (let i = 0; i < urls.length; i += 200) {
    try {
      await del(urls.slice(i, i + 200))
    } catch (error) {
      console.error('blob delete failed', error)
    }
  }
}

/** Permanently removes trashed, non-favorite photos. Favorites are never purged. */
export async function purgePhotos(ids: number[]) {
  if (!ids.length) return 0
  const rows = await q<UrlRow>(
    `delete from photos where id = any($1::int[]) and deleted_at is not null and favorite = false
     returning id, original_url, display_url, thumb_url`,
    [ids],
  )
  await q('delete from month_covers where photo_id = any($1::int[])', [rows.map((r) => r.id)])
  await deleteBlobs(rows)
  return rows.length
}

export async function purgeExpiredTrash() {
  const rows = await q<{ id: number }>(
    `select id from photos where deleted_at is not null and favorite = false
     and deleted_at < now() - interval '30 days' limit 500`,
  )
  return purgePhotos(rows.map((r) => r.id))
}

export async function purgeAllTrash() {
  const rows = await q<{ id: number }>(
    'select id from photos where deleted_at is not null and favorite = false',
  )
  return purgePhotos(rows.map((r) => r.id))
}
