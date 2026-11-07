import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE, adminEmail, checkPassword, signSession } from '@/lib/auth'
import { SlidingWindow } from '@/lib/sliding-window'

export const dynamic = 'force-dynamic'

// Ten tries per IP per 15 minutes.
const tries = new SlidingWindow(10, 15 * 60_000)

// Relative Location: behind a proxy or a custom server, req.url's host is not the one the browser used.
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } })
}

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/forms'
  return raw
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const next = safeNext(String(form.get('next') || ''))
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  const back = (error: string) => {
    return seeOther(`/auth/sign-in?${new URLSearchParams({ error, next })}`)
  }
  if (!process.env.FORMS_ADMIN_PASSWORD) return back('unset')
  if (!tries.hit(ip)) return back('slow')
  if (!(await checkPassword(String(form.get('password') || '')))) return back('wrong')
  const res = seeOther(next)
  res.cookies.set(SESSION_COOKIE, await signSession(adminEmail()), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
    secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https',
  })
  return res
}
