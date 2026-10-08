import { list, del } from '@vercel/blob'

if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('缺少 BLOB_READ_WRITE_TOKEN')

let cursor
let total = 0
let bytes = 0
const urls = []
do {
  const page = await list({ cursor, limit: 1000 })
  urls.push(...page.blobs.map((blob) => blob.url))
  total += page.blobs.length
  bytes += page.blobs.reduce((sum, blob) => sum + blob.size, 0)
  cursor = page.hasMore ? page.cursor : undefined
} while (cursor)

for (let i = 0; i < urls.length; i += 200) {
  await del(urls.slice(i, i + 200))
  console.log(`deleted ${Math.min(i + 200, urls.length)}/${urls.length}`)
}

console.log(`LEGACY_BLOB_DELETED ${total} files ${(bytes / 1024 ** 3).toFixed(2)} GB`)
