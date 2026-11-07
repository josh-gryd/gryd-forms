// HTTP surface for forms, mounted at /api/forms by api/index.ts. Everything
// here sits behind the engine's shared secret: the dashboard is the only
// caller. The dashboard decides what is public (respondent routes need no
// session there) and what needs a signed-in member with the `forms` area.
// Respondent routes are still rate-limited HERE, keyed by the client IP the
// dashboard forwards, because this is the one process that sees all of them.

import express, { type Request, type Response, type NextFunction } from 'express'
import { Readable } from 'node:stream'
import { timingSafeEqual } from 'node:crypto'
import * as svc from './service'
import { ServiceError } from './service'
import * as ws from './workspace'
import * as lib from './library'
import { formReport } from './report'
import { LIMITS } from './rate-limit'
import { formsLog } from './log'
import { listNotifications, type SubmissionQuery, type InboxQuery } from './repo'
import { sendSlackTest } from './notify'
import { slackTargets } from './slack'

export const formsRouter = express.Router()

function clientIp(req: Request): string {
  const fwd = req.get('x-forms-client-ip') || req.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : req.ip) || 'unknown'
}

/** Express 5 types params as string | string[]; routes here never repeat a segment. */
function param(req: Request, name: string): string {
  const v = (req.params as Record<string, string | string[]>)[name]
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}

function actor(req: Request): string | null {
  const v = req.get('x-forms-user')
  return v ? v.slice(0, 200) : null
}

/** What the dashboard vouches for: the signed-in respondent (it reads its own
 *  session; a browser can't set this header through the public proxy) and the
 *  password token the tab holds. */
function respondentAuth(req: Request): svc.RespondentAuth {
  return { respondent: req.get('x-forms-respondent') || null, unlock: req.get('x-forms-form-unlock') || null }
}

const deviceIdOf = (b: Record<string, unknown>): string | null => (typeof b.deviceId === 'string' ? b.deviceId : null)

function respondentMeta(req: Request): svc.RespondentMeta {
  const b = (req.body ?? {}) as Record<string, unknown>
  const meta = (b.meta && typeof b.meta === 'object' ? b.meta : {}) as Record<string, unknown>
  return {
    userAgent: req.get('x-forms-client-ua') || req.get('user-agent') || null,
    acceptLanguage: req.get('x-forms-client-lang') ?? req.get('accept-language') ?? null,
    referrer: typeof meta.referrer === 'string' ? meta.referrer : null,
    source: meta.source && typeof meta.source === 'object' ? Object.fromEntries(Object.entries(meta.source as Record<string, unknown>).filter(([k, v]) => typeof v === 'string' && k.length <= 40).map(([k, v]) => [k, String(v).slice(0, 200)]).slice(0, 20)) : null,
    embedded: meta.embedded === true,
  }
}

function limited(bucket: keyof typeof LIMITS, keyFn: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!LIMITS[bucket].take(keyFn(req))) {
      formsLog.warn('rate_limited', { bucket, path: req.path })
      res.status(429).json({ error: 'Too many requests — try again in a minute.' })
      return
    }
    next()
  }
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(err => {
      if (err instanceof ServiceError) { res.status(err.status).json({ error: err.message, ...err.body }); return }
      formsLog.error('api_error', err, { method: req.method, path: req.path })
      res.status(500).json({ error: 'internal error' })
    })
}

function parseQuery(req: Request): SubmissionQuery {
  const q = req.query as Record<string, unknown>
  const status = typeof q.status === 'string' && ['all', 'completed', 'partial', 'spam'].includes(q.status) ? (q.status as SubmissionQuery['status']) : 'all'
  let answerFilters: SubmissionQuery['answerFilters'] = []
  if (typeof q.filters === 'string' && q.filters) {
    try { const parsed = JSON.parse(q.filters); if (Array.isArray(parsed)) answerFilters = parsed.filter(f => f && typeof f.blockId === 'string' && typeof f.value === 'string').slice(0, 10) } catch { /* ignore bad filter json */ }
  }
  return {
    status, q: typeof q.q === 'string' ? q.q.slice(0, 200) : undefined,
    since: typeof q.since === 'string' && /^\d{4}-\d{2}-\d{2}/.test(q.since) ? q.since : undefined,
    until: typeof q.until === 'string' && /^\d{4}-\d{2}-\d{2}/.test(q.until) ? q.until : undefined,
    answerFilters, sort: q.sort === 'submitted_asc' || q.sort === 'started_desc' ? q.sort : 'submitted_desc',
    offset: Number.isFinite(Number(q.offset)) ? Number(q.offset) : 0, limit: Number.isFinite(Number(q.limit)) ? Number(q.limit) : 50,
    ids: typeof q.ids === 'string' && q.ids ? q.ids.split(',').map(x => x.trim()).filter(x => /^[A-Za-z0-9_]{1,40}$/.test(x)).slice(0, 500) : undefined,
  }
}

function parseInbox(req: Request): InboxQuery {
  const q = req.query as Record<string, unknown>
  return {
    formId: typeof q.form === 'string' && q.form ? q.form : undefined,
    since: typeof q.since === 'string' && /^\d{4}-\d{2}-\d{2}/.test(q.since) ? q.since : undefined,
    until: typeof q.until === 'string' && /^\d{4}-\d{2}-\d{2}/.test(q.until) ? q.until : undefined,
    unread: q.unread === '1' || q.unread === 'true',
    q: typeof q.q === 'string' ? q.q.slice(0, 200) : undefined,
    offset: Number.isFinite(Number(q.offset)) ? Number(q.offset) : 0, limit: Number.isFinite(Number(q.limit)) ? Number(q.limit) : 50,
  }
}

// ── Authenticated (builder + results) ────────────────────────────────────────
// Static paths first: /folders, /templates, /workspace and /responses would
// otherwise be read as a form id by /:id.

formsRouter.get('/', wrap((req, res) => res.json({ forms: svc.listForms({ archived: req.query.archived === '1' }) })))
formsRouter.post('/', wrap((req, res) => { const b = req.body ?? {}; res.status(201).json(svc.createForm({ title: typeof b.title === 'string' ? b.title : undefined, definition: b.definition, createdBy: actor(req), folderId: typeof b.folderId === 'string' ? b.folderId : null })) }))

formsRouter.get('/folders', wrap((_req, res) => res.json({ folders: ws.listFolders() })))
formsRouter.post('/folders', wrap((req, res) => res.status(201).json(ws.createFolder(req.body?.name, actor(req), req.body?.color))))
formsRouter.put('/folders/order', wrap((req, res) => res.json({ folders: ws.reorderFolders(Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []) })))
formsRouter.patch('/folders/:fid', wrap((req, res) => res.json(ws.updateFolder(param(req, 'fid'), { name: req.body?.name, color: req.body?.color }))))
formsRouter.delete('/folders/:fid', wrap((req, res) => { ws.deleteFolder(param(req, 'fid'), actor(req)); res.json({ ok: true }) }))

formsRouter.get('/templates', wrap((_req, res) => res.json({ templates: lib.listTemplates() })))
formsRouter.get('/templates/:tid', wrap((req, res) => res.json(lib.getTemplate(param(req, 'tid')))))
formsRouter.post('/templates/:tid/use', wrap((req, res) => { const b = req.body ?? {}; res.status(201).json(lib.useTemplate(param(req, 'tid'), { title: typeof b.title === 'string' ? b.title : undefined, folderId: typeof b.folderId === 'string' ? b.folderId : null, by: actor(req) })) }))
formsRouter.patch('/templates/:tid', wrap((req, res) => res.json(lib.updateTemplate(param(req, 'tid'), req.body ?? {}))))
formsRouter.delete('/templates/:tid', wrap((req, res) => { lib.deleteTemplate(param(req, 'tid'), actor(req)); res.json({ ok: true }) }))

formsRouter.get('/workspace', wrap(async (_req, res) => res.json({ settings: ws.getWorkspace(), senders: await ws.listSenders() })))
formsRouter.put('/workspace', wrap(async (req, res) => res.json({ settings: await ws.saveWorkspace(req.body ?? {}, actor(req)) })))
formsRouter.post('/workspace/apply', wrap((req, res) => res.json(lib.applyWorkspace(req.body ?? {}, actor(req)))))
// POST for the portal's builder, PUT for GRYD MCP's one-time upload links (they always PUT).
for (const method of ['post', 'put'] as const) {
  formsRouter[method]('/workspace/assets', express.raw({ type: () => true, limit: 4 * 1024 * 1024 + 1024 }), wrap(async (req, res) => {
    const name = String(req.get('x-file-name') || 'logo.png')
    const body = Readable.from(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0))
    res.status(201).json(await ws.uploadWorkspaceAsset({ name: decodeURIComponent(name), body, by: actor(req) }))
  }))
}

formsRouter.get('/responses', wrap((req, res) => res.json(svc.listInbox(parseInbox(req)))))
formsRouter.get('/responses/unread', wrap((_req, res) => res.json(svc.unreadResponses())))
formsRouter.post('/responses/read', wrap((req, res) => res.json(svc.markResponsesRead(req.body ?? {}))))

formsRouter.get('/slack/targets', wrap(async (req, res) => res.json(await slackTargets(typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : ''))))

formsRouter.get('/:id', wrap((req, res) => res.json(svc.getFormDetail(param(req, 'id')))))
formsRouter.patch('/:id', wrap((req, res) => { const b = req.body ?? {}; res.json(svc.patchForm(param(req, 'id'), { title: typeof b.title === 'string' ? b.title : undefined, slug: typeof b.slug === 'string' ? b.slug : undefined, closedMessage: typeof b.closedMessage === 'string' ? b.closedMessage : undefined, by: actor(req) })) }))
formsRouter.put('/:id/draft', wrap((req, res) => {
  const b = req.body ?? {}
  const result = svc.saveDraft(param(req, 'id'), { definition: b.definition, baseRevision: Number(b.baseRevision), by: actor(req) })
  res.status(result.ok ? 200 : 409).json(result)
}))
formsRouter.post('/:id/duplicate', wrap((req, res) => res.status(201).json(svc.duplicateForm(param(req, 'id'), actor(req)))))
formsRouter.delete('/:id', wrap((req, res) => { svc.deleteForm(param(req, 'id'), actor(req)); res.json({ ok: true }) }))
formsRouter.post('/:id/publish', wrap((req, res) => { const b = req.body ?? {}; res.json(svc.publishForm(param(req, 'id'), { baseRevision: b.baseRevision === undefined ? undefined : Number(b.baseRevision), by: actor(req) })) }))
formsRouter.post('/:id/close', wrap((req, res) => res.json(svc.closeForm(param(req, 'id'), actor(req)))))
formsRouter.post('/:id/reopen', wrap((req, res) => res.json(svc.reopenForm(param(req, 'id'), actor(req)))))
formsRouter.post('/:id/unpublish', wrap((req, res) => res.json(svc.unpublishForm(param(req, 'id'), actor(req)))))
formsRouter.get('/:id/versions/:vid', wrap((req, res) => res.json(svc.getVersionDefinition(param(req, 'id'), param(req, 'vid')))))
formsRouter.get('/:id/preview', wrap((req, res) => res.json(svc.getDraftForPreview(param(req, 'id')))))
formsRouter.patch('/:id/settings', wrap((req, res) => res.json(svc.updateFormSettings(param(req, 'id'), req.body ?? {}, actor(req)))))
formsRouter.post('/:id/archive', wrap((req, res) => res.json(svc.archiveForm(param(req, 'id'), actor(req)))))
formsRouter.post('/:id/restore', wrap((req, res) => res.json(svc.restoreForm(param(req, 'id'), actor(req)))))
formsRouter.post('/:id/template', wrap((req, res) => { const b = req.body ?? {}; res.status(201).json(lib.saveAsTemplate(param(req, 'id'), { name: b.name, description: b.description, category: b.category, by: actor(req) })) }))
formsRouter.get('/:id/report', wrap((req, res) => res.json(formReport(param(req, 'id')))))
formsRouter.post('/:id/slack/test', wrap(async (req, res) => res.json(await sendSlackTest(param(req, 'id'), actor(req)))))
formsRouter.get('/:id/notifications', wrap((req, res) => { svc.getFormDetail(param(req, 'id')); res.json({ notifications: listNotifications(param(req, 'id'), 20) }) }))
formsRouter.post('/:id/responses/purge', wrap(async (req, res) => { const d = req.body?.olderThanDays; res.json(await svc.purgeResponses(param(req, 'id'), { olderThanDays: d === undefined || d === null ? null : Number(d) }, actor(req))) }))

formsRouter.get('/:id/responses', wrap((req, res) => res.json(svc.listResponses(param(req, 'id'), parseQuery(req)))))
formsRouter.get('/:id/responses.csv', wrap((req, res) => {
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="responses-${param(req, 'id')}.csv"`)
  for (const line of svc.csvExport(param(req, 'id'), parseQuery(req))) res.write(line)
  res.end()
}))
formsRouter.get('/:id/responses/:rid', wrap((req, res) => res.json(svc.getResponse(param(req, 'id'), param(req, 'rid'), parseQuery(req)))))
formsRouter.delete('/:id/responses/:rid', wrap(async (req, res) => { await svc.deleteResponse(param(req, 'id'), param(req, 'rid'), actor(req)); res.json({ ok: true }) }))
formsRouter.post('/:id/responses/delete', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 500) : []
  let deleted = 0
  for (const id of ids) { try { await svc.deleteResponse(param(req, 'id'), id, actor(req)); deleted++ } catch (err) { if (!(err instanceof ServiceError && err.status === 404)) throw err } }
  res.json({ ok: true, deleted })
}))
formsRouter.get('/:id/files/:fid', wrap(async (req, res) => {
  const out = await svc.fileDownload(param(req, 'id'), param(req, 'fid'))
  if ('redirect' in out) { res.json({ url: out.redirect }); return }
  res.setHeader('content-type', out.contentType || 'application/octet-stream')
  res.setHeader('content-length', String(out.size))
  res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`)
  out.stream.pipe(res)
}))
for (const method of ['post', 'put'] as const) {
  formsRouter[method]('/:id/assets', express.raw({ type: () => true, limit: svc.ASSET_MAX_BYTES + 1024 }), wrap(async (req, res) => {
    const name = String(req.get('x-file-name') || 'image.png')
    const body = Readable.from(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0))
    res.status(201).json(await svc.uploadAsset(param(req, 'id'), { name: decodeURIComponent(name), body, by: actor(req) }))
  }))
}

// ── Public (respondents, via the dashboard's public proxy) ───────────────────

const publicRouter = express.Router()
publicRouter.get('/assets/:aid', wrap(async (req, res) => {
  const got = await svc.assetStream(param(req, 'aid'))
  if (!got) { res.status(404).end(); return }
  if ('redirect' in got) { res.redirect(302, got.redirect); return }
  res.setHeader('content-type', got.contentType)
  res.setHeader('content-length', String(got.size))
  res.setHeader('cache-control', 'public, max-age=86400, immutable')
  got.stream.pipe(res)
}))
publicRouter.get('/by-slug/:slug', limited('read', clientIp), wrap((req, res) => res.json(svc.getPublicForm(param(req, 'slug'), respondentAuth(req)))))
publicRouter.post('/:id/unlock', limited('unlock', clientIp), limited('formUnlock', req => param(req, 'id')), wrap((req, res) => res.json(svc.unlockForm(param(req, 'id'), req.body?.password, respondentAuth(req)))))
publicRouter.post('/:id/edit/load', limited('edit', clientIp), wrap((req, res) => res.json(svc.getEditSession(param(req, 'id'), typeof req.body?.token === 'string' ? req.body.token : null, respondentAuth(req)))))
publicRouter.post('/:id/edit/save', limited('edit', clientIp), wrap(async (req, res) => {
  const b = req.body ?? {}
  res.json(await svc.saveEdit(param(req, 'id'), { token: typeof b.token === 'string' ? b.token : null, versionId: typeof b.versionId === 'string' ? b.versionId : null, answers: b.answers ?? {}, pagesVisited: b.pagesVisited, auth: respondentAuth(req) }))
}))
publicRouter.get('/:id/draft', limited('read', clientIp), wrap((req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  if (!token) throw new ServiceError(400, 'token required')
  res.json(svc.getRespondentDraft(param(req, 'id'), token))
}))
// A returning respondent whose saved session is on an older version asks for it
// here: the definition to resume on, or 'moved' once that version is retired.
publicRouter.get('/:id/versions/:vid', limited('read', clientIp), wrap((req, res) => res.json(svc.getSessionVersion(param(req, 'id'), param(req, 'vid'), respondentAuth(req)))))
publicRouter.post('/:id/draft', limited('autosave', clientIp), wrap((req, res) => {
  const b = req.body ?? {}
  if (!b.token && !LIMITS.start.take(clientIp(req))) throw new ServiceError(429, 'Too many requests — try again in a minute.')
  res.json(svc.saveRespondentDraft(param(req, 'id'), { token: typeof b.token === 'string' ? b.token : null, versionId: typeof b.versionId === 'string' ? b.versionId : null, answers: b.answers, currentPageId: b.currentPageId, pagesVisited: b.pagesVisited, meta: respondentMeta(req), auth: respondentAuth(req), deviceId: deviceIdOf(b) }))
}))
publicRouter.post('/:id/check', limited('check', clientIp), wrap((req, res) => {
  const b = req.body ?? {}
  res.json(svc.checkAnswers(param(req, 'id'), { versionId: typeof b.versionId === 'string' ? b.versionId : null, answers: b.answers, auth: respondentAuth(req) }))
}))
publicRouter.post('/:id/submit', limited('submit', clientIp), limited('formSubmit', req => param(req, 'id')), wrap((req, res) => {
  const b = req.body ?? {}
  const result = svc.submitResponse(param(req, 'id'), { token: typeof b.token === 'string' ? b.token : null, versionId: typeof b.versionId === 'string' ? b.versionId : null, idempotencyKey: String(b.idempotencyKey ?? ''), answers: b.answers ?? {}, pagesVisited: b.pagesVisited, honeypot: typeof b.website === 'string' ? b.website : null, meta: respondentMeta(req), auth: respondentAuth(req), deviceId: deviceIdOf(b) })
  res.json(result)
}))
publicRouter.post('/:id/uploads', limited('upload', clientIp), wrap(async (req, res) => {
  const b = req.body ?? {}
  const proxyBase = typeof b.proxyBase === 'string' ? b.proxyBase.slice(0, 500) : '/api/public/forms/uploads'
  const grant = await svc.createUpload(param(req, 'id'), { token: typeof b.token === 'string' ? b.token : null, versionId: typeof b.versionId === 'string' ? b.versionId : null, blockId: String(b.blockId ?? ''), name: String(b.name ?? ''), size: Number(b.size), mime: String(b.mime ?? ''), proxyUrlFor: (fileId, uploadToken) => `${proxyBase}/${fileId}/bytes?t=${uploadToken}`, auth: respondentAuth(req) })
  res.status(201).json(grant)
}))
publicRouter.post('/uploads/:fid/complete', limited('upload', clientIp), wrap(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  res.json(await svc.completeUpload(param(req, 'fid'), token))
}))
publicRouter.delete('/uploads/:fid', wrap(async (req, res) => {
  const token = typeof req.query.t === 'string' ? req.query.t : ''
  await svc.cancelUpload(param(req, 'fid'), token)
  res.json({ ok: true })
}))

formsRouter.use('/public', publicRouter)

/** The raw-body upload route must sit BEFORE express.json() so the bytes are
 *  never parsed; mountFormsRaw is called from createApiServer ahead of the parser. */
export function mountFormsRaw(app: express.Express): void {
  app.put('/api/forms/public/uploads/:fid/bytes', (req, res, next) => {
    // This mount sits ahead of the shared-secret gate (so the JSON parser never
    // sees the bytes), so it checks the secret itself before reading a byte.
    const expected = process.env.FORMS_INTERNAL_SECRET || ''
    const provided = req.get('x-forms-secret') || ''
    if (!expected || provided.length !== expected.length || !timingSafeEqualStr(provided, expected)) { res.status(401).json({ error: 'unauthorized' }); return }
    const token = typeof req.query.t === 'string' ? req.query.t : ''
    Promise.resolve(svc.receiveUploadBytes(param(req, 'fid'), token, req, req.get('content-type') || undefined))
      .then(out => res.json(out))
      .catch(async err => {
        // Refusing a body that is still streaming in leaves the socket in a
        // state a pooled client trips over on its NEXT request. Drain the rest
        // (up to a hard ceiling) before answering, so the connection ends clean.
        await drain(req, 8 * 1024 * 1024, 30_000)
        res.setHeader('connection', 'close')
        if (err instanceof ServiceError) { res.status(err.status).json({ error: err.message, ...err.body }) }
        else { formsLog.error('upload_bytes_error', err, { file: param(req, 'fid') }); res.status(500).json({ error: 'internal error' }) }
      })
    void next
  })
}

function drain(req: Request, maxBytes: number, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    if (req.readableEnded || req.destroyed) { resolve(); return }
    let seen = 0
    const done = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => { req.destroy(); done() }, timeoutMs)
    req.on('data', (chunk: Buffer) => { seen += chunk.length; if (seen > maxBytes) { req.destroy(); done() } })
    req.on('end', done); req.on('close', done); req.on('error', done)
    req.resume()
  })
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
