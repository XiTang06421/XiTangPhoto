.import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const endpoint = process.env.R2_ENDPOINT
  if (!accessKeyId || !secretAccessKey || !endpoint || !process.env.R2_BUCKET) {
    throw new Error('R2 \u914d\u7f6e\u4e0d\u5b8c\u6574')
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function cosRegion() {
  return 'auto'
}

export function cosClient() {
  return r2Client()
}

export async function cosDelete(urls: string[]) {
  const keys = urls.map((url) => {
    try {
      const path = new URL(url).pathname.replace(/^\//, '')
      return path ? { Key: decodeURIComponent(path) } : null
    } catch {
      return null
    }
  }).filter((key): key is { Key: string } => Boolean(key))
  if (!keys.length) return
  await r2Client().send(new DeleteObjectsCommand({
    Bucket: process.env.R2_BUCKET!,
    Delete: { Objects: keys },
  }))
}

export async function cosList(cursor?: string) {
  const data = await r2Client().send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET!,
    MaxKeys: 1000,
    ContinuationToken: cursor,
  }))
  return {
    Contents: (data.Contents || []).map((obj) => ({ Key: obj.Key || '', Size: obj.Size || 0 })),
    IsTruncated: data.IsTruncated,
    NextMarker: data.NextContinuationToken,
    NextContinuationToken: data.NextContinuationToken,
  }
}

export function cosUrl(key: string) {
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  return `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function cosPut(key: string, body: Buffer, contentType: string) {
  await r2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
}

export function cosTestConfig() {
  return Boolean(
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_ENDPOINT
  )
}
