import { list } from '@vercel/blob'
import COS from 'cos-nodejs-sdk-v5'
import pg from 'pg'

const bucket = process.env.TENCENT_COS_BUCKET
const region = (process.env.TENCENT_COS_REGION || '').match(/ap-[a-z0-9-]+/i)?.[0] || process.env.TENCENT_COS_REGION
const sourceToken = process.env.BLOB_READ_WRITE_TOKEN
if (!bucket || !region || !process.env.TENCENT_COS_SECRET_ID || !process.env.TENCENT_COS_SECRET_KEY || !sourceToken) {
  throw new Error('缺少旧 Blob 或腾讯 COS 环境变量')
}

const cos = new COS({ SecretId: process.env.TENCENT_COS_SECRET_ID, SecretKey: process.env.TENCENT_COS_SECRET_KEY })
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const publicUrl = (key) => `https://${bucket}.cos.${region}.myqcloud.com/${key.split('/').map(encodeURIComponent).join('/')}`
const put = (key, body, contentType) => new Promise((resolve, reject) => cos.putObject({ Bucket: bucket, Region: region, Key: key, Body: body, ContentType: contentType || 'application/octet-stream', CacheControl: 'public, max-age=31536000, immutable', StorageClass: 'STANDARD' }, (e) => e ? reject(e) : resolve()))
const head = (key) => new Promise((resolve, reject) => cos.headObject({ Bucket: bucket, Region: region, Key: key }, (e, d) => e ? reject(e) : resolve(d)))

async function migrateBlob(blob) {
  const key = blob.pathname
  try {
    const existing = await head(key)
    if (Number(existing?.headers?.['content-length'] || existing?.['Content-Length'] || -1) === blob.size) return 'exists'
  } catch {}
  const sourceUrl = blob.downloadUrl || blob.url
  const response = await fetch(sourceUrl, {
    headers: {
      Authorization: `Bearer ${sourceToken}`,
      'x-vercel-blob-token': sourceToken,
    },
  })
  if (!response.ok) throw new Error(`下载失败 ${response.status}：${sourceUrl}`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length !== blob.size) throw new Error(`文件大小校验失败：${body.length}/${blob.size}`)
  await put(key, body, blob.contentType)
  return 'uploaded'
}

const replacements = new Map()
let cursor
let count = 0
let bytes = 0
try {
  do {
    const page = await list({ cursor, limit: 1000 })
    cursor = page.hasMore ? page.cursor : undefined
    for (const blob of page.blobs) {
      const result = await migrateBlob(blob)
      replacements.set(blob.url, publicUrl(blob.pathname))
      count++
      bytes += blob.size
      console.log(`${result} ${count} ${(bytes / 1024 ** 3).toFixed(2)} GB ${blob.pathname}`)
    }
  } while (cursor)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [oldUrl, newUrl] of replacements) {
      await client.query('UPDATE photos SET original_url = $1 WHERE original_url = $2', [newUrl, oldUrl])
      await client.query('UPDATE photos SET display_url = $1 WHERE display_url = $2', [newUrl, oldUrl])
      await client.query('UPDATE photos SET thumb_url = $1 WHERE thumb_url = $2', [newUrl, oldUrl])
      await client.query('UPDATE messages SET image_url = $1 WHERE image_url = $2', [newUrl, oldUrl])
      await client.query('UPDATE tracks SET url = $1 WHERE url = $2', [newUrl, oldUrl])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  console.log(`MIGRATION_OK ${count} files ${(bytes / 1024 ** 3).toFixed(2)} GB; database URLs updated`)
} finally {
  await pool.end()
}
