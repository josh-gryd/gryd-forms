// The one gate in front of the portal. Respondents never meet it: the public
// form (/f/<slug>, or any path on FORMS_PUBLIC_HOST) and its API are open by
// design. Everything else needs a signed session cookie (lib/auth.ts).

import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, authEnabled, verifySession } from '@/lib/auth'

const OPEN = ['/api/public/forms', '/api/health', '/api/auth/sign-in', '/fonts', '/icon.svg', '/favicon.ico']
const FORMS_HOST = (process.env.FORMS_PUBLIC_HOST || '').toLowerCase()

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(p + '/')

function withSurface(req: NextRequest, surface: string | null): Headers {
  const headers = new Headers(req.headers)
  headers.delete('x-forms-surface')
  if (surface) headers.set('x-forms-surface', surface)
  return headers
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()

  // A forms-only host serves /<slug> as /f/<slug>.
  if (FORMS_HOST && host === FORMS_HOST && !under(pathname, '/f') && !pathname.startsWith('/api/') && !pathname.startsWith('/_next') && !pathname.startsWith('/fonts')) {
    const url = req.nextUrl.clone()
    url.pathname = `/f${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url, { request: { headers: withSurface(req, 'public-form') } })
  }
  if (under(pathname, '/f')) return NextResponse.next({ request: { headers: withSurface(req, 'public-form') } })
  if (under(pathname, '/auth')) return NextResponse.next({ request: { headers: withSurface(req, 'sign-in') } })
  if (OPEN.some(p => under(pathname, p))) return NextResponse.next({ request: { headers: withSurface(req, null) } })

  if (authEnabled() && !(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = '/auth/sign-in'
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next({ request: { headers: withSurface(req, null) } })
}

export const config = {
  matcher: ['/((?!_next/).*)'],
}
