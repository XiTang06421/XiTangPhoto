import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'
import { findSimilarGroups } from '@/lib/similar'

export async function GET(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const threshold = Math.min(16, Math.max(0, Number(request.nextUrl.searchParams.get('threshold') ?? 8)))
  return NextResponse.json(await findSimilarGroups(threshold))
}

/** One-click duplicate cleanup: near-identical images (distance ≤ 3) go to the trash, favorites excluded. */
export async function POST() {
  if ((await getRole()) !== 'admin') return unauthorized()
  const groups = await findSimilarGroups(3)
  const ids = groups.flatMap((g) => g.items.filter((i) => i.recommendDelete).map((i) => i.id))
  if (!ids.length) return NextResponse.json({ affected: 0 })
  const rows = await q(
    `update photos set deleted_at = now()
     where id = any($1::int[]) and favorite = false and deleted_at is null returning id`,
    [ids],
  )
  return NextResponse.json({ affected: rows.length })
}
