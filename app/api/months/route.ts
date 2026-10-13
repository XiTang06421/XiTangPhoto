import { NextResponse, type NextRequest } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'
import { normalizeImageUrl } from '@/lib/cos'

export async function GET(request: NextRequest) {
  if (!(await getRole())) return unauthorized()
  const kind = request.nextUrl.searchParams.get('kind') === 'video' ? 'video' : 'image'
  const rows = await q(
    `with m as (
       select month, count(*)::int as count from photos
       where deleted_at is null and kind = $1 group by month
     )
     select m.month, m.count,
       coalesce(cp.id, lp.id) as "coverId",
       coalesce(cp.thumb_url, lp.thumb_url) as thumb,
       coalesce(cp.width, lp.width) as width,
       coalesce(cp.height, lp.height) as height
     from m
     left join month_covers mc on mc.kind = $1 and mc.month = m.month
     left join photos cp on cp.id = mc.photo_id and cp.deleted_at is null and cp.month = m.month
     left join lateral (
       select id, thumb_url, width, height from photos p
       where p.month = m.month and p.kind = $1 and p.deleted_at is null
       order by p.favorite desc, p.taken_at desc limit 1
     ) lp on true
     order by m.month desc`,
    [kind],
  )
  return NextResponse.json(rows.map((r) => ({ ...r, thumb: normalizeImageUrl(r.thumb) })))
}
