import { cosDelete } from '@/lib/cos'
import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const id = Number((await params).id)
  const rows = await q<{ image_url: string | null }>('delete from messages where id = $1 returning image_url', [id])
  if (rows[0]?.image_url) await cosDelete([rows[0].image_url]).catch(() => {})
  return NextResponse.json({ ok: true })
}
