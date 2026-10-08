import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { __xtPool?: Pool }

export const pool =
  globalForPg.__xtPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 6 })

if (process.env.NODE_ENV !== 'production') globalForPg.__xtPool = pool

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

export const PHOTO_COLUMNS = `
  id, kind,
  original_url as "originalUrl",
  display_url as "displayUrl",
  thumb_url as "thumbUrl",
  width, height, size::float8 as size, duration,
  taken_at as "takenAt", month, note, favorite,
  deleted_at as "deletedAt"
`
