// The builder + results API: one proxy for every /api/forms/* call. The
// session is checked here (middleware is the primary gate; this is the
// per-route backstop), then the request is forwarded to the engine with the
// shared secret and the acting user's email for the audit trail.

import { NextRequest, NextResponse } from 'next/server'
import { engineFetch } from '@/lib/engine-fetch'
import { currentEmail } from '@/lib/session'

export const dynamic = 'force-dynamic'

const READ = new Set(['GET', 'HEAD'])

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await ctx.params
  const email = await currentEmail()
  if (!email) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const path = (params.path ?? []).map(encodeURIComponent).join('/')
  const isCsv = /\.csv$/.test(path)
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
