import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { purgeAllTrash, purgePhotos } from '@/lib/cleanup'
import { q } from '@/lib/db'

type Action = 'trash' | 'restore' | 'purge' | 'purgeAll' | 'favorite' | 'unfavorite' | 'move'

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { action, ids: rawIds, month } = (await request.json()) as {
    action: Action
    ids?: number[]
    month?: string
  }
  const ids = (rawIds ?? []).map(Number).filter(Number.isInteger).slice(0, 5000)
  let affected = 0
  let skipped = 0

  switch (action) {
    case 'trash': {
      const rows = await q(
        `update photos set deleted_at = now()
         where id = any($1::int[]) and deleted_at is null and favorite = false returning id`,
        [ids],
      )
      affected = rows.length
      const [{ count }] = await q<{ count: number }>(
        'select count(*)::int as count from photos where id = any($1::int[]) and favorite',
        [ids],
      )
      skipped = count
      break
    }
    case 'restore': {
      affected = (await q('update photos set deleted_at = null where id = any($1::int[]) returning id', [ids])).length
      break
    }
    case 'purge':
      affected = await purgePhotos(ids)
      break
    case 'purgeAll':
      affected = await purgeAllTrash()
      break
    case 'favorite':
    case 'unfavorite': {
      const fav = action === 'favorite'
      affected = (
        await q(
          `update photos set favorite = $2, favorited_at = case when $2 then now() else null end
           where id = any($1::int[]) and deleted_at is null and favorite <> $2 returning id`,
          [ids, fav],
        )
      ).length
      break
    }
    case 'move': {
      if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return badRequest('月份无效')
      affected = (
        await q('update photos set month = $2 where id = any($1::int[]) and deleted_at is null returning id', [
          ids,
          month,
        ])
      ).length
      break
    }
    default:
      return badRequest()
  }
  return NextResponse.json({ affected, skipped })
}
