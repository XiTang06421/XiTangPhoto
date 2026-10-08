import { cosList } from '@/lib/cos'
import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'

export async function GET() {
  if ((await getRole()) !== 'admin') return unauthorized()
  let cursor: string | undefined
  let bytes = 0
  let files = 0
  do {
    const page = await cosList(cursor)
    for (const object of page.Contents ?? []) {
      bytes += Number(object.Size ?? 0)
      files += 1
    }
    cursor = (page.IsTruncated === true || page.IsTruncated === 'true') ? page.NextMarker : undefined
  } while (cursor)
  return NextResponse.json({ bytes, files })
}
