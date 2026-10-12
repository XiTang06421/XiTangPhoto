import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'

const R2_PUBLIC_URL = 'https://pub-263ebd43a32643e796e16d4f2dd1a1b4.r2.dev'

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const endpoint = process.env.R2_ENDPOINT
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function cosRegion() { return 'auto' }
export function cosClient() { return r2Client() }

// 直接返回公共URL，不用签名
export function cosUrl(key: string) {
  return `${R2_PUBLIC_URL}/${key}`
}

export async function cosPut(key: string, body: Buffer | Uint8Array, contentType: string) {
  await r2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return cosUrl(key)
}

export async function cosDelete(urls: string[]) {
  const keys = urls.map((url) => {
    try { return new URL(url).pathname.slice(1) } catch { return url }
  }).filter(Boolean)
  if (!keys.length) return
  await r2Client().send(new DeleteObjectsCommand({
    Bucket: process.env.R2_BUCKET,
    Delete: { Objects: keys.map(Key => ({ Key })) }
  }))
}
