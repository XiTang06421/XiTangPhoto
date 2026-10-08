import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function GET() {
  const rows = await q<{ photo_id: number | null }>("select nullif(value, '')::int as photo_id from settings where key = 'home_cover'")
  return NextResponse.json({ photoId: rows[0]?.photo_id ?? null })
}

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { photoId } = (await request.json()) as { photoId: number }
  if (!Number.isInteger(Number(photoId))) return NextResponse.json({ error: '照片不存在' }, { status: 400 })
  await q("insert into settings (key, value) values ('home_cover', $1) on conflict (key) do update set value = excluded.value", [String(photoId)])
  return NextResponse.json({ ok: true })
}
