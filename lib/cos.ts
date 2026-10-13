import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// R2 公共访问地址（如已配置 R2_PUBLIC_URL 环境变量则优先使用，否则用默认桶地址）
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-263ebd43a32643e796e16d4f2dd1a1b4.r2.dev').replace(/\/+$/, '')

// 历史遗留：数据库中部分照片/图片 URL 曾被写成腾讯云 COS 域名（文件实际在 R2）。
// 返回给前端前统一把 COS 地址映射回 R2 公共地址，路径保持不变。
const COS_HOST = 'my-life-vrc-album-2026-1502260260.cos.ap-guangzhou.myqcloud.com'

export function normalizeImageUrl(value: unknown): unknown {
  if (typeof value !== 'string' || !value.includes(COS_HOST)) return value
  return value.replace(`https://${COS_HOST}`, R2_PUBLIC_URL)
}

export function normalizePhotoRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['originalUrl', 'displayUrl', 'thumbUrl', 'original_url', 'display_url', 'thumb_url']) {
    if (row[key] !== undefined && row[key] !== null) row[key] = normalizeImageUrl(row[key])
  }
  return row
}

// 从任意格式的 R2_ENDPOINT 中提取账号级端点：https://<accountid>.r2.cloudflarestorage.com
// 兼容历史错误配置（例如把桶名当子域、或端点被拼了两次）
function normalizeEndpoint(raw: string | undefined): string {
  if (!raw) return ''
  const match = raw.match(/([0-9a-f]{32})\.r2\.cloudflarestorage\.com/i)
  return match ? `https://${match[1]}.r2.cloudflarestorage.com` : raw.replace(/\/+$/, '')
}

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey || !process.env.R2_ENDPOINT || !process.env.R2_BUCKET) {
    throw new Error('R2 配置不完整')
  }
  return new S3Client({
    region: 'auto',
    endpoint: normalizeEndpoint(process.env.R2_ENDPOINT),
    forcePathStyle: true,
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
  const keys = urls
    .map((url) => {
      try {
        const path = new URL(url).pathname.replace(/^\//, '')
        return path ? { Key: decodeURIComponent(path) } : null
      } catch {
        return null
      }
    })
    .filter((key): key is { Key: string } => Boolean(key))
  if (!keys.length) return
  await r2Client().send(
    new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET!,
      Delete: { Objects: keys },
    }),
  )
}

export async function cosList(cursor?: string) {
  const data = await r2Client().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET!,
      MaxKeys: 1000,
      ContinuationToken: cursor,
    }),
  )
  return {
    Contents: (data.Contents || []).map((obj) => ({ Key: obj.Key || '', Size: obj.Size || 0 })),
    IsTruncated: data.IsTruncated,
    NextMarker: data.NextContinuationToken,
    NextContinuationToken: data.NextContinuationToken,
  }
}

export function cosUrl(key: string) {
  return `${R2_PUBLIC_URL}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function cosPut(key: string, body: Buffer, contentType: string) {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

export function cosTestConfig() {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_ENDPOINT,
  )
}
