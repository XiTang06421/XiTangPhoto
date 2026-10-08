import { NextResponse } from 'next/server'
import { getRole, unauthorized } from '@/lib/auth'
import { q } from '@/lib/db'

export async function GET() {
  if ((await getRole()) !== 'admin') return unauthorized()
  return NextResponse.json(
    await q(
      `select device_id as "deviceId", role, device, ip, visits,
         first_seen as "firstSeen", last_seen as "lastSeen"
       from visitors order by last_seen desc limit 500`,
    ),
  )
}
