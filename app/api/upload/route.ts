import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse, type NextRequest } from 'next/server'
import { getRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const role = await getRole()
  if (!role) return NextResponse.json({ error: '无权限' }, { status: 401 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (role === 'admin') {
          return {
            allowedContentTypes: ['image/*', 'video/*', 'audio/*'],
            maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
            addRandomSuffix: true,
          }
        }
        if (!pathname.startsWith('messages/')) throw new Error('访客只能上传留言图片')
        return {
          allowedContentTypes: ['image/*'],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
