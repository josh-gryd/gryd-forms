// The builder + results API: one proxy for every /api/forms/* call. The
// session is checked here (middleware is the primary gate; this is the
// per-route backstop), then the request is forwarded to the engine with the
// shared secret and the acting user's email for the audit trail.

import { NextRequest, NextResponse } from 'next/server'
import { engineFetch } from '@/lib/engine-fetch'
import { currentEmail } from '@/lib/session'
import { isDemo } from '@/lib/demo'
import { SlidingWindow } from '@/lib/sliding-window'

export const dynamic = 'force-dynamic'

const READ = new Set(['GET', 'HEAD'])

// Demo only: what one visitor can do in an hour. Autosave writes often, so the
// general cap is loose; making and publishing forms are the ones that matter.
const DEMO_LIMITS = {
  create: new SlidingWindow(20, 3600_000),
  publish: new SlidingWindow(40, 3600_000),
  write: new SlidingWindow(900, 600_000),
}

function demoLimit(req: NextRequest, path: string): NextResponse | null {
  if (!isDemo() || READ.has(req.method)) return null
  const ip = req.headers.get('fly-client-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  const creates = req.method === 'POST' && (path === '' || /^templates\/[^/]+\/use$/.test(path) || /^[^/]+\/duplicate$/.test(path))
  const publishes = req.method === 'POST' && /^[^/]+\/publish$/.test(path)
  const over = !DEMO_LIMITS.write.hit(ip) || (creates && !DEMO_LIMITS.create.hit(ip)) || (publishes && !DEMO_LIMITS.publish.hit(ip))
  return over ? NextResponse.json({ error: 'That’s the demo’s limit for now. Try again later, or run your own copy: it’s free.' }, { status: 429 }) : null
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await ctx.params
  const email = await currentEmail()
  if (!email) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const path = (params.path ?? []).map(encodeURIComponent).join('/')
  const isCsv = /\.csv$/.test(path)
  const limited = demoLimit(req, path); if (limited) return limited
  const url = `/api/forms/${path}${req.nextUrl.search}`
  const headers: Record<string, string> = { 'x-forms-user': email }
  const ct = req.headers.get('content-type')
  if (ct) headers['content-type'] = ct
  const fileName = req.headers.get('x-file-name')
  if (fileName) headers['x-file-name'] = fileName
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, signal: AbortSignal.timeout(isCsv ? 120_000 : 30_000) }
  if (!READ.has(req.method)) { init.body = req.body; init.duplex = 'half' }
  let res: Response
  try { res = await engineFetch(url, init) } catch (err) {
    return NextResponse.json({ error: `engine unreachable: ${(err as Error).message}` }, { status: 502 })
  }
  // Downloads: the engine either streams bytes or hands back a short-lived URL.
  if (/\/files\/[^/]+$/.test(path) && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
    const data = (await res.json()) as { url?: string }
    if (data.url) return NextResponse.redirect(data.url, 302)
    return NextResponse.json(data)
  }
  const out = new Headers()
  for (const h of ['content-type', 'content-length', 'content-disposition', 'cache-control']) { const v = res.headers.get(h); if (v) out.set(h, v) }
  return new Response(res.body, { status: res.status, headers: out })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
