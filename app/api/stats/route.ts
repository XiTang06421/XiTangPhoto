import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function GET() {
  if (!(await getRole())) return unauthorized()
  const [row] = await q(
    `select
       (select count(*)::int from photos where deleted_at is null and kind = 'image') as images,
       (select count(*)::int from photos where deleted_at is null and kind = 'video') as videos,
       (select count(*)::int from photos where deleted_at is null and favorite) as favorites,
       (select count(distinct month)::int from photos where deleted_at is null) as months,
       (select count(*)::int from messages) as messages`,
  )
  return NextResponse.json(row)
}
