import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { __xtPool?: Pool }

function createPool() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 6,
    // Neon closes idle connections server-side; drop ours first so we never reuse a dead socket.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    keepAlive: true,
  })
  // An idle client dying must not crash the process; the pool replaces it on next use.
  p.on('error', (err) => console.error('[db] idle client error:', err.message))
  return p
}

export const pool = globalForPg.__xtPool ?? createPool()

if (process.env.NODE_ENV !== 'production') globalForPg.__xtPool = pool

const TRANSIENT = /terminated|ECONNRESET|ETIMEDOUT|EPIPE|timeout|Connection ended|closed/i

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await pool.query(text, params)
      return result.rows as T[]
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt >= 2 || !TRANSIENT.test(message)) throw err
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
    }
  }
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
