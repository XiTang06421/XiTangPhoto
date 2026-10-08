import { GalleryApp } from '@/components/gallery/gallery-app'
import { PasswordGate } from '@/components/gate/password-gate'
import { getRole } from '@/lib/auth'

export default async function Page() {
  const role = await getRole()
  if (!role) return <PasswordGate />
  return <GalleryApp initialRole={role} />
}
