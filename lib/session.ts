import { cookies } from 'next/headers'
import { SESSION_COOKIE, adminEmail, authEnabled, verifySession } from './auth'

/** Who is signed in to the portal, or null. With sign-in off (local
 *  development, no password) everyone is the admin. */
export async function currentEmail(): Promise<string | null> {
  if (!authEnabled()) return adminEmail()
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value)
}
