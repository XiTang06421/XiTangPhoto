import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { normalizeImageUrl } from '@/lib/cos'
import { q } from '@/lib/db'

const COLUMNS = `id, nickname, is_admin as "isAdmin", kind, body, image_url as "imageUrl",
  image_width as "imageWidth", image_height as "imageHeight", created_at as "createdAt"`

// 接受 R2（*.r2.dev）与腾讯云 COS（*.myqcloud.com）两种文件域名
const STORAGE_URL_RE = /^https:\/\/[^/]+\.(?:r2\.dev|myqcloud\.com)\//

export async function GET(request: NextRequest) {
  if (!(await getRole())) return unauthorized()
  const before = Number(request.nextUrl.searchParams.get('before')) || 2147483647
  const rows = await q(`select ${COLUMNS} from messages where id < $1 order by id desc limit 20`, [before])
  return NextResponse.json(
    rows.map((row) => ({ ...row, imageUrl: normalizeImageUrl(row.imageUrl) })),
  )
}

export async function POST(request: NextRequest) {
  const role = await getRole()
  if (!role) return unauthorized()
  const b = (await request.json()) as {
    nickname?: string
    kind: 'text' | 'drawing' | 'image'
    body?: string
    imageUrl?: string
    imageWidth?: number
    imageHeight?: number
  }
  const kind = ['text', 'drawing', 'image'].includes(b.kind) ? b.kind : 'text'
  const body = String(b.body ?? '').trim().slice(0, 2000)
  const imageUrl =
    typeof b.imageUrl === 'string' && STORAGE_URL_RE.test(b.imageUrl) ? b.imageUrl : null
  if (kind === 'text' && !body) return badRequest('写点什么吧')
  if (kind !== 'text' && !imageUrl) return badRequest('图片缺失')
  const nickname = String(b.nickname ?? '').trim().slice(0, 24) || null
  const [row] = await q(
    `insert into messages (nickname, is_admin, kind, body, image_url, image_width, image_height)
     values ($1,$2,$3,$4,$5,$6,$7) returning ${COLUMNS}`,
    [
      nickname,
      role === 'admin',
      kind,
      body || null,
      imageUrl,
      Math.round(b.imageWidth ?? 0) || null,
      Math.round(b.imageHeight ?? 0) || null,
    ],
  )
  return NextResponse.json(row)
}
