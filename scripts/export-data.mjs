// Usage: node scripts/export-data.mjs <outDir> [--dry]
// Requires DATABASE_URL and BLOB_READ_WRITE_TOKEN in the environment.
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { list } from '@vercel/blob'

const outDir = process.argv[2] || './export'
const dry = process.argv.includes('--dry')
const TABLES = ['photos', 'month_covers', 'settings', 'messages', 'tracks', 'visitors']

async function exportDb() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    for (const t of TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      console.log(`db  ${t}: ${rows.length} rows`)
      if (!dry) {
        await mkdir(join(outDir, 'db'), { recursive: true })
        await writeFile(join(outDir, 'db', `${t}.json`), JSON.stringify(rows, null, 1))
      }
    }
  } finally {
    await pool.end()
  }
}

async function exists(path, size) {
  try {
    return (await stat(path)).size === size
  } catch {
    return false
  }
}

async function exportFiles() {
  const manifest = {}
  let cursor
  let count = 0
  let bytes = 0
  do {
    const page = await list({ cursor, limit: 1000 })
    const blobs = page.blobs
    cursor = page.hasMore ? page.cursor : undefined
    for (let i = 0; i < blobs.length; i += 8) {
      await Promise.all(
        blobs.slice(i, i + 8).map(async (b) => {
          manifest[b.url] = b.pathname
          count++
          bytes += b.size
          if (dry) return
          const dest = join(outDir, 'files', b.pathname)
          if (await exists(dest, b.size)) return
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const res = await fetch(b.downloadUrl || b.url)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              await mkdir(dirname(dest), { recursive: true })
              await writeFile(dest, Buffer.from(await res.arrayBuffer()))
              return
            } catch (e) {
              if (attempt === 3) console.error(`FAILED ${b.pathname}: ${e.message}`)
            }
          }
        }),
      )
      process.stdout.write(`\rfiles ${count} (${(bytes / 1024 ** 3).toFixed(2)} GB)`)
    }
  } while (cursor)
  console.log('')
  if (!dry) await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
}

await exportDb()
await exportFiles()
console.log(dry ? 'dry run finished' : `export finished -> ${outDir}`)
