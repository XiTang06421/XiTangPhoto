import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

// 接受 R2（*.r2.dev）与腾讯云 COS（*.myqcloud.com）两种文件域名
const STORAGE_URL_RE = /^https:\/\/[^/]+\.(?:r2\.dev|myqcloud\.com)\//

export async function GET() {
  if (!(await getRole())) return unauthorized()
  return NextResponse.json(await q('select id, title, artist, url from tracks order by id'))
}

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { title, artist, url } = (await request.json()) as { title: string; artist?: string; url: string }
  if (!STORAGE_URL_RE.test(url ?? '')) return badRequest()
  const name = String(title ?? '').trim().slice(0, 120)
  if (!name) return badRequest('歌名不能为空')
  const [row] = await q(
    'insert into tracks (title, artist, url) values ($1, $2, $3) returning id, title, artist, url',
    [name, String(artist ?? '').trim().slice(0, 80) || null, url],
  )
  return NextResponse.json(row)
}
