import { NextResponse, type NextRequest } from 'next/server'
import { getRole } from '@/lib/auth'
import { cosClient, cosPut, cosUrl } from '@/lib/cos'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_ADMIN_BYTES = 5 * 1024 * 1024 * 1024
const MAX_MESSAGE_BYTES = 15 * 1024 * 1024

const cleanKey = (pathname: string) => pathname.replace(/^\/+/, '').replace(/\.\./g, '')

function authorize(role: string | null, pathname: string, size: number) {
  if (!role) return NextResponse.json({ error: '无权限' }, { status: 401 })
  if (!pathname) return NextResponse.json({ error: '缺少路径' }, { status: 400 })
  if (role !== 'admin' && !pathname.startsWith('messages/')) {
    return NextResponse.json({ error: '访客只能上传留言图片' }, { status: 403 })
  }
  const maxBytes = role === 'admin' ? MAX_ADMIN_BYTES : MAX_MESSAGE_BYTES
  if (size > maxBytes) return NextResponse.json({ error: '文件超过大小限制' }, { status: 413 })
  return null
}

export async function POST(request: NextRequest) {
  const role = await getRole()
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      // JSON 模式：给浏览器签发 R2 预签名 PUT 地址，前端直传
      const { pathname = '', size = 0, contentType = 'application/octet-stream' } = (await request.json()) as {
        pathname?: string
        size?: number
        contentType?: string
      }
      const denied = authorize(role, pathname, size)
      if (denied) return denied
      const key = cleanKey(pathname)

      // 用 S3 预签名器签发 PUT URL（Content-Type 一并签入，浏览器 PUT 时须带相同 Content-Type）
      const uploadUrl = await getSignedUrl(
        cosClient(),
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET!,
          Key: key,
          ContentType: contentType || 'application/octet-stream',
        }),
        { expiresIn: 3600 },
      )
      return NextResponse.json({ uploadUrl, url: cosUrl(key), pathname: key })
    }

    // 表单模式：服务端直传（留言图片/涂鸦等小文件走这里）
    const form = await request.formData()
    const file = form.get('file')
    const pathname = String(form.get('pathname') || '')
    if (!(file instanceof File)) return NextResponse.json({ error: '缺少文件' }, { status: 400 })
    const denied = authorize(role, pathname, file.size)
    if (denied) return denied
    const key = cleanKey(pathname)
    await cosPut(key, Buffer.from(await file.arrayBuffer()), file.type)
    return NextResponse.json({ url: cosUrl(key), pathname: key })
  } catch (error) {
    console.error('[upload] failed:', error)
    return NextResponse.json({ error: (error as Error).message || '上传失败' }, { status: 502 })
  }
}
