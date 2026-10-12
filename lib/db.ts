import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { __xtPool?: Pool }

function normalizeDatabaseUrl(value: string | undefined) {
  if (!value) return value
  return value
}

function createPool() {
  const p = new Pool({
    connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
    max: 6,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    keepAlive: true,
  })
  p.on('error', (err) => console.error('[db] idle client error:', err.message))
  return p
}

export const pool = globalForPg.__xtPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForPg.__xtPool = pool

const TRANSIENT = /terminated|ECONNRESET|ETIMEDOUT|EPIPE|timeout|Connection ended|closed/i

const OLD_DOMAIN =
  'my-life-vrc-album-2026-1502260260.cos.ap-guangzhou.myqcloud.com'
const NEW_DOMAIN =
  'pub-263ebd43a32643e796e16d4f2dd1a1b4.r2.dev'

function replaceDomain(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.split(OLD_DOMAIN).join(NEW_DOMAIN)
}

function replaceRowUrls<T>(row: T): T {
  if (row === null || typeof row !== 'object') return row

  const source = row as Record<string, unknown>
  let next: Record<string, unknown> | undefined

  const urlKeys = [
    'original_url',
    'display_url',
    'thumb_url',
    'originalUrl',
    'displayUrl',
    'thumbUrl',
  ] as const

  for (const key of urlKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue

    const current = source[key]
    const replaced = replaceDomain(current)

    if (replaced !== current) {
      if (!next) next = { ...source }
      next[key] = replaced
    }
  }

  return (next ?? row) as T
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await pool.query(text, params)
      return result.rows.map((row) => replaceRowUrls(row as T)) as T[]
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt >= 2 || !TRANSIENT.test(message)) throw err
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1) * (attempt + 1)))
    }
  }
}

export const PHOTO_COLUMNS = `
  id,
  original_url as "originalUrl",
  display_url as "displayUrl",
  thumb_url as "thumbUrl",
  width, height, size, duration,
  taken_at as "takenAt", note, favorite, rotation,
  deleted_at as "deletedAt",
  private
`
