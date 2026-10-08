import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { hashes } = (await request.json()) as { hashes: string[] }
  const list = (hashes ?? []).filter((h) => /^[a-f0-9]{64}$/.test(h)).slice(0, 1000)
  const rows = await q<{ hash: string; deleted: boolean }>(
    'select hash, deleted_at is not null as deleted from photos where hash = any($1::text[])',
    [list],
  )
  return NextResponse.json(rows)
}
