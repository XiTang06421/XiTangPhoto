import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { photoId } = (await request.json()) as { photoId: number }
  const rows = await q<{ kind: string; month: string }>(
    'select kind, month from photos where id = $1 and deleted_at is null',
    [Number(photoId)],
  )
  if (!rows[0]) return badRequest('照片不存在')
  await q(
    `insert into month_covers (kind, month, photo_id) values ($1, $2, $3)
     on conflict (kind, month) do update set photo_id = excluded.photo_id`,
    [rows[0].kind, rows[0].month, Number(photoId)],
  )
  return NextResponse.json({ ok: true })
}
