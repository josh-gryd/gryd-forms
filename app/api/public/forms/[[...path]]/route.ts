// The respondent API: no session needed, by design. Every path maps onto the
// engine's /api/forms/public/* surface, which validates, rate-limits (by the
// client IP forwarded here) and never exposes a form's draft or another
// respondent's data. Nothing about the caller is trusted beyond what the
// engine re-checks — except who is signed in, which only this server can read
// from its own session cookie (a browser can't set x-forms-respondent: the
// headers sent on are built here, never copied), and which the engine uses
// only for forms restricted to signed-in people.

import { NextRequest, NextResponse } from 'next/server'
import { engineFetch } from '@/lib/engine-fetch'
import { currentEmail } from '@/lib/session'

export const dynamic = 'force-dynamic'

const READ = new Set(['GET', 'HEAD'])
const MAX_JSON = 1_000_000

function clientIp(req: NextRequest): string {
  const fly = req.headers.get('fly-client-ip')
  if (fly) return fly
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await ctx.params
  const segments = params.path ?? []
  const path = segments.map(encodeURIComponent).join('/')
  const isBytes = req.method === 'PUT' && segments[0] === 'uploads' && segments[2] === 'bytes'
  const headers: Record<string, string> = {
    'x-forms-client-ip': clientIp(req),
    'x-forms-client-ua': (req.headers.get('user-agent') || '').slice(0, 300),
    'x-forms-client-lang': (req.headers.get('accept-language') || '').slice(0, 100),
  }
  // The password token this tab holds (the engine verifies its signature).
  const unlock = req.headers.get('x-form-unlock')
  if (unlock && unlock.length <= 200) headers['x-forms-form-unlock'] = unlock
  if (!isBytes) {
    const email = await currentEmail().catch(() => null)
    if (email) headers['x-forms-respondent'] = email
  }
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, signal: AbortSignal.timeout(isBytes ? 180_000 : 20_000) }
  if (isBytes) {
    headers['content-type'] = req.headers.get('content-type') || 'application/octet-stream'
    const len = req.headers.get('content-length')
    if (len) headers['content-length'] = len
    init.body = req.body; init.duplex = 'half'
  } else if (!READ.has(req.method)) {
    const text = await req.text()
    if (text.length > MAX_JSON) return NextResponse.json({ error: 'request too large' }, { status: 413 })
    headers['content-type'] = 'application/json'
    init.body = text
  }
  let res: Response
  try { res = await engineFetch(`/api/forms/public/${path}${req.nextUrl.search}`, init) } catch (err) {
    return NextResponse.json({ error: 'The form service is unreachable. Nothing was lost — try again in a moment.', detail: (err as Error).message }, { status: 502 })
  }
  const out = new Headers()
  for (const h of ['content-type', 'content-length', 'cache-control']) { const v = res.headers.get(h); if (v) out.set(h, v) }
  if (segments[0] !== 'assets') out.set('cache-control', 'no-store')
  return new Response(res.body, { status: res.status, headers: out })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
