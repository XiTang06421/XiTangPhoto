import COS from 'cos-nodejs-sdk-v5'
import { NextResponse, type NextRequest } from 'next/server'
import { getRole } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_ADMIN_BYTES = 5 * 1024 * 1024 * 1024
const MAX_MESSAGE_BYTES = 15 * 1024 * 1024

function cosRegion() {
  const value = process.env.TENCENT_COS_REGION || ''
  return value.match(/ap-[a-z0-9-]+/i)?.[0] || value.trim()
}

function getCosClient() {
  const SecretId = process.env.TENCENT_COS_SECRET_ID
  const SecretKey = process.env.TENCENT_COS_SECRET_KEY
  if (!SecretId || !SecretKey) throw new Error('腾讯云 COS 凭据未配置')
  return new COS({ SecretId, SecretKey })
}

function publicUrl(key: string) {
  const bucket = process.env.TENCENT_COS_BUCKET
  const region = cosRegion()
  if (!bucket || !region) throw new Error('腾讯云 COS 桶配置不完整')
  return `https://${bucket}.cos.${region}.myqcloud.com/${key.split('/').map(encodeURIComponent).join('/')}`
}

function uploadObject(cos: COS, key: string, body: Buffer, contentType: string) {
  return new Promise<void>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: process.env.TENCENT_COS_BUCKET!,
        Region: cosRegion(),
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
        StorageClass: 'STANDARD',
      },
      (error) => (error ? reject(new Error(error.message || 'COS 上传失败')) : resolve()),
    )
  })
}

export async function POST(request: NextRequest) {
  const role = await getRole()
  if (!role) return NextResponse.json({ error: '无权限' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    const pathname = String(form.get('pathname') || '')
    if (!(file instanceof File) || !pathname) {
      return NextResponse.json({ error: '缺少文件或路径' }, { status: 400 })
    }
    if (role !== 'admin' && !pathname.startsWith('messages/')) {
      return NextResponse.json({ error: '访客只能上传留言图片' }, { status: 403 })
    }
    const maxBytes = role === 'admin' ? MAX_ADMIN_BYTES : MAX_MESSAGE_BYTES
    if (file.size > maxBytes) return NextResponse.json({ error: '文件超过大小限制' }, { status: 413 })

    const key = pathname.replace(/^\/+/, '').replace(/\.\./g, '')
    const body = Buffer.from(await file.arrayBuffer())
    await uploadObject(getCosClient(), key, body, file.type)
    return NextResponse.json({ url: publicUrl(key), pathname: key })
  } catch (error) {
    console.error('[v0] COS upload failed:', error)
    return NextResponse.json({ error: (error as Error).message || 'COS 上传失败' }, { status: 502 })
  }
}
