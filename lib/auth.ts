import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { q } from './db'

export type Role = 'admin' | 'visitor'

export const SESSION_COOKIE = 'xt_session'
export const DEVICE_COOKIE = 'xt_device'

const DEFAULT_PASSWORDS: Record<Role, string> = {
  visitor: 'xitang',
  admin: 'xitang-admin',
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: (process.env.NODE_ENV === 'development' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE,
}

async function getSetting(key: string) {
  const rows = await q<{ value: string }>('select value from settings where key = $1', [key])
  return rows[0]?.value ?? null
}

async function setSetting(key: string, value: string) {
  await q(
    'insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
    [key, value],
  )
}

async function getOrInitSetting(key: string, init: () => string) {
  const existing = await getSetting(key)
  if (existing) return existing
  await q('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, init()])
  return (await getSetting(key)) as string
}

let secretCache: string | null = null
async function getSecret() {
  if (secretCache) return secretCache
  secretCache = await getOrInitSetting('secret', () => crypto.randomBytes(32).toString('hex'))
  return secretCache
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

function getPasswordHash(role: Role) {
  return getOrInitSetting(`pw_${role}`, () => hashPassword(DEFAULT_PASSWORDS[role]))
}

function getPasswordVersion(role: Role) {
  return getOrInitSetting(`pwv_${role}`, () => '1')
}

export async function matchRole(password: string): Promise<Role | null> {
  if (!password) return null
  if (verifyPassword(password, await getPasswordHash('admin'))) return 'admin'
  if (verifyPassword(password, await getPasswordHash('visitor'))) return 'visitor'
  return null
}

export async function passwordInUse(password: string, exceptRole: Role) {
  const other: Role = exceptRole === 'admin' ? 'visitor' : 'admin'
  return verifyPassword(password, await getPasswordHash(other))
}

export async function changePassword(role: Role, password: string) {
  await setSetting(`pw_${role}`, hashPassword(password))
  const version = Number(await getPasswordVersion(role)) + 1
  await setSetting(`pwv_${role}`, String(version))
}

async function sign(payload: string) {
  return crypto.createHmac('sha256', await getSecret()).update(payload).digest('base64url')
}

export async function createSessionToken(role: Role) {
  const payload = `${role}.${await getPasswordVersion(role)}.${Date.now()}`
  return `${payload}.${await sign(payload)}`
}

export async function verifySessionToken(token: string | undefined): Promise<Role | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [role, version, issuedAt, signature] = parts
  if (role !== 'admin' && role !== 'visitor') return null
  const expected = await sign(`${role}.${version}.${issuedAt}`)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  if (Date.now() - Number(issuedAt) > SESSION_MAX_AGE * 1000) return null
  if (version !== (await getPasswordVersion(role))) return null
  return role
}

export async function getRole(): Promise<Role | null> {
  const store = await cookies()
  try {
    return await verifySessionToken(store.get(SESSION_COOKIE)?.value)
  } catch {
    return null
  }
}

export function unauthorized(message = '无权限') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function badRequest(message = '请求无效') {
  return NextResponse.json({ error: message }, { status: 400 })
}
