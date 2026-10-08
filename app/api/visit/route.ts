import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { cookieOptions, DEVICE_COOKIE, getRole, unauthorized } from '@/lib/auth'
import { purgeExpiredTrash } from '@/lib/cleanup'
import { q } from '@/lib/db'

function describeDevice(ua: string) {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '未知系统'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /MicroMessenger/.test(ua)
        ? '微信'
        : /QQ\//.test(ua)
          ? 'QQ'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : '浏览器'
  return `${os} · ${browser}`
}

export async function POST(request: NextRequest) {
  const role = await getRole()
  if (!role) return unauthorized()
  const existing = request.cookies.get(DEVICE_COOKIE)?.value
  const deviceId = existing ?? crypto.randomUUID()
  const ua = request.headers.get('user-agent') ?? ''
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  await q(
    `insert into visitors (device_id, role, device, user_agent, ip)
     values ($1, $2, $3, $4, $5)
     on conflict (device_id) do update set
       visits = visitors.visits + 1, last_seen = now(), role = excluded.role,
       device = excluded.device, user_agent = excluded.user_agent, ip = excluded.ip`,
    [deviceId, role, describeDevice(ua), ua.slice(0, 400), ip],
  )
  purgeExpiredTrash().catch((e) => console.error('auto purge failed', e))
  const response = NextResponse.json({ ok: true })
  if (!existing) {
    response.cookies.set(DEVICE_COOKIE, deviceId, { ...cookieOptions, maxAge: 60 * 60 * 24 * 365 * 3 })
  }
  return response
}
