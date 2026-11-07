process.env.DB_PATH = ':memory:'
process.env.FORMS_STORAGE = 'local'
process.env.FORMS_STORAGE_DIR = `/tmp/forms-test-${process.pid}`
process.env.FORMS_MAINTENANCE = '0'

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import * as svc from './service'
import * as repo from './repo'
import { seedComplexForm, emptyForm, newBlock, makeOptions, SCHEMA_VERSION, definitionHash } from './core/index'
import { getDb } from '../db/index.js'

const meta = { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/128.0 Safari/537.36', acceptLanguage: 'en-GB' }

function liveSeed() {
  const form = svc.createForm({ title: 'Blueprint', definition: seedComplexForm(), createdBy: 'owner@example.com' })
  const pub = svc.publishForm(form.id, { by: 'owner@example.com' })
  return { form: svc.getFormDetail(form.id), version: pub.version }
}

test('create → list → detail → duplicate → delete', () => {
  const f = svc.createForm({ title: 'Lead capture', createdBy: 'owner@example.com' })
  assert.match(f.id, /^frm_/)
  assert.equal(f.slug, 'lead-capture')
  assert.equal(f.publishState, 'draft')
  assert.equal(f.revision, 1)
  const again = svc.createForm({ title: 'Lead capture', createdBy: null })
  assert.notEqual(again.slug, f.slug, 'slugs stay unique')
  const list = svc.listForms()
  assert.ok(list.some(x => x.id === f.id))
  const dup = svc.duplicateForm(f.id, 'owner@example.com')
  assert.equal(dup.title, 'Lead capture copy')
  svc.deleteForm(f.id, 'owner@example.com')
  assert.throws(() => svc.getFormDetail(f.id), /not found/)
  assert.ok(!svc.listForms().some(x => x.id === f.id))
})

test('draft saves use optimistic concurrency: a stale revision never overwrites', () => {
  const f = svc.createForm({ title: 'OCC', createdBy: null })
  const defA = { ...f.draft, title: 'Tab A' }
  const a = svc.saveDraft(f.id, { definition: defA, baseRevision: 1, by: 'a@example.com' })
  assert.equal(a.ok, true)
  if (a.ok) assert.equal(a.revision, 2)
  const defB = { ...f.draft, title: 'Tab B' }
  const b = svc.saveDraft(f.id, { definition: defB, baseRevision: 1, by: 'b@example.com' })
  assert.equal(b.ok, false)
  if (!b.ok) { assert.equal(b.revision, 2); assert.equal(b.definition.title, 'Tab A'); assert.equal(b.updatedBy, 'a@example.com') }
  assert.equal(svc.getFormDetail(f.id).title, 'Tab A')
  const b2 = svc.saveDraft(f.id, { definition: defB, baseRevision: 2, by: 'b@example.com' })
  assert.equal(b2.ok, true)
  assert.equal(svc.getFormDetail(f.id).draft.title, 'Tab B')
})

test('an invalid definition is rejected with issues, not stored', () => {
  const f = svc.createForm({ title: 'Bad', createdBy: null })
  assert.throws(() => svc.saveDraft(f.id, { definition: { schemaVersion: SCHEMA_VERSION, pages: [] }, baseRevision: 1, by: null }), (err: any) => err.status === 400 && Array.isArray(err.body.issues))
  assert.throws(() => svc.saveDraft(f.id, { definition: 'nope', baseRevision: 1, by: null }), /definition required/)
})

test('publishing creates an immutable version; editing marks changes not published; publishing again makes a new version', () => {
  const { form, version } = liveSeed()
  assert.equal(form.publishState, 'live')
  assert.equal(version.number, 1)
  assert.equal(svc.publishForm(form.id, { by: null }).version.id, version.id, 'republishing an unchanged draft is a no-op')
  const draft = svc.getFormDetail(form.id).draft
  draft.pages[0].blocks[2].label = 'Given name'
  const saved = svc.saveDraft(form.id, { definition: draft, baseRevision: form.revision, by: null })
  assert.equal(saved.ok && saved.publishState, 'dirty')
  const pub2 = svc.publishForm(form.id, { by: null })
  assert.equal(pub2.version.number, 2)
  const v1 = svc.getVersionDefinition(form.id, version.id)
  assert.equal(v1.definition.pages[0].blocks[2].label, 'First name', 'version 1 is untouched')
  assert.equal(svc.getPublicForm(form.slug).status, 'live')
  const pub = svc.getPublicForm(form.slug)
  if (pub.status === 'live') assert.equal(pub.definition.pages[0].blocks[2].label, 'Given name')
})

test('publishing refuses broken rules and empty forms; close/reopen serve the closed message', () => {
  const f = svc.createForm({ title: 'Empty', createdBy: null })
  assert.throws(() => svc.publishForm(f.id, { by: null }), (e: any) => e.status === 422)
  const seed = seedComplexForm()
  seed.pages.splice(2, 1)
  const broken = svc.createForm({ title: 'Broken', definition: seed, createdBy: null })
  assert.throws(() => svc.publishForm(broken.id, { by: null }), (e: any) => e.status === 422 && e.body.issues.length > 0)
  const { form } = liveSeed()
  assert.throws(() => svc.closeForm(f.id, null), /publish/)
  svc.patchForm(form.id, { closedMessage: 'Back next week.', by: null })
  const closed = svc.closeForm(form.id, null)
  assert.equal(closed.publishState, 'closed')
  const pub = svc.getPublicForm(form.slug)
  assert.equal(pub.status, 'closed')
  if (pub.status === 'closed') assert.equal(pub.closedMessage, 'Back next week.')
  assert.throws(() => svc.saveRespondentDraft(form.id, { answers: {}, meta }), (e: any) => e.status === 410)
  assert.equal(svc.reopenForm(form.id, null).publishState, 'live')
  assert.equal(svc.getPublicForm('does-not-exist').status, 'unavailable')
})

test('respondent draft: start, autosave, resume, hidden answers stripped, then complete transitions the same row', () => {
  const { form } = liveSeed()
  const def = form.draft
  const first = def.pages[0].blocks[2], last = def.pages[0].blocks[3], email = def.pages[0].blocks[4], company = def.pages[0].blocks[6], size = def.pages[0].blocks[7]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const teams = def.pages[2].blocks[1]
  const started = svc.saveRespondentDraft(form.id, { answers: { [first.id]: 'Ada' }, currentPageId: def.pages[0].id, meta })
  assert.match(started.submissionId, /^rsp_/)
  assert.ok(started.token && started.token.length >= 40)
  assert.equal(started.status, 'partial')
  const again = svc.saveRespondentDraft(form.id, { token: started.token, answers: { [first.id]: 'Ada', [size.id]: size.options[0].id, [teams.id]: 12 }, currentPageId: def.pages[1].id, pagesVisited: [def.pages[0].id], meta })
  assert.equal(again.submissionId, started.submissionId)
  assert.equal(again.token, null, 'the token is only ever returned once')
  const resumed = svc.getRespondentDraft(form.id, started.token!)
  assert.equal(resumed.answers[first.id], 'Ada')
  assert.equal(resumed.answers[teams.id], undefined, 'an answer on a page hidden by logic is not kept')
  assert.equal(resumed.currentPageId, def.pages[1].id)
  const partials = svc.listResponses(form.id, { status: 'partial' })
  assert.equal(partials.total, 1)
  assert.equal(partials.rows[0].furthestPageName, 'Your work')
  assert.equal(partials.rows[0].cells[first.id], 'Ada')

  const answers = { [first.id]: 'Ada', [last.id]: 'Lovelace', [email.id]: 'ada@analytical.co', [company.id]: 'Analytical Engines', [size.id]: size.options[0].id, [role.id]: role.options[1].id, [fix.id]: 'Hand-offs' }
  const done = svc.submitResponse(form.id, { token: started.token, idempotencyKey: 'idem-key-1-00000000', answers, meta })
  assert.equal(done.submissionId, started.submissionId, 'partial → completed is the same row')
  assert.equal(done.status, 'completed')
  assert.equal(done.duplicate, false)
  assert.equal(done.endingId, def.endings[2].id, 'small company + operations → redirect ending')
  assert.equal(svc.listResponses(form.id, { status: 'partial' }).total, 0)
  const completed = svc.listResponses(form.id, { status: 'completed' })
  assert.equal(completed.total, 1)
  assert.equal(completed.counts.completed, 1)
  const detail = svc.getResponse(form.id, done.submissionId, {})
  assert.equal(detail.summary.endingName, 'Redirect to guides')
  assert.match(detail.endingRuleSentence!, /^When /)
  assert.ok(detail.events.map(e => e.kind).includes('submitted'))
  assert.ok(detail.summary.durationMs! >= 0)
})

test('submission is idempotent: same key or same token never makes a second response', () => {
  const { form } = liveSeed()
  const def = form.draft
  const [first, last, email, company, size] = [def.pages[0].blocks[2], def.pages[0].blocks[3], def.pages[0].blocks[4], def.pages[0].blocks[6], def.pages[0].blocks[7]]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const answers = { [first.id]: 'Grace', [last.id]: 'Hopper', [email.id]: 'grace@navy.mil', [company.id]: 'Navy', [size.id]: size.options[4].id, [role.id]: role.options[2].id, [fix.id]: 'COBOL' }
  const a = svc.submitResponse(form.id, { idempotencyKey: 'idem-dup-key-00000000', answers, meta })
  const b = svc.submitResponse(form.id, { idempotencyKey: 'idem-dup-key-00000000', answers, meta })
  const c = svc.submitResponse(form.id, { token: a.token, idempotencyKey: 'idem-other-key-00000000', answers, meta })
  assert.equal(a.duplicate, false)
  assert.equal(b.duplicate, true); assert.equal(b.submissionId, a.submissionId)
  assert.equal(c.duplicate, true); assert.equal(c.submissionId, a.submissionId)
  assert.equal(a.endingId, def.endings[1].id, '1,000+ → enterprise ending')
  assert.equal(svc.listResponses(form.id, {}).total, 1)
  assert.throws(() => svc.submitResponse(form.id, { idempotencyKey: 'x', answers, meta }), /idempotencyKey/)
})

test('server-side validation rejects a bad submission with per-field errors and stores nothing', () => {
  const { form } = liveSeed()
  const def = form.draft
  const email = def.pages[0].blocks[4]
  assert.throws(() => svc.submitResponse(form.id, { idempotencyKey: 'idem-bad-1-00000000', answers: { [email.id]: 'nope' }, meta }), (e: any) => e.status === 422 && e.body.errors[email.id] === 'That doesn’t look like an email address — check for a typo.' && e.body.pageId === def.pages[0].id)
  assert.equal(svc.listResponses(form.id, {}).total, 0)
})

test('honeypot submissions are stored as spam and never shown as responses', () => {
  const { form } = liveSeed()
  const def = form.draft
  const [first, last, email, company, size] = [def.pages[0].blocks[2], def.pages[0].blocks[3], def.pages[0].blocks[4], def.pages[0].blocks[6], def.pages[0].blocks[7]]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const answers = { [first.id]: 'Bot', [last.id]: 'Net', [email.id]: 'bot@spam.io', [company.id]: 'Spam', [size.id]: size.options[0].id, [role.id]: role.options[0].id, [fix.id]: 'x' }
  const r = svc.submitResponse(form.id, { idempotencyKey: 'idem-spam-1-00000000', answers, honeypot: 'http://spam', meta })
  assert.equal(r.status, 'spam')
  assert.equal(svc.listResponses(form.id, {}).total, 0)
  assert.equal(svc.listResponses(form.id, { status: 'spam' }).total, 1)
})

test('historical responses keep their meaning after rename, reorder and delete across three versions', () => {
  const { form } = liveSeed()
  const def1 = form.draft
  const [first, last, email, company, size] = [def1.pages[0].blocks[2], def1.pages[0].blocks[3], def1.pages[0].blocks[4], def1.pages[0].blocks[6], def1.pages[0].blocks[7]]
  const role = def1.pages[1].blocks[0], fix = def1.pages[1].blocks[1]
  const base = { [first.id]: 'Ada', [last.id]: 'L', [email.id]: 'a@b.co', [company.id]: 'AE', [role.id]: role.options[1].id, [fix.id]: 'x' }
  const r1 = svc.submitResponse(form.id, { idempotencyKey: 'idem-v1-00000000', answers: { ...base, [size.id]: size.options[2].id }, meta })
  // Version 2: rename options, reorder them, rename the question, delete the phone field, add a question.
  const d2 = svc.getFormDetail(form.id).draft
  const s2 = d2.pages[0].blocks.find(b => b.id === size.id)!
  s2.label = 'Team size'
  s2.options.reverse()
  s2.options.forEach(o => { o.label = `${o.label} staff` })
  d2.pages[0].blocks = d2.pages[0].blocks.filter(b => b.type !== 'phone')
  const extra = newBlock('short', { label: 'Where did you hear about us?' })
  d2.pages[0].blocks.push(extra)
  d2.theme.primary = '#111111'
  assert.equal(svc.saveDraft(form.id, { definition: d2, baseRevision: svc.getFormDetail(form.id).revision, by: null }).ok, true)
  const pub2 = svc.publishForm(form.id, { by: null })
  const r2 = svc.submitResponse(form.id, { idempotencyKey: 'idem-v2-00000000', answers: { ...base, [size.id]: size.options[2].id, [extra.id]: 'LinkedIn' }, meta })
  // Version 3: delete the size question entirely (and the rules that use it).
  const d3 = svc.getFormDetail(form.id).draft
  d3.pages[0].blocks = d3.pages[0].blocks.filter(b => b.id !== size.id)
  d3.rules = []
  assert.equal(svc.saveDraft(form.id, { definition: d3, baseRevision: svc.getFormDetail(form.id).revision, by: null }).ok, true)
  const pub3 = svc.publishForm(form.id, { by: null })
  const r3 = svc.submitResponse(form.id, { idempotencyKey: 'idem-v3-00000000', answers: { ...base, [extra.id]: 'Podcast' }, meta })
  assert.equal(pub3.version.number, 3)
  const list = svc.listResponses(form.id, {})
  const cell = (id: string, col: string) => list.rows.find(r => r.id === id)!.cells[col]
  assert.equal(cell(r1.submissionId, size.id), '51–200', 'v1 shows the label as it was')
  assert.equal(cell(r2.submissionId, size.id), '51–200 staff', 'v2 shows the renamed label — same option id')
  assert.equal(cell(r3.submissionId, size.id), undefined)
  assert.equal(cell(r3.submissionId, extra.id), 'Podcast')
  assert.ok(list.columns.some(c => c.id === size.id), 'a deleted question keeps its column for old responses')
  assert.equal(list.rows.find(r => r.id === r1.submissionId)!.versionNumber, 1)
  assert.equal(list.rows.find(r => r.id === r2.submissionId)!.versionNumber, pub2.version.number)
  assert.equal(svc.getResponse(form.id, r1.submissionId, {}).definition.pages[0].blocks.some(b => b.type === 'phone'), true, 'v1 detail renders with the v1 definition')
  assert.equal(svc.getResponse(form.id, r1.submissionId, {}).summary.endingName, 'Enterprise — we call you')
  const csv = [...svc.csvExport(form.id, {})].join('')
  assert.ok(csv.includes('51–200 staff') && csv.includes('51–200,') || csv.includes('"51–200"'), 'csv carries each version\'s own labels')
  assert.ok(csv.split('\r\n')[0].includes('Where did you hear about us?'))
})

test('search, filters, sort, pagination and neighbours', () => {
  const { form } = liveSeed()
  const def = form.draft
  const [first, last, email, company, size] = [def.pages[0].blocks[2], def.pages[0].blocks[3], def.pages[0].blocks[4], def.pages[0].blocks[6], def.pages[0].blocks[7]]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const names = ['Ada', 'Grace', 'Radia']
  const ids: string[] = []
  for (const n of names) ids.push(svc.submitResponse(form.id, { idempotencyKey: `idem-s-${n}-0000000`, answers: { [first.id]: n, [last.id]: 'X', [email.id]: `${n.toLowerCase()}@x.co`, [company.id]: 'Co', [size.id]: size.options[n === 'Ada' ? 4 : 1].id, [role.id]: role.options[1].id, [fix.id]: 'y' }, meta }).submissionId)
  assert.equal(svc.listResponses(form.id, { q: 'grace' }).total, 1)
  assert.equal(svc.listResponses(form.id, { q: 'x.co' }).total, 3)
  assert.equal(svc.listResponses(form.id, { answerFilters: [{ blockId: size.id, value: '1,000+' }] }).total, 1)
  assert.equal(svc.listResponses(form.id, { limit: 2 }).rows.length, 2)
  assert.equal(svc.listResponses(form.id, { limit: 2, offset: 2 }).rows.length, 1)
  const detail = svc.getResponse(form.id, ids[1], {})
  assert.equal(detail.neighbours.total, 3)
  assert.ok(detail.neighbours.prev && detail.neighbours.next)
  // Same-millisecond submissions are ordered newest-inserted first, and prev/next follow the table's sort.
  assert.deepEqual(svc.listResponses(form.id, {}).rows.map(r => r.id), [ids[2], ids[1], ids[0]])
  assert.deepEqual(svc.listResponses(form.id, { sort: 'submitted_asc' }).rows.map(r => r.id), [ids[0], ids[1], ids[2]])
  const asc = svc.getResponse(form.id, ids[0], { sort: 'submitted_asc' })
  assert.equal(asc.neighbours.prev, null)
  assert.equal(asc.neighbours.next, ids[1])
})

test('response deletion is soft, removes files, and is not undone by a resubmit', async () => {
  const { form } = liveSeed()
  const def = form.draft
  const [first, last, email, company, size] = [def.pages[0].blocks[2], def.pages[0].blocks[3], def.pages[0].blocks[4], def.pages[0].blocks[6], def.pages[0].blocks[7]]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const upload = def.pages[2].blocks[4]
  const answersBase = { [first.id]: 'F', [last.id]: 'L', [email.id]: 'f@l.co', [company.id]: 'C', [size.id]: size.options[3].id, [role.id]: role.options[0].id, [fix.id]: 'z' }
  const started = svc.saveRespondentDraft(form.id, { answers: answersBase, meta })
  const grant = await svc.createUpload(form.id, { token: started.token, blockId: upload.id, name: 'process.pdf', size: 11, mime: 'application/pdf', proxyUrlFor: (id, t) => `/up/${id}?t=${t}` })
  assert.equal(grant.transport, 'proxy')
  assert.throws(() => svc.submitResponse(form.id, { token: started.token, idempotencyKey: 'idem-up-1-00000000', answers: { ...answersBase, [upload.id]: [{ fileId: grant.fileId, name: 'process.pdf', size: 11, mime: 'application/pdf' }] }, meta }), (e: any) => e.status === 422 && e.body.errors[upload.id] === 'Wait for the upload to finish.')
  await svc.receiveUploadBytes(grant.fileId, grant.uploadToken, Readable.from(Buffer.from('hello world')), 'application/pdf')
  const done = await svc.completeUpload(grant.fileId, grant.uploadToken)
  assert.equal(done.status, 'uploaded'); assert.equal(done.size, 11)
  const sub = svc.submitResponse(form.id, { token: started.token, idempotencyKey: 'idem-up-1-00000000', answers: { ...answersBase, [upload.id]: [{ fileId: grant.fileId, name: 'process.pdf', size: 11, mime: 'application/pdf' }] }, meta })
  assert.equal(sub.status, 'completed')
  const detail = svc.getResponse(form.id, sub.submissionId, {})
  assert.equal(detail.files.length, 1)
  const dl = await svc.fileDownload(form.id, grant.fileId)
  assert.ok('stream' in dl && dl.size === 11)
  if ('stream' in dl) dl.stream.destroy()
  await assert.rejects(svc.fileDownload('frm_other', grant.fileId), /not found/)
  await svc.deleteResponse(form.id, sub.submissionId, 'owner@example.com')
  assert.throws(() => svc.getResponse(form.id, sub.submissionId, {}), /not found/)
  await assert.rejects(svc.fileDownload(form.id, grant.fileId), /not found/)
  assert.equal(fs.existsSync(`${process.env.FORMS_STORAGE_DIR}/forms/files/${form.id}/${grant.fileId}.pdf`), false)
})

test('uploads are gated by type and size, and a file from another form cannot be attached', async () => {
  const { form } = liveSeed()
  const upload = form.draft.pages[2].blocks[4]
  await assert.rejects(svc.createUpload(form.id, { blockId: upload.id, name: 'evil.exe', size: 5, mime: 'x', proxyUrlFor: () => '' }), (e: any) => e.status === 422)
  await assert.rejects(svc.createUpload(form.id, { blockId: upload.id, name: 'big.pdf', size: 26 * 1024 * 1024, mime: 'x', proxyUrlFor: () => '' }), (e: any) => e.status === 422)
  await assert.rejects(svc.createUpload(form.id, { blockId: 'b_nope', name: 'a.pdf', size: 5, mime: 'x', proxyUrlFor: () => '' }), /unknown upload field/)
  const grant = await svc.createUpload(form.id, { blockId: upload.id, name: 'ok.pdf', size: 5, mime: 'application/pdf', proxyUrlFor: (id, t) => `/up/${id}?t=${t}` })
  await assert.rejects(svc.completeUpload(grant.fileId, 'wrong-token'), /not found/)
  await assert.rejects(svc.completeUpload(grant.fileId, grant.uploadToken), (e: any) => e.status === 409, 'no bytes yet')
  const other = liveSeed()
  const def = other.form.draft
  const [first, last, email, company, size] = [def.pages[0].blocks[2], def.pages[0].blocks[3], def.pages[0].blocks[4], def.pages[0].blocks[6], def.pages[0].blocks[7]]
  const role = def.pages[1].blocks[0], fix = def.pages[1].blocks[1]
  const otherUpload = def.pages[2].blocks[4]
  const answers = { [first.id]: 'F', [last.id]: 'L', [email.id]: 'f@l.co', [company.id]: 'C', [size.id]: size.options[3].id, [role.id]: role.options[0].id, [fix.id]: 'z', [otherUpload.id]: [{ fileId: grant.fileId, name: 'ok.pdf', size: 5, mime: 'application/pdf' }] }
  assert.throws(() => svc.submitResponse(other.form.id, { idempotencyKey: 'idem-cross-00000000', answers, meta }), (e: any) => e.status === 422 && e.body.errors[otherUpload.id] === 'This file didn’t upload. Retry or remove it.')
})

// ── QA 2026-09-24: sessions belong to the version they started on ────────────

/** A one-page form with a choice whose last option the owner later removes. */
function choiceForm(title: string) {
  const def = emptyForm(title)
  const name = newBlock('short', { label: 'Name', required: true })
  const pick = newBlock('choice', { label: 'Pick one', required: true, options: makeOptions(['Alpha', 'Beta', 'Other']) })
  def.pages[0].blocks = [name, pick]
  const form = svc.createForm({ title, definition: def, createdBy: null })
  const v1 = svc.publishForm(form.id, { by: null }).version
  return { form, name, pick, other: pick.options[2], v1 }
}
function dropOptionAndPublish(formId: string, blockId: string, optionId: string) {
  const d = svc.getFormDetail(formId)
  const draft = d.draft
  const b = draft.pages[0].blocks.find(x => x.id === blockId)!
  b.options = b.options.filter(o => o.id !== optionId)
  svc.saveDraft(formId, { definition: draft, baseRevision: d.revision, by: null })
  return svc.publishForm(formId, { by: null }).version
}
function supersededDaysAgo(versionId: string, days: number) {
  getDb().prepare('UPDATE form_versions SET published_at = ? WHERE id = ?').run(new Date(Date.now() - days * 86400_000).toISOString(), versionId)
}

test('a publish mid-session: the open page submits against the version it was loaded with', () => {
  const { form, name, pick, other, v1 } = choiceForm('Mid-session submit')
  const started = svc.saveRespondentDraft(form.id, { versionId: v1.id, answers: { [name.id]: 'Pat' }, meta })
  const v2 = dropOptionAndPublish(form.id, pick.id, other.id)
  assert.notEqual(v2.id, v1.id)
  // The page still shows v1: its autosave and its submit run against v1, so "Other" is still a real answer.
  const saved = svc.saveRespondentDraft(form.id, { token: started.token, versionId: v1.id, answers: { [name.id]: 'Pat', [pick.id]: other.id }, meta })
  assert.equal(saved.versionId, v1.id)
  assert.equal(svc.getRespondentDraft(form.id, started.token!).answers[pick.id], other.id)
  const done = svc.submitResponse(form.id, { token: started.token, versionId: v1.id, idempotencyKey: 'mid-session-0001', answers: { [name.id]: 'Pat', [pick.id]: other.id }, meta })
  assert.equal(done.status, 'completed')
  assert.equal(done.submissionId, started.submissionId, 'the same row completes: no stray partial')
  const list = svc.listResponses(form.id, { status: 'all' })
  assert.equal(list.counts.partial, 0)
  assert.equal(list.rows[0].versionNumber, 1)
  assert.equal(list.rows[0].cells[pick.id], 'Other', 'Results read the answer with the version it was given in')
})

test('a first save after a publish starts the session on the version the page is showing', () => {
  const { form, name, pick, other, v1 } = choiceForm('First save after publish')
  dropOptionAndPublish(form.id, pick.id, other.id)
  const started = svc.saveRespondentDraft(form.id, { versionId: v1.id, answers: { [name.id]: 'Kim', [pick.id]: other.id }, meta })
  assert.equal(started.versionId, v1.id)
  assert.equal(svc.getRespondentDraft(form.id, started.token!).answers[pick.id], other.id, 'the answer is kept, not dropped against v2')
  assert.equal(svc.getSessionVersion(form.id, v1.id).status, 'live', 'a refresh can resume on v1')
})

test('an older page without a version keeps using its session version; a session moves when its page does', () => {
  const { form, name, pick, other, v1 } = choiceForm('Session moves')
  const started = svc.saveRespondentDraft(form.id, { answers: { [name.id]: 'Ada' }, meta })
  assert.equal(started.versionId, v1.id)
  const v2 = dropOptionAndPublish(form.id, pick.id, other.id)
  assert.equal(svc.saveRespondentDraft(form.id, { token: started.token, answers: { [name.id]: 'Ada L' }, meta }).versionId, v1.id, 'no versionId: the session stays on its own version')
  assert.equal(svc.getRespondentDraft(form.id, started.token!).answers[name.id], 'Ada L')
  // The respondent's page carried the answers onto v2 (their version was retired): the partial moves with them.
  const moved = svc.saveRespondentDraft(form.id, { token: started.token, versionId: v2.id, answers: { [name.id]: 'Ada L', [pick.id]: other.id }, meta })
  assert.equal(moved.versionId, v2.id)
  const row = svc.getRespondentDraft(form.id, started.token!)
  assert.equal(row.versionId, v2.id)
  assert.equal(row.answers[name.id], 'Ada L')
  assert.equal(svc.listResponses(form.id, { status: 'partial' }).total, 1, 'one session, one row')
  assert.ok(svc.getResponse(form.id, started.submissionId, {}).events.some(e => e.kind === 'version_moved'))
  // An option v2 does not have is refused on the field, by name, never as a generic failure.
  assert.throws(() => svc.submitResponse(form.id, { token: started.token, versionId: v2.id, idempotencyKey: 'moved-000000001', answers: { [name.id]: 'Ada L', [pick.id]: other.id }, meta }),
    (e: any) => e.status === 422 && e.body.errors[pick.id] === 'Choose one of the listed options.' && e.body.pageId === svc.getFormDetail(form.id).draft.pages[0].id)
})

test('a version superseded more than seven days ago is retired: 409 versionChanged, and the lookup says moved', () => {
  const { form, name, pick, other, v1 } = choiceForm('Retired version')
  const started = svc.saveRespondentDraft(form.id, { versionId: v1.id, answers: { [name.id]: 'Lee' }, meta })
  const v2 = dropOptionAndPublish(form.id, pick.id, other.id)
  supersededDaysAgo(v2.id, 8)
  assert.throws(() => svc.submitResponse(form.id, { token: started.token, versionId: v1.id, idempotencyKey: 'retired-00000001', answers: { [name.id]: 'Lee', [pick.id]: other.id }, meta }),
    (e: any) => e.status === 409 && e.body.versionChanged === true && e.body.liveVersion.id === v2.id)
  const lookup = svc.getSessionVersion(form.id, v1.id)
  assert.deepEqual(lookup, { status: 'moved', live: { id: v2.id, number: 2 } })
  assert.equal(svc.getSessionVersion(form.id, 'ver_not_this_forms').status, 'moved')
  assert.throws(() => svc.saveRespondentDraft(form.id, { versionId: 'ver_not_this_forms', answers: {}, meta }), (e: any) => e.status === 409)
  // Moving to the live version works, and completes the same session.
  const done = svc.submitResponse(form.id, { token: started.token, versionId: v2.id, idempotencyKey: 'retired-00000002', answers: { [name.id]: 'Lee', [pick.id]: pick.options[0].id }, meta })
  assert.equal(done.submissionId, started.submissionId)
  assert.equal(svc.listResponses(form.id, { status: 'all' }).rows[0].versionNumber, 2)
})

test('closed and unpublished still stop a session on any version', () => {
  const { form, name, pick, other, v1 } = choiceForm('Closed stops all')
  dropOptionAndPublish(form.id, pick.id, other.id)
  svc.closeForm(form.id, null)
  assert.throws(() => svc.submitResponse(form.id, { versionId: v1.id, idempotencyKey: 'closed-00000001', answers: { [name.id]: 'X', [pick.id]: other.id }, meta }), (e: any) => e.status === 410)
  assert.throws(() => svc.getSessionVersion(form.id, v1.id), (e: any) => e.status === 410)
  svc.reopenForm(form.id, null)
  svc.unpublishForm(form.id, null)
  assert.throws(() => svc.saveRespondentDraft(form.id, { versionId: v1.id, answers: {}, meta }), (e: any) => e.status === 404)
})

test('publishing changes keeps a closed form closed; reopening is its own action', () => {
  const { form, pick, other } = choiceForm('Closed publish')
  svc.closeForm(form.id, null)
  assert.equal(svc.getFormDetail(form.id).unpublishedChanges, false)
  const d = svc.getFormDetail(form.id)
  const draft = d.draft
  draft.pages[0].blocks.find(b => b.id === pick.id)!.options = draft.pages[0].blocks.find(b => b.id === pick.id)!.options.filter(o => o.id !== other.id)
  const saved = svc.saveDraft(form.id, { definition: draft, baseRevision: d.revision, by: null })
  assert.equal(saved.ok && saved.publishState, 'closed')
  assert.equal(saved.ok && saved.unpublishedChanges, true)
  const pub = svc.publishForm(form.id, { by: null })
  assert.equal(pub.publishState, 'closed')
  assert.equal(pub.created, true)
  assert.equal(pub.version.number, 2)
  const after = svc.getFormDetail(form.id)
  assert.equal(after.status, 'closed')
  assert.equal(after.unpublishedChanges, false)
  assert.equal(after.live!.number, 2)
  assert.equal(svc.getPublicForm(form.slug).status, 'closed', 'the link keeps showing the closed message')
  const again = svc.publishForm(form.id, { by: null })
  assert.equal(again.created, false, 'nothing new to publish')
  assert.equal(svc.getFormDetail(form.id).status, 'closed')
  assert.equal(svc.reopenForm(form.id, null).publishState, 'live')
  assert.equal(svc.getPublicForm(form.slug).status, 'live')
})

test('patchForm validates slugs and keeps them unique', () => {
  const a = svc.createForm({ title: 'A', createdBy: null }), b = svc.createForm({ title: 'B', createdBy: null })
  assert.throws(() => svc.patchForm(a.id, { slug: 'Bad Slug!', by: null }), /lowercase/)
  assert.throws(() => svc.patchForm(a.id, { slug: 'api', by: null }), /lowercase/)
  assert.throws(() => svc.patchForm(a.id, { slug: b.slug, by: null }), /taken/)
  assert.equal(svc.patchForm(a.id, { slug: 'my-form', by: null }).slug, 'my-form')
  assert.equal(svc.patchForm(a.id, { title: 'Renamed', by: null }).draft.title, 'Renamed')
})

test('sweep removes stale pending files and empty partials', async () => {
  const { form } = liveSeed()
  const upload = form.draft.pages[2].blocks[4]
  const grant = await svc.createUpload(form.id, { blockId: upload.id, name: 'ok.pdf', size: 5, mime: 'application/pdf', proxyUrlFor: () => '' })
  const started = svc.saveRespondentDraft(form.id, { answers: {}, meta })
  repo.updateFile(grant.fileId, {})
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  // Age the rows by hand — the sweeper only reads timestamps.
  const { getDb } = await import('../db/index.js')
  getDb().prepare(`UPDATE form_files SET created_at = ? WHERE id = ?`).run(old, grant.fileId)
  getDb().prepare(`UPDATE form_submissions SET last_activity_at = ? WHERE id = ?`).run(old, started.submissionId)
  const res = await svc.sweep()
  assert.ok(res.files >= 1 && res.partials >= 1)
  assert.equal(repo.getFile(grant.fileId)!.status, 'deleted')
})

test('loadDefinition migrates an old stored document on read', () => {
  const v1 = JSON.stringify({ name: 'Old', pages: [{ id: 'p1', name: 'P', btn: 'Go', blocks: [{ id: 'b1', type: 'short', label: 'Q' }] }], endings: [{ id: 'e1', name: 'T', kind: 'message', title: 't', body: '', btn: '', url: '' }], rules: [] })
  const def = svc.loadDefinition(v1)
  assert.equal(def.schemaVersion, SCHEMA_VERSION)
  assert.equal(def.pages[0].blocks[0].id, 'b1')
  assert.equal(definitionHash(def), definitionHash(svc.loadDefinition(v1)))
})

test('an e-signature is stored as drawn or typed, required on submit, and reads back as text in Results and the CSV', () => {
  const def = emptyForm('QA-TEST Sign')
  const name = newBlock('short', { label: 'QA-TEST Name', required: true })
  const sig = newBlock('signature', { label: 'QA-TEST Signature', required: true })
  def.pages[0].blocks = [name, sig]
  const form = svc.createForm({ title: def.title, definition: def, createdBy: null })
  svc.publishForm(form.id, { by: null })
  assert.throws(() => svc.submitResponse(form.id, { idempotencyKey: 'idem-sig-none-00000000', answers: { [name.id]: 'Ada' }, meta }), (e: any) => e.status === 422 && e.body.errors[sig.id] === 'Add your signature to continue.')
  assert.throws(() => svc.submitResponse(form.id, { idempotencyKey: 'idem-sig-str-000000000', answers: { [name.id]: 'Ada', [sig.id]: 'Ada Lovelace' }, meta }), (e: any) => e.status === 422 && e.body.errors[sig.id] === 'Add your signature to continue.')
  assert.throws(() => svc.submitResponse(form.id, { idempotencyKey: 'idem-sig-tap-000000000', answers: { [name.id]: 'Ada', [sig.id]: { kind: 'drawn', strokes: [[250, 100]] } }, meta }), (e: any) => e.status === 422 && e.body.errors[sig.id] === 'Draw your full signature.')
  const strokes = [Array.from({ length: 24 }, (_, i) => [30 + i * 12, 110 + (i % 2 ? 14 : -14)]).flat()]
  const drawn = svc.submitResponse(form.id, { idempotencyKey: 'idem-sig-drawn-0000000', answers: { [name.id]: 'Ada', [sig.id]: { kind: 'drawn', strokes } }, meta })
  svc.submitResponse(form.id, { idempotencyKey: 'idem-sig-typed-0000000', answers: { [name.id]: 'Grace', [sig.id]: { kind: 'typed', name: ' Grace  Hopper ' } }, meta })
  const detail = svc.getResponse(form.id, drawn.submissionId, {})
  assert.deepEqual(detail.answers[sig.id], { kind: 'drawn', strokes })
  const list = svc.listResponses(form.id, { sort: 'submitted_asc' })
  assert.deepEqual(list.rows.map(r => r.cells[sig.id]), ['Drawn signature', 'Typed signature: Grace Hopper'])
  // Search also matches the response id (20 random [0-9a-z] chars), so the probe holds a comma: it can never occur in an id, and only occurs in the raw stroke JSON.
  assert.equal(svc.listResponses(form.id, { q: '30,96' }).total, 0, 'search reads the signature text, not its coordinates')
  assert.equal(svc.listResponses(form.id, { q: 'hopper' }).total, 1)
  const csv = [...svc.csvExport(form.id, {})].join('')
  assert.match(csv, /Drawn signature/)
  assert.match(csv, /Typed signature: Grace Hopper/)
  assert.doesNotMatch(csv, /strokes/)
})

test('until first publish, a generated link follows the form name; a chosen or published link never moves', () => {
  const f = svc.createForm({ title: 'Untitled form', createdBy: null })
  assert.match(f.slug, /^untitled-form(-[0-9a-z]{4,8})?$/)
  const rename = (id: string, title: string) => {
    const cur = svc.getFormDetail(id)
    const r = svc.saveDraft(id, { definition: { ...cur.draft, title }, baseRevision: cur.revision, by: null })
    assert.equal(r.ok, true)
    return r.ok ? r.slug : ''
  }
  assert.equal(rename(f.id, 'QA-TEST Grandma Retest'), 'qa-test-grandma-retest')
  assert.equal(svc.getFormDetail(f.id).slug, 'qa-test-grandma-retest')
  assert.equal(rename(f.id, 'QA-TEST Grandma Retest 2'), 'qa-test-grandma-retest-2', 'it keeps following while it is still generated')
  // A name another form's link already has gets a suffix, and still follows from there.
  svc.createForm({ title: 'QA-TEST Taken', createdBy: null })
  assert.match(rename(f.id, 'QA-TEST Taken'), /^qa-test-taken-[0-9a-f]{4}$/)
  assert.equal(rename(f.id, 'QA-TEST Free again'), 'qa-test-free-again')
  // The title patch route follows the same rule.
  svc.patchForm(f.id, { title: 'QA-TEST Patched', by: null })
  assert.equal(svc.getFormDetail(f.id).slug, 'qa-test-patched')
  // A link someone typed stays.
  svc.patchForm(f.id, { slug: 'qa-test-my-own-link', by: null })
  assert.equal(rename(f.id, 'QA-TEST Renamed after choosing'), 'qa-test-my-own-link')
  // A form that was ever published keeps its link, even back in draft.
  const pubDef = emptyForm('QA-TEST Published')
  pubDef.pages[0].blocks = [newBlock('short', { label: 'QA-TEST Q' })]
  const g = svc.createForm({ title: 'QA-TEST Published', definition: pubDef, createdBy: null })
  svc.publishForm(g.id, { by: null })
  svc.unpublishForm(g.id, null)
  assert.equal(rename(g.id, 'QA-TEST Published renamed'), 'qa-test-published')
})
