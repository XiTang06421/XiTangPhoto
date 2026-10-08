import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { cookieOptions, createSessionToken, DEVICE_COOKIE, matchRole, SESSION_COOKIE } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string }
  const role = await matchRole(String(password ?? '').trim())
  if (!role) {
    await new Promise((r) => setTimeout(r, 400))
    return NextResponse.json({ error: '密码不正确' }, { status: 401 })
  }
  const response = NextResponse.json({ role })
  response.cookies.set(SESSION_COOKIE, await createSessionToken(role), cookieOptions)
  if (!request.cookies.get(DEVICE_COOKIE)) {
    response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 365 * 3,
    })
  }
  return response
}
