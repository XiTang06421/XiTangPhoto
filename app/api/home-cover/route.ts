import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { PHOTO_COLUMNS, q } from '@/lib/db'
import type { Photo } from '@/lib/types'

export async function GET() {
  const role = await getRole()
  if (!role) return unauthorized()
  const visibility = role === 'admin' ? '' : ' and private = false'
  const rows = await q<Photo>(
    `select ${PHOTO_COLUMNS} from photos
     where id = (select nullif(value, '')::int from settings where key = 'home_cover')
       and deleted_at is null and kind = 'image'${visibility}`,
  )
  return NextResponse.json({ photo: rows[0] ?? null })
}

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { photoId } = (await request.json()) as { photoId: number | null }
  if (photoId !== null && !Number.isInteger(Number(photoId))) {
    return NextResponse.json({ error: '照片不存在' }, { status: 400 })
  }
  await q(
    "insert into settings (key, value) values ('home_cover', $1) on conflict (key) do update set value = excluded.value",
    [photoId === null ? '' : String(photoId)],
  )
  return NextResponse.json({ ok: true })
}
