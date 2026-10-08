import COS from 'cos-nodejs-sdk-v5'

export function cosRegion() {
  const value = process.env.TENCENT_COS_REGION || ''
  return value.match(/ap-[a-z0-9-]+/i)?.[0] || value.trim()
}

export function cosClient() {
  const SecretId = process.env.TENCENT_COS_SECRET_ID
  const SecretKey = process.env.TENCENT_COS_SECRET_KEY
  if (!SecretId || !SecretKey || !process.env.TENCENT_COS_BUCKET || !cosRegion()) {
    throw new Error('腾讯云 COS 配置不完整')
  }
  return new COS({ SecretId, SecretKey })
}

export function cosDelete(urls: string[]) {
  const keys = urls.map((url) => {
    try {
      const path = new URL(url).pathname.replace(/^\//, '')
      return path ? { Key: decodeURIComponent(path) } : null
    } catch {
      return null
    }
  }).filter((key): key is { Key: string } => Boolean(key))
  if (!keys.length) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    cosClient().deleteMultipleObject({
      Bucket: process.env.TENCENT_COS_BUCKET!,
      Region: cosRegion(),
      Objects: keys,
      Quiet: true,
    }, (error) => error ? reject(error) : resolve())
  })
}

export function cosList(cursor?: string) {
  return new Promise<{ Contents?: Array<{ Key?: string; Size?: number | string }>; IsTruncated?: boolean | string; NextMarker?: string }>((resolve, reject) => {
    cosClient().getBucket({
      Bucket: process.env.TENCENT_COS_BUCKET!,
      Region: cosRegion(),
      MaxKeys: 1000,
      Marker: cursor,
    }, (error, data) => error ? reject(error) : resolve(data))
  })
}

export function cosUrl(key: string) {
  const bucket = process.env.TENCENT_COS_BUCKET!
  return `https://${bucket}.cos.${cosRegion()}.myqcloud.com/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function cosPut(key: string, body: Buffer, contentType: string) {
  return new Promise<void>((resolve, reject) => {
    cosClient().putObject({
      Bucket: process.env.TENCENT_COS_BUCKET!, Region: cosRegion(), Key: key, Body: body,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable', StorageClass: 'STANDARD',
    }, (error) => error ? reject(error) : resolve())
  })
}

export function cosTestConfig() {
  return Boolean(process.env.TENCENT_COS_BUCKET && process.env.TENCENT_COS_SECRET_ID && process.env.TENCENT_COS_SECRET_KEY && cosRegion())
}

export { COS }
