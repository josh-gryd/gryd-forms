// Sign-in for a self-hosted install: one admin password (FORMS_ADMIN_PASSWORD).
// A session is a signed cookie, `<email>|<expiry>|<hmac>`, checked with Web
// Crypto so the same code runs in middleware and on the server.
//
// Fail-closed: in production with no password set, nobody gets in and the
// sign-in page says what to set. In development with no password, the portal
// is open (local use only).

export const SESSION_COOKIE = 'forms_session'
const SESSION_DAYS = 30

export function authEnabled(): boolean {
  return !!process.env.FORMS_ADMIN_PASSWORD || process.env.NODE_ENV === 'production'
}

export function adminEmail(): string {
  return (process.env.FORMS_ADMIN_EMAIL || 'admin@localhost').toLowerCase()
}

function secret(): string {
  const s = process.env.FORMS_SECRET || ''
  if (s.length >= 16) return s
  // Derived from the password so a simple install needs only one variable;
  // changing the password signs everyone out.
  return `forms:${process.env.FORMS_ADMIN_PASSWORD || ''}`
}

const enc = new TextEncoder()

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function signSession(email: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000
  const body = `${email}|${exp}`
  return `${body}|${await hmac(body)}`
}

export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null
  const parts = token.split('|')
  if (parts.length !== 3) return null
  const [email, exp, sig] = parts
  if (!(Number(exp) > Date.now())) return null
  return safeEqual(sig, await hmac(`${email}|${exp}`)) ? email : null
}

export async function checkPassword(given: string): Promise<boolean> {
  const want = process.env.FORMS_ADMIN_PASSWORD || ''
  if (!want) return false
  // Compare digests so the comparison takes the same time whatever the length.
  return safeEqual(await hmac(`pw:${given}`), await hmac(`pw:${want}`))
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86_400
