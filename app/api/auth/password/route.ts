import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest,
  changePassword,
  cookieOptions,
  createSessionToken,
  getRole,
  passwordInUse,
  SESSION_COOKIE,
  unauthorized,
  type Role,
} from '@/lib/auth'

export async function POST(request: NextRequest) {
  if ((await getRole()) !== 'admin') return unauthorized()
  const { target, password } = (await request.json()) as { target: Role; password: string }
  const value = String(password ?? '').trim()
  if (target !== 'admin' && target !== 'visitor') return badRequest()
  if (value.length < 4 || value.length > 64) return badRequest('密码长度需为 4-64 位')
  if (await passwordInUse(value, target)) return badRequest('访客密码与管理员密码不能相同')
  await changePassword(target, value)
  const response = NextResponse.json({ ok: true })
  if (target === 'admin') {
    response.cookies.set(SESSION_COOKIE, await createSessionToken('admin'), cookieOptions)
  }
  return response
}
