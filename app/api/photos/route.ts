import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { PHOTO_COLUMNS, q } from '@/lib/db'

export async function GET(request: NextRequest) {
  if (!(await getRole())) return unauthorized()
  const params = request.nextUrl.searchParams
  const role = await getRole()
  const visibility = role === 'admin' ? '' : ' and private = false'
  if (params.get('favorites')) {
    return NextResponse.json(
      await q(
        `select ${PHOTO_COLUMNS} from photos where favorite and deleted_at is null${visibility}
         order by favorited_at desc nulls last, taken_at desc`,
      ),
    )
  }
  const recent = Number(params.get('recent'))
  if (recent) {
    return NextResponse.json(
      await q(
        `select ${PHOTO_COLUMNS} from photos where kind = 'image' and deleted_at is null${visibility}
         order by taken_at desc limit $1`,
        [Math.min(recent, 60)],
      ),
    )
  }
  const kind = params.get('kind') === 'video' ? 'video' : 'image'
  const month = params.get('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest()
  return NextResponse.json(
    await q(
      `select ${PHOTO_COLUMNS} from photos where kind = $1 and month = $2 and deleted_at is null${visibility}
       order by taken_at desc, id desc`,
      [kind, month],
    ),
  )
}

type NewPhoto = {
  hash: string
  phash: string | null
  kind: 'image' | 'video'
  originalUrl: string
  displayUrl: string
  thumbUrl: string
  width: number
  height: number
  size: number
  duration: number | null
  takenAt: string
  private?: boolean
}

function isCosUrl(url: unknown) {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.myqcloud.com')
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const p = (await request.json()) as NewPhoto
  if (
    !/^[a-f0-9]{64}$/.test(p.hash) ||
    !isCosUrl(p.originalUrl) ||
    !isCosUrl(p.displayUrl) ||
    !isCosUrl(p.thumbUrl) ||
    !(p.width > 0 && p.height > 0)
  ) {
    return badRequest()
  }
  const takenAt = new Date(p.takenAt)
  if (Number.isNaN(takenAt.getTime())) return badRequest('拍摄时间无效')
  const month = String((p as unknown as { month?: string }).month ?? '')
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest('月份无效')
  const rows = await q<{ id: number }>(
    `insert into photos (hash, phash, kind, original_url, display_url, thumb_url, width, height, size, duration, taken_at, month, private)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (hash) do nothing returning id`,
    [
      p.hash,
      p.phash && /^[a-f0-9]{16}$/.test(p.phash) ? p.phash : null,
      p.kind === 'video' ? 'video' : 'image',
      p.originalUrl,
      p.displayUrl,
      p.thumbUrl,
      Math.round(p.width),
      Math.round(p.height),
      Math.round(p.size || 0),
      p.duration ?? null,
      takenAt.toISOString(),
      month,
      Boolean(p.private),
    ],
  )
  return NextResponse.json({ id: rows[0]?.id ?? null, duplicate: !rows[0] })
}
