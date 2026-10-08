import { NextResponse, type NextRequest } from 'next/server'
import { getRole } from '@/lib/auth'
import { cosClient, cosPut, cosRegion, cosUrl } from '@/lib/cos'

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

/**
 * JSON body → returns a short-lived signed PUT URL so the browser uploads straight to COS
 * (bypasses the 4.5MB serverless body limit). FormData body → small server-side upload fallback.
 */
export async function POST(request: NextRequest) {
  const role = await getRole()
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const { pathname = '', size = 0 } = (await request.json()) as { pathname?: string; size?: number }
      const denied = authorize(role, pathname, size)
      if (denied) return denied
      const key = cleanKey(pathname)
      const uploadUrl = cosClient().getObjectUrl(
        { Bucket: process.env.TENCENT_COS_BUCKET!, Region: cosRegion(), Key: key, Method: 'PUT', Sign: true, Expires: 3600 },
        () => {},
      )
      return NextResponse.json({ uploadUrl, url: cosUrl(key), pathname: key })
    }

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
    console.error('[v0] COS upload failed:', error)
    return NextResponse.json({ error: (error as Error).message || 'COS 上传失败' }, { status: 502 })
  }
}
