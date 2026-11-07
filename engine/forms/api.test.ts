// The HTTP layer end to end: the real express app from createApiServer(),
// the shared-secret gate, the forms routes, rate limiting and the raw upload
// mount. Runs on an in-memory database and the local storage driver.
process.env.DB_PATH = ':memory:'
process.env.FORMS_STORAGE = 'local'
process.env.FORMS_STORAGE_DIR = `/tmp/forms-api-test-${process.pid}`
process.env.FORMS_MAINTENANCE = '0'
process.env.FORMS_INTERNAL_SECRET = 'test-secret'

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { seedComplexForm } from './core/index'

let server: Server
let base = ''
const H = { 'content-type': 'application/json', 'x-forms-secret': 'test-secret', 'x-forms-user': 'owner@example.com' }
const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = H) => {
  const res = await fetch(`${base}${path}`, { method, headers, body: (body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)) as BodyInit | undefined })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers }
}

before(async () => {
  const { createApiServer } = await import('../api/index.js')
  const app = createApiServer()
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(() => { server?.close() })

test('every forms route is behind the shared secret', async () => {
  assert.equal((await api('GET', '/api/forms', undefined, {})).status, 401)
  assert.equal((await api('POST', '/api/forms/public/frm_x/submit', {}, { 'content-type': 'application/json' })).status, 401)
  const res = await fetch(`${base}/api/forms/public/uploads/fil_x/bytes?t=abc`, { method: 'PUT', body: 'x' })
  assert.equal(res.status, 401)
})

test('builder flow over HTTP: create, save draft (409 on stale), publish, public read, submit, results, csv', async () => {
  const created = await api('POST', '/api/forms', { title: 'HTTP form', definition: seedComplexForm() })
  assert.equal(created.status, 201)
  const id = created.json.id as string
  const detail = await api('GET', `/api/forms/${id}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.json.revision, 1)
  const def = detail.json.draft
  def.title = 'HTTP form v2'
  const saved = await api('PUT', `/api/forms/${id}/draft`, { definition: def, baseRevision: 1 })
  assert.equal(saved.status, 200); assert.equal(saved.json.revision, 2)
  // Never published yet, so the generated link followed the new name.
  assert.equal(detail.json.slug, 'http-form'); assert.equal(saved.json.slug, 'http-form-v2')
  const stale = await api('PUT', `/api/forms/${id}/draft`, { definition: def, baseRevision: 1 })
  assert.equal(stale.status, 409); assert.equal(stale.json.conflict, true); assert.equal(stale.json.revision, 2)
  const bad = await api('PUT', `/api/forms/${id}/draft`, { definition: { nope: true }, baseRevision: 2 })
  assert.equal(bad.status, 400)
  const published = await api('POST', `/api/forms/${id}/publish`, { baseRevision: 2 })
  assert.equal(published.status, 200); assert.equal(published.json.version.number, 1)
  const slug = saved.json.slug as string
  const pub = await api('GET', `/api/forms/public/by-slug/${slug}`)
  assert.equal(pub.status, 200); assert.equal(pub.json.status, 'live'); assert.equal(pub.json.definition.title, 'HTTP form v2')
  const p0 = pub.json.definition.pages[0].blocks, p1 = pub.json.definition.pages[1].blocks
  const answers = { [p0[2].id]: 'Ada', [p0[3].id]: 'L', [p0[4].id]: 'ada@x.co', [p0[6].id]: 'AE', [p0[7].id]: p0[7].options[4].id, [p1[0].id]: p1[0].options[0].id, [p1[1].id]: 'fix' }
  const draft = await api('POST', `/api/forms/public/${id}/draft`, { answers: { [p0[2].id]: 'Ada' }, currentPageId: pub.json.definition.pages[0].id })
  assert.equal(draft.status, 200); assert.ok(draft.json.token)
  const submitted = await api('POST', `/api/forms/public/${id}/submit`, { token: draft.json.token, idempotencyKey: 'http-key-000001', answers, meta: { referrer: 'https://example.com' } })
  assert.equal(submitted.status, 200); assert.equal(submitted.json.status, 'completed'); assert.equal(submitted.json.duplicate, false)
  const twice = await api('POST', `/api/forms/public/${id}/submit`, { token: draft.json.token, idempotencyKey: 'http-key-000001', answers })
  assert.equal(twice.json.duplicate, true)
  const invalid = await api('POST', `/api/forms/public/${id}/submit`, { idempotencyKey: 'http-key-000002', answers: { [p0[4].id]: 'bad' } })
  assert.equal(invalid.status, 422); assert.ok(invalid.json.errors[p0[4].id])
  const list = await api('GET', `/api/forms/${id}/responses?status=all&q=ada`)
  assert.equal(list.status, 200); assert.equal(list.json.total, 1)
  const one = await api('GET', `/api/forms/${id}/responses/${submitted.json.submissionId}`)
  assert.equal(one.status, 200); assert.equal(one.json.summary.endingName, 'Enterprise — we call you')
  const csvRes = await fetch(`${base}/api/forms/${id}/responses.csv`, { headers: H })
  const csvBytes = Buffer.from(await csvRes.arrayBuffer())
  assert.equal(csvRes.status, 200)
  assert.deepEqual([...csvBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'utf-8 BOM for Excel')
  const csvText = csvBytes.toString('utf8').slice(1)
  assert.ok(csvText.startsWith('Response ID')); assert.ok(csvText.includes('ada@x.co'))
  assert.equal(csvRes.headers.get('content-type'), 'text/csv; charset=utf-8')
  const other = await api('GET', `/api/forms/frm_nope/responses/${submitted.json.submissionId}`)
  assert.equal(other.status, 404, 'a response is only reachable through its own form')
  const closed = await api('POST', `/api/forms/${id}/close`)
  assert.equal(closed.json.publishState, 'closed')
  const pubClosed = await api('GET', `/api/forms/public/by-slug/${slug}`)
  assert.equal(pubClosed.json.status, 'closed')
  const blocked = await api('POST', `/api/forms/public/${id}/submit`, { idempotencyKey: 'http-key-000003', answers })
  assert.equal(blocked.status, 410)
  assert.equal((await api('POST', `/api/forms/${id}/reopen`)).json.publishState, 'live')
})

test('raw upload route stores bytes through the proxy transport and enforces the size cap', async () => {
  const created = await api('POST', '/api/forms', { title: 'Upload form', definition: seedComplexForm() })
  const id = created.json.id as string
  await api('POST', `/api/forms/${id}/publish`, {})
  const upload = created.json.draft.pages[2].blocks[4]
  const grant = await api('POST', `/api/forms/public/${id}/uploads`, { blockId: upload.id, name: 'doc.pdf', size: 4, mime: 'application/pdf', proxyBase: '/api/public/forms/uploads' })
  assert.equal(grant.status, 201)
  assert.equal(grant.json.url, `/api/public/forms/uploads/${grant.json.fileId}/bytes?t=${grant.json.uploadToken}`)
  const put = await fetch(`${base}/api/forms/public/uploads/${grant.json.fileId}/bytes?t=${grant.json.uploadToken}`, { method: 'PUT', headers: { 'x-forms-secret': 'test-secret', 'content-type': 'application/pdf' }, body: 'abcd' })
  assert.equal(put.status, 200)
  const badToken = await fetch(`${base}/api/forms/public/uploads/${grant.json.fileId}/bytes?t=wrong`, { method: 'PUT', headers: { 'x-forms-secret': 'test-secret' }, body: 'abcd' })
  assert.equal(badToken.status, 404)
  const done = await api('POST', `/api/forms/public/uploads/${grant.json.fileId}/complete`, { token: grant.json.uploadToken })
  assert.equal(done.status, 200); assert.equal(done.json.status, 'uploaded'); assert.equal(done.json.size, 4)
  const big = await api('POST', `/api/forms/public/${id}/uploads`, { blockId: upload.id, name: 'big.pdf', size: 1024, mime: 'application/pdf' })
  assert.equal(big.status, 201)
  const tooBig = await fetch(`${base}/api/forms/public/uploads/${big.json.fileId}/bytes?t=${big.json.uploadToken}`, { method: 'PUT', headers: { 'x-forms-secret': 'test-secret' }, body: Buffer.alloc(26 * 1024 * 1024) })
  assert.equal(tooBig.status, 413)
  const file = await api('GET', `/api/forms/${id}/files/${grant.json.fileId}`)
  assert.equal(file.status, 200); assert.equal(file.text, 'abcd')
})

test('rate limiting answers 429 once a client burns its budget', async () => {
  const created = await api('POST', '/api/forms', { title: 'Rate form', definition: seedComplexForm() })
  const id = created.json.id as string
  await api('POST', `/api/forms/${id}/publish`, {})
  let last = 200
  for (let i = 0; i < 45 && last !== 429; i++) {
    last = (await api('POST', `/api/forms/public/${id}/submit`, { idempotencyKey: `rate-${i}-000000`, answers: {} }, { ...H, 'x-forms-client-ip': '203.0.113.9' })).status
  }
  assert.equal(last, 429)
  const otherClient = await api('POST', `/api/forms/public/${id}/submit`, { idempotencyKey: 'rate-other-0000', answers: {} }, { ...H, 'x-forms-client-ip': '203.0.113.10' })
  assert.notEqual(otherClient.status, 429, 'limits are per client')
})

test('malformed bodies and unsupported methods fail cleanly', async () => {
  const res = await fetch(`${base}/api/forms`, { method: 'POST', headers: { ...H }, body: '{not json' })
  assert.ok(res.status === 400 || res.status === 500)
  assert.equal((await api('PATCH', '/api/forms/frm_missing', { title: 'x' })).status, 404)
  assert.equal((await api('GET', '/api/forms/frm_missing')).status, 404)
  assert.equal((await api('GET', '/api/forms/public/frm_missing/draft?token=abc')).status, 404)
})

test('workspace routes are not read as form ids, and a form moves through folders, settings and archive over HTTP', async () => {
  for (const path of ['/api/forms/folders', '/api/forms/templates', '/api/forms/workspace', '/api/forms/responses', '/api/forms/responses/unread']) {
    const r = await api('GET', path)
    assert.equal(r.status, 200, path)
  }
  const folder = await api('POST', '/api/forms/folders', { name: 'HTTP folder' })
  assert.equal(folder.status, 201)
  const made = await api('POST', '/api/forms/templates/builtin-contact/use', { title: 'From template', folderId: folder.json.id })
  assert.equal(made.status, 201)
  assert.equal(made.json.folderId, folder.json.id)
  const settings = await api('PATCH', `/api/forms/${made.json.id}/settings`, { name: 'Internal', ops: { maxResponses: 10 } })
  assert.equal(settings.json.name, 'Internal')
  assert.equal(settings.json.ops.maxResponses, 10)
  assert.equal((await api('PATCH', `/api/forms/${made.json.id}/settings`, { ops: { maxResponses: -1 } })).status, 400)
  assert.equal((await api('POST', `/api/forms/${made.json.id}/archive`)).json.archivedAt !== null, true)
  assert.ok((await api('GET', '/api/forms?archived=1')).json.forms.some((f: any) => f.id === made.json.id))
  assert.equal((await api('POST', `/api/forms/${made.json.id}/restore`)).json.archivedAt, null)
  assert.equal((await api('GET', `/api/forms/${made.json.id}/report`)).status, 200)
  assert.deepEqual((await api('GET', `/api/forms/${made.json.id}/notifications`)).json, { notifications: [] })
})

test('the public door over HTTP: password unlock, the token header, sign-in header and rate-limited guessing', async () => {
  const def = seedComplexForm()
  const created = await api('POST', '/api/forms', { title: 'Locked over HTTP', definition: def })
  const id = created.json.id as string
  await api('PATCH', `/api/forms/${id}/settings`, { ops: { password: 'letmein' } })
  const pub = await api('POST', `/api/forms/${id}/publish`, {})
  const P = { 'content-type': 'application/json', 'x-forms-secret': 'test-secret', 'x-forms-client-ip': '198.51.100.9' }
  assert.equal((await api('GET', `/api/forms/public/by-slug/${pub.json.slug}`, undefined, P)).json.status, 'locked')
  const wrong = await api('POST', `/api/forms/public/${id}/unlock`, { password: 'nope' }, P)
  assert.equal(wrong.status, 403)
  const right = await api('POST', `/api/forms/public/${id}/unlock`, { password: 'letmein' }, P)
  assert.equal(right.status, 200)
  assert.equal(right.json.form.status, 'live')
  const withToken = await api('GET', `/api/forms/public/by-slug/${pub.json.slug}`, undefined, { ...P, 'x-forms-form-unlock': right.json.token })
  assert.equal(withToken.json.status, 'live')
  const draftNoToken = await api('POST', `/api/forms/public/${id}/draft`, { answers: {} }, P)
  assert.equal(draftNoToken.status, 403)
  assert.equal(draftNoToken.json.locked, true)
  const draft = await api('POST', `/api/forms/public/${id}/draft`, { answers: {} }, { ...P, 'x-forms-form-unlock': right.json.token })
  assert.equal(draft.status, 200)
  let limited = 0
  for (let i = 0; i < 12; i++) if ((await api('POST', `/api/forms/public/${id}/unlock`, { password: `guess-${i}` }, { ...P, 'x-forms-client-ip': '198.51.100.10' })).status === 429) limited++
  assert.ok(limited >= 2, 'guessing is rate limited')

  await api('PATCH', `/api/forms/${id}/settings`, { ops: { password: null, access: 'restricted' } })
  assert.equal((await api('GET', `/api/forms/public/by-slug/${pub.json.slug}`, undefined, P)).json.status, 'signin')
  assert.equal((await api('GET', `/api/forms/public/by-slug/${pub.json.slug}`, undefined, { ...P, 'x-forms-respondent': 'teammate@example.com' })).json.respond.respondent, 'teammate@example.com')
})

test('builder images and the workspace logo upload with PUT as well as POST (GRYD MCP one-time links PUT)', async () => {
  const created = await api('POST', '/api/forms', { title: 'Image form' })
  const id = created.json.id as string
  const png = Buffer.from('89504e470d0a1a0a', 'hex')
  const up = (path: string, method: string, name: string) => api(method, path, png, { 'x-forms-secret': 'test-secret', 'content-type': 'application/octet-stream', 'x-file-name': name })
  for (const method of ['POST', 'PUT']) {
    const asset = await up(`/api/forms/${id}/assets`, method, 'logo.png')
    assert.equal(asset.status, 201, method); assert.match(asset.json.url, /^\/api\/public\/forms\/assets\/ast_/); assert.equal(asset.json.size, png.length)
    const logo = await up('/api/forms/workspace/assets', method, 'mark.png')
    assert.equal(logo.status, 201, method); assert.equal(logo.json.mime, 'image/png')
  }
  assert.equal((await up(`/api/forms/${id}/assets`, 'PUT', 'notes.txt')).status, 422, 'images only')
  assert.equal((await up('/api/forms/frm_missing/assets', 'PUT', 'a.png')).status, 404)
})
