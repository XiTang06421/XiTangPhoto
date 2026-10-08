import { del } from '@vercel/blob'
import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const id = Number((await params).id)
  const rows = await q<{ url: string }>('delete from tracks where id = $1 returning url', [id])
  if (rows[0]?.url) await del(rows[0].url).catch(() => {})
  return NextResponse.json({ ok: true })
}
