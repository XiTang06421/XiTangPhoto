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

/**
 * All auth settings are loaded in a single query and kept in memory, so verifying a
 * session on every request costs no database round-trip on a warm instance.
 * The short TTL lets password changes made on another instance take effect quickly.
 */
const SETTINGS_TTL = 20_000
let settingsCache: { values: Map<string, string>; at: number } | null = null
let settingsLoading: Promise<Map<string, string>> | null = null

async function loadSettings(force = false) {
  if (!force && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL) return settingsCache.values
  if (settingsLoading) return settingsLoading
  settingsLoading = q<{ key: string; value: string }>(
    `select key, value from settings where key in ('secret','pw_admin','pw_visitor','pwv_admin','pwv_visitor')`,
  )
    .then((rows) => {
      const values = new Map(rows.map((r) => [r.key, r.value]))
      settingsCache = { values, at: Date.now() }
      return values
    })
    .finally(() => {
      settingsLoading = null
    })
  return settingsLoading
}

async function setSetting(key: string, value: string) {
  await q(
    'insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
    [key, value],
  )
  settingsCache?.values.set(key, value)
}

async function getOrInitSetting(key: string, init: () => string | Promise<string>) {
  const existing = (await loadSettings()).get(key)
  if (existing) return existing
  await q('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, await init()])
  return (await loadSettings(true)).get(key) as string
}

function getSecret() {
  return getOrInitSetting('secret', () => crypto.randomBytes(32).toString('hex'))
}

function scrypt(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${(await scrypt(password, salt)).toString('hex')}`
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = await scrypt(password, salt)
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
  const [adminHash, visitorHash] = await Promise.all([getPasswordHash('admin'), getPasswordHash('visitor')])
  const [isAdmin, isVisitor] = await Promise.all([
    verifyPassword(password, adminHash),
    verifyPassword(password, visitorHash),
  ])
  return isAdmin ? 'admin' : isVisitor ? 'visitor' : null
}

export async function passwordInUse(password: string, exceptRole: Role) {
  const other: Role = exceptRole === 'admin' ? 'visitor' : 'admin'
  return verifyPassword(password, await getPasswordHash(other))
}

export async function changePassword(role: Role, password: string) {
  await setSetting(`pw_${role}`, await hashPassword(password))
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
