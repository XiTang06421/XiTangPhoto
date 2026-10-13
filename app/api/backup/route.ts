import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { normalizePhotoRow } from '@/lib/cos'
import { q } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if ((await getRole()) !== 'admin') return unauthorized()

  const photos = (await q(
    `SELECT id, hash, kind, original_url, display_url, thumb_url, width, height, size, duration,
            taken_at, month, note, favorite, favorited_at, deleted_at, created_at
       FROM photos ORDER BY taken_at ASC, id ASC`,
  )).map(normalizePhotoRow)
  const covers = await q(`SELECT * FROM month_covers`).catch(() => [])

  const manifest = {
    app: '溪棠的照片墙',
    version: 1,
    exportedAt: new Date().toISOString(),
    note: 'original_url 为未经压缩的原图；hash 为原图 SHA-256，可用于校验文件完整性。',
    totals: {
      files: photos.length,
      bytes: photos.reduce((sum, p) => sum + Number(p.size ?? 0), 0),
    },
    photos,
    covers,
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="xitang-backup-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
