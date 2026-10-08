import { NextResponse } from 'next/server'
import { cookieOptions, SESSION_COOKIE } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  return response
}
