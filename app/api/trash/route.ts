import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { purgeExpiredTrash } from '@/lib/cleanup'
import { PHOTO_COLUMNS, q } from '@/lib/db'

export async function GET() {
  if ((await getRole()) !== 'admin') return unauthorized()
  await purgeExpiredTrash()
  return NextResponse.json(
    await q(`select ${PHOTO_COLUMNS} from photos where deleted_at is not null order by deleted_at desc`),
  )
}
