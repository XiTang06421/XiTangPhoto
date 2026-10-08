import { list } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'

export async function GET() {
  if ((await getRole()) !== 'admin') return unauthorized()
  let cursor: string | undefined
  let bytes = 0
  let files = 0
  do {
    const page = await list({ limit: 1000, cursor })
    for (const blob of page.blobs) {
      bytes += blob.size
      files += 1
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return NextResponse.json({ bytes, files })
}
