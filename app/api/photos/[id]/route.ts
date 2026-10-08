import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const id = Number((await params).id)
  const body = (await request.json()) as { note?: string | null; favorite?: boolean; rotation?: number }
  if (!Number.isInteger(id)) return badRequest()
  if (typeof body.rotation === 'number') {
    const rotation = ((Math.round(body.rotation / 90) * 90) % 360 + 360) % 360
    await q('update photos set rotation = $2 where id = $1', [id, rotation])
  }
  if ('note' in body) {
    const note = String(body.note ?? '').slice(0, 2000).trim()
    await q('update photos set note = $2 where id = $1', [id, note || null])
  }
  if (typeof body.favorite === 'boolean') {
    await q(
      `update photos set favorite = $2, favorited_at = case when $2 then now() else null end
       where id = $1 and deleted_at is null`,
      [id, body.favorite],
    )
  }
  return NextResponse.json({ ok: true })
}
