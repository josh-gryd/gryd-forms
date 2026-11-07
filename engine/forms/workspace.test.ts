process.env.DB_PATH = ':memory:'
process.env.FORMS_STORAGE = 'local'
process.env.FORMS_STORAGE_DIR = `/tmp/forms-ws-test-${process.pid}`
process.env.FORMS_MAINTENANCE = '0'
process.env.FORMS_PUBLIC_URL = 'https://portal.test'

import test from 'node:test'
import assert from 'node:assert/strict'
import * as svc from './service'
import * as repo from './repo'
import * as ws from './workspace'
import * as lib from './library'
import { formReport } from './report'
import { setNotifyDeps, notificationsIdle, sendSlackTest, NOTIFY_CAPS, type OutgoingEmail } from './notify'
import { setSlackPostForForms, setSlackDirectory, slackTargets } from './slack'
import type { SlackTarget } from './ops'
import { migrateForms } from './schema-db'
import { emptyForm, newBlock, makeOptions, checkRules, planConversion, definitionHash, BUILT_IN_TEMPLATES, THEME_PRESETS, type Block, type FormDefinition } from './core/index'
import { getStorage, setStorageForTests } from './storage'
import { getDb } from '../db/index.js'

const meta = { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/128.0 Safari/537.36', acceptLanguage: 'en-GB' }
let seq = 0
const key = () => `idem-ws-${++seq}-000000000000`

function publishedForm(blocks: Block[], opts: { title?: string; settings?: Partial<FormDefinition['settings']>; ops?: svc.SettingsPatch['ops'] } = {}) {
  const def = emptyForm(opts.title ?? `WS ${++seq}`)
  def.pages[0].blocks = blocks
  def.settings = { ...def.settings, ...(opts.settings ?? {}) }
  const f = svc.createForm({ title: def.title, definition: def, createdBy: 'owner@example.com' })
  if (opts.ops) svc.updateFormSettings(f.id, { ops: opts.ops }, 'owner@example.com')
  svc.publishForm(f.id, { by: 'owner@example.com' })
  return svc.getFormDetail(f.id)
}

const failsWith = (status: number, body: Record<string, unknown> = {}) => (err: any) => {
  assert.equal(err.status, status, `${err.status} ${err.message}`)
  for (const [k, v] of Object.entries(body)) assert.deepEqual(err.body[k], v, k)
  return true
}

test('the migration adds its columns once and is safe on every boot', () => {
  const db = getDb()
  migrateForms(db)
  migrateForms(db)
  const cols = (db.prepare(`PRAGMA table_info(form_submissions)`).all() as Array<{ name: string }>).map(c => c.name)
  for (const c of ['read_at', 'edit_token_hash', 'edited_at', 'respondent', 'device_hash']) assert.ok(cols.includes(c), c)
  const formCols = (db.prepare(`PRAGMA table_info(forms)`).all() as Array<{ name: string }>).map(c => c.name)
  for (const c of ['name', 'owner', 'folder_id', 'archived_at', 'ops']) assert.ok(formCols.includes(c), c)
  // A notifications table made before recipient_key existed gets it, index and all.
  db.exec(`DROP INDEX idx_form_notifications_inbox; ALTER TABLE form_notifications DROP COLUMN recipient_key`)
  migrateForms(db)
  const notifCols = (db.prepare(`PRAGMA table_info(form_notifications)`).all() as Array<{ name: string }>).map(c => c.name)
  assert.ok(notifCols.includes('recipient_key'))
  assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_form_notifications_inbox'`).get())
})

test('settings: name, owner, folder and ops save at once and validate', () => {
  const f = svc.createForm({ title: 'Settings form', createdBy: 'owner@example.com' })
  assert.equal(f.owner, 'owner@example.com')
  const folder = ws.createFolder('Sales', 'owner@example.com')
  const d = svc.updateFormSettings(f.id, { name: '  Q4   leads ', owner: 'Teammate@example.com', folderId: folder.id, ops: { maxResponses: 50, timezone: 'Europe/London', notify: { recipients: ['a@example.com', 'A@example.com'] } } }, 'owner@example.com')
  assert.equal(d.name, 'Q4 leads')
  assert.equal(d.owner, 'teammate@example.com')
  assert.equal(d.folderId, folder.id)
  assert.equal(d.ops.maxResponses, 50)
  assert.equal(d.ops.timezone, 'Europe/London')
  assert.deepEqual(d.ops.notify.recipients, ['a@example.com'])
  assert.throws(() => svc.updateFormSettings(f.id, { ops: { opensAt: '2030-01-02T00:00:00Z', closesAt: '2030-01-01T00:00:00Z' } }, null), failsWith(400))
  assert.throws(() => svc.updateFormSettings(f.id, { ops: { duplicates: 'account' } }, null), /sign-in/)
  assert.throws(() => svc.updateFormSettings(f.id, { owner: 'not-an-email' }, null), failsWith(400))
  assert.throws(() => svc.updateFormSettings(f.id, { ops: { timezone: 'Mars/Olympus' } }, null), failsWith(400))
  assert.throws(() => svc.updateFormSettings(f.id, { folderId: 'fld_nope' }, null), failsWith(400))
  const pw = svc.updateFormSettings(f.id, { ops: { password: 'hunter22' } }, null)
  assert.equal(pw.ops.hasPassword, true)
  assert.ok(!('password' in pw.ops), 'the hash never leaves the engine')
  assert.equal(svc.updateFormSettings(f.id, { ops: { password: null } }, null).ops.hasPassword, false)
})

test('availability: not open yet, closed by date, and closed by the response limit', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const later = publishedForm([q], { ops: { opensAt: new Date(Date.now() + 86400_000).toISOString() } })
  const pub = svc.getPublicForm(later.slug)
  assert.equal(pub.status, 'scheduled')
  assert.throws(() => svc.submitResponse(later.id, { idempotencyKey: key(), answers: { [q.id]: 'Ada' }, meta }), failsWith(403, { notOpen: true }))
  assert.equal(svc.getFormDetail(later.id).availability, 'scheduled')

  const past = publishedForm([q], { ops: { closesAt: new Date(Date.now() - 1000).toISOString() } })
  const closed = svc.getPublicForm(past.slug)
  assert.equal(closed.status, 'closed')
  if (closed.status === 'closed') assert.equal(closed.reason, 'date')
  assert.throws(() => svc.saveRespondentDraft(past.id, { answers: {}, meta }), failsWith(410, { reason: 'date' }))

  const one = publishedForm([q], { ops: { maxResponses: 1 } })
  svc.submitResponse(one.id, { idempotencyKey: key(), answers: { [q.id]: 'Ada' }, meta })
  assert.throws(() => svc.submitResponse(one.id, { idempotencyKey: key(), answers: { [q.id]: 'Grace' }, meta }), failsWith(410, { reason: 'limit' }))
  const full = svc.getPublicForm(one.slug)
  assert.equal(full.status === 'closed' && full.reason, 'limit')
  assert.equal(svc.listForms().find(x => x.id === one.id)?.closedReason, 'limit')
  // Raising the limit reopens it at once.
  svc.updateFormSettings(one.id, { ops: { maxResponses: 2 } }, null)
  assert.equal(svc.getPublicForm(one.slug).status, 'live')
})

test('the response limit holds for a session that started before the form filled up', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const f = publishedForm([q], { ops: { maxResponses: 1 } })
  const early = svc.saveRespondentDraft(f.id, { answers: { [q.id]: 'Early' }, meta })
  svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'First' }, meta })
  assert.throws(() => svc.submitResponse(f.id, { token: early.token, idempotencyKey: key(), answers: { [q.id]: 'Early' }, meta }), failsWith(410))
  assert.equal(repo.completedCount(f.id), 1)
})

test('password: locked until the right password, and a new password locks everyone out again', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const f = publishedForm([q], { ops: { password: 'open sesame' } })
  const locked = svc.getPublicForm(f.slug)
  assert.equal(locked.status, 'locked')
  assert.ok(!('definition' in locked), 'a locked form never sends its questions')
  assert.throws(() => svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Ada' }, meta }), failsWith(403, { locked: true }))
  assert.throws(() => svc.getSessionVersion(f.id, f.live!.versionId), failsWith(403, { locked: true }))
  assert.throws(() => svc.unlockForm(f.id, 'wrong'), failsWith(403, { wrongPassword: true }))
  const { token, form } = svc.unlockForm(f.id, 'open sesame')
  assert.equal(form.status, 'live')
  assert.equal(svc.getPublicForm(f.slug, { unlock: token }).status, 'live')
  const ok = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Ada' }, meta, auth: { unlock: token } })
  assert.equal(ok.status, 'completed')
  assert.equal(svc.getPublicForm(f.slug, { unlock: `${Date.now() + 999999}.forged` }).status, 'locked')
  assert.equal(svc.getPublicForm(f.slug, { unlock: `${Date.now() + 999999}.é${'a'.repeat(42)}` }).status, 'locked', 'non-ASCII is a wrong token, not a crash')
  svc.updateFormSettings(f.id, { ops: { password: 'new password' } }, null)
  assert.equal(svc.getPublicForm(f.slug, { unlock: token }).status, 'locked', 'the old token stops working')
})

test('restricted: sign-in first, the response records who, and one response per person', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const f = publishedForm([q], { settings: { allowEdits: true }, ops: { access: 'restricted', duplicates: 'account' } })
  assert.equal(svc.getPublicForm(f.slug).status, 'signin')
  assert.throws(() => svc.saveRespondentDraft(f.id, { answers: {}, meta }), failsWith(401, { signin: true }))
  const me = { respondent: 'Nick@example.com' }
  const live = svc.getPublicForm(f.slug, me)
  assert.equal(live.status, 'live')
  if (live.status === 'live') assert.deepEqual(live.respond, { duplicates: 'account', respondent: 'nick@example.com' })
  const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Nick' }, meta, auth: me })
  assert.equal(repo.getSubmission(r.submissionId)?.respondent, 'nick@example.com')
  const again = svc.getPublicForm(f.slug, me)
  assert.equal(again.status, 'responded')
  if (again.status === 'responded') assert.equal(again.canEdit, true)
  assert.throws(() => svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Nick again' }, meta, auth: me }), failsWith(409, { duplicate: 'account' }))
  // Signed in, they edit their own without a link.
  const edit = svc.getEditSession(f.id, null, me)
  assert.equal(edit.submissionId, r.submissionId)
  assert.throws(() => svc.getEditSession(f.id, null, { respondent: 'someone@example.com' }), failsWith(404))
})

test('duplicates by device: the same browser is refused, another is not, spam never counts', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const f = publishedForm([q], { ops: { duplicates: 'device' } })
  const device = 'device-abcdef-123456'
  svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'One' }, meta, deviceId: device })
  assert.throws(() => svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Two' }, meta, deviceId: device }), failsWith(409, { duplicate: 'device' }))
  assert.equal(svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Three' }, meta, deviceId: 'device-other-999999' }).status, 'completed')
  const g = publishedForm([q], { ops: { duplicates: 'device' } })
  assert.equal(svc.submitResponse(g.id, { idempotencyKey: key(), answers: { [q.id]: 'Bot' }, meta, deviceId: device, honeypot: 'http://spam' }).status, 'spam')
  assert.equal(svc.submitResponse(g.id, { idempotencyKey: key(), answers: { [q.id]: 'Human' }, meta, deviceId: device }).status, 'completed')
})

test('duplicates by email: the error sits on the email question, in the form’s language', () => {
  const email = newBlock('email', { label: 'Email', required: true })
  const f = publishedForm([email], { ops: { duplicates: 'email' } })
  svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [email.id]: 'ada@example.com' }, meta })
  assert.throws(() => svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [email.id]: ' ADA@example.com ' }, meta }), (err: any) => err.status === 422 && err.body.errors[email.id] === 'This email address has already been used to respond.' && typeof err.body.pageId === 'string')
  const es = publishedForm([email], { settings: { language: 'es' }, ops: { duplicates: 'email' } })
  svc.submitResponse(es.id, { idempotencyKey: key(), answers: { [email.id]: 'ana@example.com' }, meta })
  assert.throws(() => svc.submitResponse(es.id, { idempotencyKey: key(), answers: { [email.id]: 'ana@example.com' }, meta }), (err: any) => err.body.errors[email.id] === 'Esta dirección de correo ya se usó para responder.')

  // The early check says the same thing as the respondent leaves the email's page, before the rest.
  const early = svc.checkAnswers(f.id, { answers: { [email.id]: ' ADA@example.com ' } })
  assert.equal(early.errors[email.id], 'This email address has already been used to respond.')
  assert.equal(early.pageId, f.draft.pages[0].id)
  assert.deepEqual(svc.checkAnswers(f.id, { answers: { [email.id]: 'grace@example.com' } }), { errors: {}, pageId: null })
  const open = publishedForm([email])
  svc.submitResponse(open.id, { idempotencyKey: key(), answers: { [email.id]: 'ada@example.com' }, meta })
  assert.deepEqual(svc.checkAnswers(open.id, { answers: { [email.id]: 'ada@example.com' } }).errors, {}, 'only a one-per-email form checks')
  const locked = publishedForm([email], { ops: { duplicates: 'email', password: 'open sesame' } })
  assert.throws(() => svc.checkAnswers(locked.id, { answers: { [email.id]: 'ada@example.com' } }), failsWith(403, { locked: true }), 'a locked form answers nothing about its responses')
})

test('edit links: returned once, open the response on the live form, and save in place', async () => {
  const name = newBlock('short', { label: 'Name', required: true })
  const plan = newBlock('choice', { label: 'Plan', required: true, options: makeOptions(['Basic', 'Pro']) })
  const f = publishedForm([name, plan], { settings: { allowEdits: true } })
  const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Ada', [plan.id]: plan.options[0].id }, meta })
  assert.ok(r.editToken && r.editToken.length >= 32)
  const again = svc.submitResponse(f.id, { idempotencyKey: key(), token: r.token, answers: {}, meta })
  assert.equal(again.duplicate, true)
  assert.equal(again.editToken, null, 'a replay never hands the link out again')
  const session = svc.getEditSession(f.id, r.editToken)
  assert.equal(session.answers[name.id], 'Ada')
  await assert.rejects(svc.saveEdit(f.id, { token: r.editToken, answers: { [name.id]: '', [plan.id]: plan.options[0].id } }), failsWith(422))
  const saved = await svc.saveEdit(f.id, { token: r.editToken, versionId: session.version.id, answers: { [name.id]: 'Ada Lovelace', [plan.id]: plan.options[1].id } })
  assert.equal(saved.submissionId, r.submissionId)
  const row = repo.getSubmission(r.submissionId)!
  assert.ok(row.editedAt)
  assert.equal(JSON.parse(row.answers)[name.id], 'Ada Lovelace')
  assert.ok(repo.listEvents(r.submissionId).some(e => e.kind === 'edited'))
  assert.equal(svc.listResponses(f.id, {}).total, 1, 'still one response')
  await assert.rejects(async () => svc.getEditSession(f.id, 'not-a-real-token-at-all-0000000000000000'), failsWith(404))
  // The owner turns edits off: the link stops working.
  const draft = svc.getFormDetail(f.id).draft
  svc.saveDraft(f.id, { definition: { ...draft, settings: { ...draft.settings, allowEdits: false } }, baseRevision: svc.getFormDetail(f.id).revision, by: null })
  svc.publishForm(f.id, { by: null })
  assert.throws(() => svc.getEditSession(f.id, r.editToken), failsWith(403, { editsOff: true }))
  const none = publishedForm([name])
  assert.equal(svc.submitResponse(none.id, { idempotencyKey: key(), answers: { [name.id]: 'Ada' }, meta }).editToken, null)
})

test('notifications: nothing sends without a sender; with one, owners and the respondent hear, within the caps', async () => {
  const sent: Array<OutgoingEmail & { sender: string }> = []
  setNotifyDeps({ send: async (sender, msg) => { sent.push({ ...msg, sender }) } })
  try {
    const name = newBlock('short', { label: 'Name', required: true })
    const email = newBlock('email', { label: 'Email', required: true })
    const f = publishedForm([name, email], { settings: { allowEdits: true }, ops: { notify: { owner: true, recipients: ['ops@example.com'], confirmation: true, subject: 'Thanks {{answer:' + name.id + '}}', message: 'We got it.' } } })
    svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Ada', [email.id]: 'ada@example.com' }, meta })
    await notificationsIdle()
    assert.equal(sent.length, 0)
    const log = repo.listNotifications(f.id)
    assert.deepEqual(log.map(n => [n.kind, n.status]).sort(), [['confirmation', 'skipped'], ['owner', 'skipped']])

    repo.setWorkspaceValue('settings', JSON.stringify({ ...ws.getWorkspace(), notifications: { ...ws.getWorkspace().notifications, sender: 'user:owner@example.com' } }), null)
    const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Grace', [email.id]: 'Grace@Example.com' }, meta })
    await notificationsIdle()
    const alert = sent.find(m => m.to === 'ops@example.com')!
    assert.equal(alert.sender, 'user:owner@example.com')
    assert.match(alert.subject, /^New response: /)
    assert.match(alert.body, /Name: Grace/)
    assert.match(alert.body, new RegExp(`https://portal.test/forms/responses\\?form=${f.id}&r=${r.submissionId}`))
    const confirm = sent.find(m => m.to === 'grace@example.com')!
    assert.equal(confirm.subject, 'Thanks Grace')
    assert.match(confirm.body, /^We got it\./)
    assert.match(confirm.body, /Your answers:/)
    assert.ok(confirm.body.includes(`/f/${f.slug}#edit=${r.editToken}`), 'the edit link rides in the confirmation')

    // Changing the response alerts the owners, never re-confirms.
    sent.length = 0
    await svc.saveEdit(f.id, { token: r.editToken, answers: { [name.id]: 'Grace H', [email.id]: 'grace@example.com' } })
    await notificationsIdle()
    assert.deepEqual(sent.map(m => [m.to, m.subject.split(':')[0]]), [['ops@example.com', 'Response changed']])

    // One address can't be sent more than the daily cap, from any number of responses.
    sent.length = 0
    for (let i = 0; i < NOTIFY_CAPS.confirmationsPerAddressPerDay + 1; i++) svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: `Spam ${i}`, [email.id]: 'victim@example.com' }, meta })
    await notificationsIdle()
    assert.equal(sent.filter(m => m.to === 'victim@example.com').length, NOTIFY_CAPS.confirmationsPerAddressPerDay)
    assert.ok(repo.listNotifications(f.id, 50).some(n => n.recipient === 'victim@example.com' && n.status === 'skipped'))

    // Spellings of one inbox share its cap, and a name, a second address or a stray comma never reaches a header.
    sent.length = 0
    for (const v of ['"a"<twin@example.com>', 'twin@example.com,', 'Twin+1@Example.com', 'twin+2@example.com', 'twin@example.com', 'twin+3@example.com']) svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Twin', [email.id]: v }, meta })
    await notificationsIdle()
    assert.deepEqual(sent.filter(m => m.to !== 'ops@example.com').map(m => m.to), ['twin+1@example.com', 'twin+2@example.com', 'twin@example.com'])

    // A failed send is logged as failed, not thrown.
    setNotifyDeps({ send: async () => { throw new Error('Gmail send 403: insufficient scope') } })
    svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Fail', [email.id]: 'fail@example.com' }, meta })
    await notificationsIdle()
    assert.ok(repo.listNotifications(f.id, 5).some(n => n.status === 'failed' && /insufficient scope/.test(n.detail)))
  } finally {
    setNotifyDeps(null)
    repo.setWorkspaceValue('settings', JSON.stringify({ ...ws.getWorkspace(), notifications: { ...ws.getWorkspace().notifications, sender: null } }), null)
  }
})

test('slack: a new response posts to the chosen channel with the chosen questions, escaped, capped and logged', async () => {
  const posts: Array<{ target: SlackTarget; text: string }> = []
  let answer: { ok: true } | { ok: false; error: string } = { ok: true }
  setSlackPostForForms(async (target, text) => { posts.push({ target, text }); return answer })
  try {
    const name = newBlock('short', { label: 'Name', required: true })
    const email = newBlock('email', { label: 'Email', required: true })
    const topic = newBlock('long', { label: 'What should we know?' })
    const f = publishedForm([name, email, topic], { title: 'Lead form', settings: { allowEdits: true }, ops: { notify: { owner: false } } })
    const channel = { kind: 'channel' as const, id: 'C0BSYMJ365N', label: '#automation-test-flows2' }

    // Turning it on needs somewhere to post; a target has to be a real Slack id of its kind.
    assert.throws(() => svc.updateFormSettings(f.id, { ops: { slack: { on: true } } }, 'owner@example.com'), failsWith(400))
    assert.throws(() => svc.updateFormSettings(f.id, { ops: { slack: { target: { kind: 'channel', id: 'U0AAAAAAAA', label: 'x' } } } }, 'owner@example.com'), failsWith(400))
    assert.throws(() => svc.updateFormSettings(f.id, { ops: { slack: { target: { kind: 'user', id: '#general', label: 'x' } as unknown as SlackTarget } } }, 'owner@example.com'), failsWith(400))
    const saved = svc.updateFormSettings(f.id, { ops: { slack: { on: true, target: channel, fields: [name.id, topic.id] } } }, 'owner@example.com')
    assert.deepEqual(saved.ops.slack, { on: true, target: channel, message: '', fields: [name.id, topic.id] })

    const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Ada <!channel> <https://evil.example|click>', [email.id]: 'ada@example.com', [topic.id]: 'Fish & chips' }, meta })
    await notificationsIdle()
    assert.equal(posts.length, 1)
    assert.equal(posts[0].target.id, 'C0BSYMJ365N')
    const lines = posts[0].text.split('\n')
    assert.equal(lines[0], 'New response to *Lead form*')
    assert.equal(lines[1], '*Name:* Ada &lt;!channel&gt; &lt;https://evil.example|click&gt;')
    assert.equal(lines[2], '*What should we know?* Fish &amp; chips')
    assert.equal(lines[3], `<https://portal.test/forms/responses?form=${f.id}&r=${r.submissionId}|Open the response>`)
    assert.ok(!posts[0].text.includes('ada@example.com'), 'a question left out stays out')
    assert.equal((posts[0].text.match(/</g) ?? []).length, 1, 'the only link is ours')
    assert.deepEqual(repo.listNotifications(f.id).map(n => [n.kind, n.recipient, n.status]), [['slack', '#automation-test-flows2', 'sent']])

    // A custom first line with an answer in it; every question when none are picked; nothing when the list is empty.
    svc.updateFormSettings(f.id, { ops: { slack: { message: `New lead: {{answer:${name.id}}}`, fields: null } } }, 'owner@example.com')
    svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Grace', [email.id]: 'grace@example.com' }, meta })
    await notificationsIdle()
    assert.deepEqual(posts[1].text.split('\n').slice(0, 3), ['New lead: Grace', '*Name:* Grace', '*Email:* grace@example.com'])
    svc.updateFormSettings(f.id, { ops: { slack: { fields: [] } } }, 'owner@example.com')
    const r3 = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Linus', [email.id]: 'linus@example.com' }, meta })
    await notificationsIdle()
    assert.equal(posts[2].text.split('\n').length, 2)

    // A changed response doesn't post again.
    await svc.saveEdit(f.id, { token: r3.editToken, answers: { [name.id]: 'Linus T', [email.id]: 'linus@example.com' } })
    await notificationsIdle()
    assert.equal(posts.length, 3)

    // Slack refusing is logged in words a person can act on, never thrown.
    answer = { ok: false, error: 'not_in_channel (join failed: method_not_supported_for_channel_type — invite the bot to C0BSYMJ365N)' }
    svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Private', [email.id]: 'p@example.com' }, meta })
    await notificationsIdle()
    const failed = repo.listNotifications(f.id, 1)[0]
    assert.equal(failed.status, 'failed')
    assert.match(failed.detail, /The Slack app isn't in #automation-test-flows2\. Invite it/)

    // Send a test: the draft's questions with placeholders, or the reason it can't.
    answer = { ok: true }
    assert.deepEqual(await sendSlackTest(f.id, 'owner@example.com'), { ok: true, target: '#automation-test-flows2' })
    assert.match(posts.at(-1)!.text, /^_Test from Forms/)
    answer = { ok: false, error: 'no_slack_credential' }
    await assert.rejects(sendSlackTest(f.id, 'owner@example.com'), (err: any) => err.status === 400 && /Set SLACK_BOT_TOKEN/.test(err.message))
    const bare = publishedForm([newBlock('short', { label: 'Name' })])
    await assert.rejects(sendSlackTest(bare.id, null), failsWith(400))

    // A burst can't flood a channel: past the hourly cap, posts are skipped and logged.
    answer = { ok: true }
    for (let i = 0; i < NOTIFY_CAPS.slackPerFormPerHour; i++) repo.insertNotification({ formId: f.id, submissionId: null, kind: 'slack', recipient: '#automation-test-flows2', status: 'sent', detail: '' })
    const before = posts.length
    svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [name.id]: 'Burst', [email.id]: 'burst@example.com' }, meta })
    await notificationsIdle()
    assert.equal(posts.length, before)
    assert.match(repo.listNotifications(f.id, 1)[0].detail, /Over 60 Slack posts in an hour/)

    // Off stops it; the target stays for next time.
    const off = svc.updateFormSettings(f.id, { ops: { slack: { on: false } } }, 'owner@example.com')
    assert.equal(off.ops.slack.on, false)
    assert.deepEqual(off.ops.slack.target, channel)
  } finally {
    setSlackPostForForms(null)
  }
})

test('slack picker: channels the Slack app can see and people, best match first; says why when Slack is not connected', async () => {
  setSlackDirectory({
    token: async () => 'xoxb-test',
    channels: async () => [{ id: 'C0GENERAL1', name: 'general' }, { id: 'C0BSYMJ365N', name: 'automation-test-flows2' }, { id: 'C0FLOWS001', name: 'flows-automation' }],
    users: async () => [{ id: 'U0ALEX0001', name: 'Alex Doe', email: 'owner@example.com' }, { id: 'U0SAMM0001', name: 'Sam', email: 'teammate@example.com' }],
  })
  try {
    const auto = await slackTargets('auto')
    assert.deepEqual(auto.options.map(o => o.label), ['#automation-test-flows2', '#flows-automation'])
    assert.equal(auto.options[0].kind, 'channel')
    const alex = await slackTargets('@alex')
    assert.deepEqual(alex.options, [{ kind: 'user', id: 'U0ALEX0001', label: 'Alex Doe', sub: 'owner@example.com' }])
    assert.equal((await slackTargets('')).options.length, 5)
    setSlackDirectory({ token: async () => '' })
    const none = await slackTargets('')
    assert.deepEqual(none.options, [])
    assert.match(none.unavailable ?? '', /Slack isn't connected/)
  } finally {
    setSlackDirectory(null)
  }
})

test('folders: create, rename, count, reorder and delete without losing forms', () => {
  const a = ws.createFolder('Clients', null)
  assert.throws(() => ws.createFolder('clients', null), failsWith(409))
  const b = ws.createFolder('Events', null)
  const f = svc.createForm({ title: 'In a folder', createdBy: null, folderId: a.id })
  assert.equal(f.folderId, a.id)
  assert.equal(ws.listFolders().find(x => x.id === a.id)?.formCount, 1)
  assert.equal(ws.renameFolder(a.id, 'Client work').name, 'Client work')
  const order = ws.reorderFolders([b.id, a.id]).map(x => x.id).filter(id => id === a.id || id === b.id)
  assert.deepEqual(order, [b.id, a.id])
  ws.deleteFolder(a.id, null)
  assert.equal(svc.getFormDetail(f.id).folderId, null)
  assert.ok(svc.listForms().some(x => x.id === f.id), 'the form stays')
})

test('folder colors: a new folder takes one no folder wears yet; recolor, rename keeps it, junk is refused', () => {
  const worn = new Set(ws.listFolders().map(f => f.color))
  const a = ws.createFolder('Colors A', null)
  assert.ok(ws.FOLDER_COLORS.includes(a.color))
  if (worn.size < ws.FOLDER_COLORS.length) assert.ok(!worn.has(a.color), 'an unused color first')
  assert.equal(ws.createFolder('Colors B', null, 'teal').color, 'teal')
  assert.equal(ws.updateFolder(a.id, { color: 'pink' }).color, 'pink')
  assert.equal(ws.listFolders().find(f => f.id === a.id)?.color, 'pink')
  assert.equal(ws.updateFolder(a.id, { name: 'Colors A2' }).color, 'pink', 'a rename keeps the color')
  assert.throws(() => ws.updateFolder(a.id, { color: 'chartreuse' }), failsWith(400))
  assert.throws(() => ws.createFolder('Colors C', null, '#ff0000'), failsWith(400))
  assert.throws(() => ws.updateFolder(a.id, {}), failsWith(400))
  assert.throws(() => ws.updateFolder('fld_nope', { color: 'blue' }), failsWith(404))
  // Folders made before colors have none stored: each shows one from its id, the same every time.
  const legacy = repo.insertFolder('fld_before_colors', 'Before colors')
  const shown = ws.listFolders().find(f => f.id === legacy.id)?.color
  assert.ok(shown && ws.FOLDER_COLORS.includes(shown))
  assert.equal(ws.listFolders().find(f => f.id === legacy.id)?.color, shown)
})

test('archive closes an open form and restore reopens it; archived forms leave the list', () => {
  const q = newBlock('short', { label: 'Name' })
  const f = publishedForm([q])
  const archived = svc.archiveForm(f.id, null)
  assert.ok(archived.archivedAt)
  assert.equal(archived.status, 'closed')
  assert.ok(!svc.listForms().some(x => x.id === f.id))
  assert.ok(svc.listForms({ archived: true }).some(x => x.id === f.id))
  assert.equal(svc.getPublicForm(f.slug).status, 'closed')
  const restored = svc.restoreForm(f.id, null)
  assert.equal(restored.archivedAt, null)
  assert.equal(restored.status, 'published')
  const closed = publishedForm([q])
  svc.closeForm(closed.id, null)
  svc.archiveForm(closed.id, null)
  assert.equal(svc.restoreForm(closed.id, null).status, 'closed', 'a form closed before archiving stays closed')
  const draft = svc.createForm({ title: 'Draft only', createdBy: null })
  svc.archiveForm(draft.id, null)
  assert.equal(svc.restoreForm(draft.id, null).status, 'draft')
})

test('templates: four built in, each valid and publishable; saved ones keep their design', () => {
  const list = lib.listTemplates()
  assert.deepEqual(list.filter(t => t.builtIn).map(t => t.category), ['Contact', 'Intake', 'Feedback', 'Registration'])
  for (const t of BUILT_IN_TEMPLATES) {
    const def = t.build()
    assert.deepEqual(checkRules(def), [], t.id)
    assert.notEqual(def.pages[0].blocks[0].id, t.build().pages[0].blocks[0].id, 'fresh ids every time')
    const f = lib.useTemplate(t.id, { by: 'owner@example.com' })
    assert.equal(svc.publishForm(f.id, { by: null }).ok, true)
  }
  const src = svc.createForm({ title: 'House style', createdBy: null })
  svc.saveDraft(src.id, { definition: { ...src.draft, theme: { ...THEME_PRESETS.ink } }, baseRevision: src.revision, by: null })
  const saved = lib.saveAsTemplate(src.id, { name: 'Ink intake', category: 'Intake', by: 'owner@example.com' })
  assert.equal(saved.builtIn, false)
  const made = lib.useTemplate(saved.id, { title: 'From ink', by: null })
  assert.equal(made.draft.theme.preset, 'ink')
  assert.equal(made.title, 'From ink')
  assert.equal(lib.updateTemplate(saved.id, { name: 'Ink v2' }).name, 'Ink v2')
  assert.throws(() => lib.deleteTemplate('builtin-contact', null), failsWith(400))
  lib.deleteTemplate(saved.id, null)
  assert.ok(!lib.listTemplates().some(t => t.id === saved.id))
})

test('workspace defaults shape new forms; existing forms change only when asked', async () => {
  const cleanLive = publishedForm([newBlock('short', { label: 'Clean' })])
  const dirtyLive = publishedForm([newBlock('short', { label: 'Dirty' })])
  const d = svc.getFormDetail(dirtyLive.id)
  svc.saveDraft(dirtyLive.id, { definition: { ...d.draft, title: 'Dirty, edited' }, baseRevision: d.revision, by: null })

  await ws.saveWorkspace({ theme: { ...THEME_PRESETS.gold }, defaults: { language: 'fr', progress: 'pages', timezone: 'Europe/Paris', thankYouTitle: 'Merci !' }, notifications: { recipients: ['team@example.com'], confirmation: true } }, 'owner@example.com')
  await assert.rejects(ws.saveWorkspace({ notifications: { sender: 'user:nobody@example.com' } }, null), failsWith(400))
  const blank = svc.createForm({ title: 'After defaults', createdBy: null })
  assert.equal(blank.draft.theme.preset, 'gold')
  assert.equal(blank.draft.settings.language, 'fr')
  assert.equal(blank.draft.settings.progress, 'pages')
  assert.equal(blank.draft.endings[0].title, 'Merci !')
  assert.equal(blank.ops.timezone, 'Europe/Paris')
  assert.deepEqual(blank.ops.notify.recipients, ['team@example.com'])
  assert.equal(blank.ops.notify.confirmation, true)
  assert.equal(svc.getFormDetail(cleanLive.id).draft.theme.preset, 'paper', 'existing forms are untouched until asked')

  const res = lib.applyWorkspace({ parts: ['theme', 'notifications'], formIds: [cleanLive.id, dirtyLive.id], publish: true }, 'owner@example.com')
  assert.equal(res.updated, 2)
  assert.equal(res.published, 1)
  assert.deepEqual(res.needsPublish.map(x => x.id), [dirtyLive.id])
  const pub = svc.getPublicForm(cleanLive.slug)
  assert.equal(pub.status === 'live' && pub.definition.theme.preset, 'gold', 'the clean live form shows the new look')
  assert.equal(svc.getFormDetail(dirtyLive.id).publishState, 'dirty', 'half-done edits are never published for someone')
  assert.deepEqual(svc.getFormDetail(dirtyLive.id).ops.notify.recipients, ['team@example.com'])

  // The stock thank-you title follows the language, into new forms and existing ones; a written one stays.
  await ws.saveWorkspace({ defaults: { language: 'de', thankYouTitle: 'Thanks, we got it.' } }, null)
  assert.equal(svc.createForm({ title: 'German', createdBy: null }).draft.endings[0].title, 'Danke, ist angekommen.')
  lib.applyWorkspace({ parts: ['defaults'], formIds: [cleanLive.id, blank.id] }, null)
  assert.equal(svc.getFormDetail(cleanLive.id).draft.endings[0].title, 'Danke, ist angekommen.')
  assert.equal(svc.getFormDetail(blank.id).draft.endings[0].title, 'Merci !')
  await ws.saveWorkspace({ theme: { ...THEME_PRESETS.paper }, defaults: { language: 'en', progress: 'bar', timezone: 'America/New_York', thankYouTitle: 'Thanks, we got it.' }, notifications: { recipients: [], confirmation: false } }, null)
})

test('responses across forms: newest first, unread until read, filters by form, date and unread', () => {
  const q = newBlock('short', { label: 'Company' })
  const a = publishedForm([q], { title: 'Inbox A' })
  const b = publishedForm([q], { title: 'Inbox B' })
  svc.updateFormSettings(b.id, { name: 'B internal' }, null)
  const r1 = svc.submitResponse(a.id, { idempotencyKey: key(), answers: { [q.id]: 'Acme' }, meta })
  const r2 = svc.submitResponse(b.id, { idempotencyKey: key(), answers: { [q.id]: 'Globex' }, meta })
  const all = svc.listInbox({ q: 'globex' })
  assert.equal(all.rows[0].id, r2.submissionId)
  assert.equal(all.rows[0].formTitle, 'B internal')
  assert.deepEqual(all.rows[0].preview, [{ label: 'Company', text: 'Globex' }])
  assert.ok(svc.listInbox({ unread: true }).rows.some(r => r.id === r1.submissionId))
  assert.equal(svc.listInbox({ formId: a.id }).total, 1)
  assert.equal(svc.listForms().find(x => x.id === a.id)?.unreadCount, 1)
  const before = svc.unreadResponses().unread
  svc.markResponsesRead({ ids: [r1.submissionId], read: true })
  assert.equal(svc.unreadResponses().unread, before - 1)
  assert.equal(svc.listResponses(a.id, {}).rows[0].readAt !== null, true)
  svc.markResponsesRead({ ids: [r1.submissionId], read: false })
  assert.equal(svc.unreadResponses().unread, before)
  svc.markResponsesRead({ formId: b.id })
  assert.equal(svc.listInbox({ formId: b.id, unread: true }).total, 0)
  assert.equal(svc.listInbox({ since: '2999-01-01' }).total, 0)
  assert.throws(() => svc.markResponsesRead({}), failsWith(400))
})

test('summary report: option counts, number spread, text samples and 30 days of history', () => {
  const plan = newBlock('choice', { label: 'Plan', options: makeOptions(['Basic', 'Pro']) })
  const tools = newBlock('checks', { label: 'Tools', options: makeOptions(['Slack', 'Jira', 'Notion']) })
  const stars = newBlock('rating', { label: 'Stars' })
  const note = newBlock('long', { label: 'Note' })
  const f = publishedForm([plan, tools, stars, note])
  const answers = [
    { [plan.id]: plan.options[0].id, [tools.id]: [tools.options[0].id, tools.options[1].id], [stars.id]: 5, [note.id]: 'Great' },
    { [plan.id]: plan.options[1].id, [tools.id]: [tools.options[0].id], [stars.id]: 3, [note.id]: 'Fine' },
    { [plan.id]: plan.options[1].id, [stars.id]: 4 },
  ]
  for (const a of answers) svc.submitResponse(f.id, { idempotencyKey: key(), answers: a, meta })
  svc.saveRespondentDraft(f.id, { answers: { [note.id]: 'half way' }, meta })
  const r = formReport(f.id)
  assert.equal(r.completed, 3)
  assert.equal(r.partial, 1)
  assert.equal(r.completionRate, 0.75)
  assert.equal(r.perDay.length, 30)
  assert.equal(r.perDay[29].count, 3)
  const byId = new Map(r.questions.map(q => [q.id, q]))
  const p = byId.get(plan.id)!
  assert.ok(p.kind === 'options' && p.options.map(o => o.count).join() === '1,2')
  const t = byId.get(tools.id)!
  assert.ok(t.kind === 'options' && t.multi && t.options.map(o => o.count).join() === '2,1,0' && t.answered === 2)
  const s = byId.get(stars.id)!
  assert.ok(s.kind === 'numbers' && s.average === 4 && s.distribution?.map(d => d.count).join() === '0,0,1,1,1')
  const n = byId.get(note.id)!
  assert.ok(n.kind === 'text' && n.answered === 2 && n.samples.includes('Great'))
})

test('a field that changes type keeps its past responses readable in the table, the response and the summary', () => {
  const role = newBlock('short', { label: 'Role' })
  const tools = newBlock('checks', { label: 'Tools', options: makeOptions(['Slack', 'Jira', 'Notion']) })
  const plan = newBlock('choice', { label: 'Plan', options: makeOptions(['Basic', 'Pro']) })
  const f = publishedForm([role, tools, plan])
  const first = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [role.id]: 'Engineer', [tools.id]: [tools.options[0].id, tools.options[1].id], [plan.id]: plan.options[1].id }, meta })
  let def = svc.getFormDetail(f.id).draft
  for (const [id, to] of [[role.id, 'long'], [tools.id, 'short'], [plan.id, 'checks']] as const) def = planConversion(def, id, to)!.def
  const saved = svc.saveDraft(f.id, { definition: def, baseRevision: svc.getFormDetail(f.id).revision, by: 'owner@example.com' })
  assert.equal(saved.ok, true)
  svc.publishForm(f.id, { by: 'owner@example.com' })
  svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [role.id]: 'Designer\nand writer', [tools.id]: 'Notion', [plan.id]: [plan.options[0].id] }, meta })

  const list = svc.listResponses(f.id, {})
  const old = list.rows.find(r => r.id === first.submissionId)!
  assert.equal(old.cells[tools.id], 'Slack, Jira', 'the old response reads with the version it was answered on')
  assert.equal(old.cells[plan.id], 'Pro')
  assert.equal(list.columns.find(c => c.id === tools.id)?.type, 'short', 'the column is today’s question')
  const detail = svc.getResponse(f.id, first.submissionId, {})
  assert.deepEqual(detail.answers[tools.id], [tools.options[0].id, tools.options[1].id])
  assert.equal(detail.definition.pages[0].blocks.find(b => b.id === tools.id)?.type, 'checks')

  const r = formReport(f.id)
  const byId = new Map(r.questions.map(q => [q.id, q]))
  const t = byId.get(tools.id)!
  assert.ok(t.kind === 'text' && t.answered === 2 && t.samples.includes('Slack, Jira') && t.samples.includes('Notion'), JSON.stringify(t))
  const p = byId.get(plan.id)!
  assert.ok(p.kind === 'options' && p.multi && p.options.map(o => o.count).join() === '1,1', JSON.stringify(p))
  const ro = byId.get(role.id)!
  assert.ok(ro.kind === 'text' && ro.answered === 2)
})

test('summary days are the form’s own: a 7:34 pm New York response is that evening’s, and DST skips no day', () => {
  const q = newBlock('short', { label: 'Name' })
  const f = publishedForm([q], { ops: { timezone: 'America/New_York' } })
  const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Evening' }, meta })
  getDb().prepare(`UPDATE form_submissions SET submitted_at = ? WHERE id = ?`).run('2026-09-26T00:34:19.271Z', r.submissionId)
  const rep = formReport(f.id, Date.parse('2026-09-26T01:00:00Z'))
  assert.equal(rep.timezone, 'America/New_York')
  assert.deepEqual(rep.perDay.at(-1), { day: '2026-09-25', count: 1 }, 'the last day is New York’s today, and the response is on it')
  const acrossDst = formReport(f.id, Date.parse('2026-11-10T15:00:00Z')).perDay.map(d => d.day)
  assert.equal(new Set(acrossDst).size, 30)
  assert.deepEqual([acrossDst[0], acrossDst.at(-1)], ['2026-10-12', '2026-11-10'])
})

test('data: delete older responses on demand, and the retention sweep deletes past the period', async () => {
  const q = newBlock('short', { label: 'Name' })
  const f = publishedForm([q])
  const old = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Old' }, meta })
  const fresh = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'New' }, meta })
  getDb().prepare(`UPDATE form_submissions SET submitted_at = ?, last_activity_at = ? WHERE id = ?`).run('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', old.submissionId)
  const res = await svc.purgeResponses(f.id, { olderThanDays: 30 }, 'owner@example.com')
  assert.deepEqual(res, { deleted: 1, more: false })
  assert.equal(svc.listResponses(f.id, {}).total, 1)
  assert.equal(svc.listResponses(f.id, {}).rows[0].id, fresh.submissionId)

  const g = publishedForm([q], { ops: { retentionDays: 90 } })
  const expired = svc.submitResponse(g.id, { idempotencyKey: key(), answers: { [q.id]: 'Expired' }, meta })
  svc.submitResponse(g.id, { idempotencyKey: key(), answers: { [q.id]: 'Kept' }, meta })
  getDb().prepare(`UPDATE form_submissions SET submitted_at = ? WHERE id = ?`).run(new Date(Date.now() - 91 * 86400_000).toISOString(), expired.submissionId)
  const swept = await svc.sweep()
  assert.ok(swept.expired >= 1)
  assert.equal(svc.listResponses(g.id, {}).total, 1)
  assert.ok(repo.getSubmission(expired.submissionId)?.deletedAt)
  const all = await svc.purgeResponses(g.id, {}, null)
  assert.equal(all.deleted, 1)
  assert.equal(svc.listResponses(g.id, {}).total, 0)

  // Deleted means the answers are gone, not hidden: only the tombstone stays.
  for (const id of [old.submissionId, expired.submissionId]) {
    const row = getDb().prepare(`SELECT deleted_at AS deletedAt, answers, search_text AS searchText, metadata FROM form_submissions WHERE id = ?`).get(id) as Record<string, string>
    assert.ok(row.deletedAt)
    assert.deepEqual([row.answers, row.searchText, row.metadata], ['{}', '', '{}'], id)
    assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM form_submission_answers WHERE submission_id = ?`).get(id) as { n: number }).n, 0)
  }
})

test('a purge and the retention sweep over the same responses both finish', async () => {
  const q = newBlock('short', { label: 'Name' })
  const up = newBlock('upload', { label: 'File' })
  const f = publishedForm([q, up], { ops: { retentionDays: 30 } })
  for (let i = 0; i < 3; i++) {
    const r = svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: `R${i}` }, meta })
    const fid = `fil_race${i}aaaaaaaaaaaaaaaa`
    repo.insertFile({ id: fid, formId: f.id, submissionId: r.submissionId, blockId: up.id, storageKey: `forms/race/${fid}`, originalName: `passport-${i}.pdf`, mime: 'application/pdf', size: 10, uploadTokenHash: null })
    repo.updateFile(fid, { status: 'uploaded' })
    getDb().prepare(`UPDATE form_submissions SET submitted_at = ?, last_activity_at = ? WHERE id = ?`).run('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', r.submissionId)
  }
  const real = getStorage()
  setStorageForTests({ ...real, delete: async () => { await new Promise(r => setTimeout(r, 20)) } })
  try {
    const [purge, sweep] = await Promise.all([svc.purgeResponses(f.id, {}, 'owner@example.com'), svc.sweep()])
    assert.equal(purge.deleted + sweep.expired, 3, 'each response is deleted once, by one of them')
  } finally { setStorageForTests(null) }
  assert.equal(svc.listResponses(f.id, { status: 'all' }).total, 0)
  assert.deepEqual((getDb().prepare(`SELECT DISTINCT original_name AS n FROM form_files WHERE form_id = ?`).all(f.id) as Array<{ n: string }>).map(r => r.n), [''], 'file names go with the response')
})

test('the response that filled the limit, retried, gets its own result back — not "closed"', () => {
  const q = newBlock('short', { label: 'Name', required: true })
  const f = publishedForm([q], { ops: { maxResponses: 1 } })
  const k = key()
  const first = svc.submitResponse(f.id, { idempotencyKey: k, answers: { [q.id]: 'Ada' }, meta })
  const again = svc.submitResponse(f.id, { idempotencyKey: k, answers: { [q.id]: 'Ada' }, meta })
  assert.deepEqual([again.submissionId, again.duplicate], [first.submissionId, true])
  assert.throws(() => svc.submitResponse(f.id, { idempotencyKey: key(), answers: { [q.id]: 'Grace' }, meta }), failsWith(410))

  const g = publishedForm([q], { ops: { maxResponses: 1 } })
  const draft = svc.saveRespondentDraft(g.id, { answers: { [q.id]: 'Grace' }, meta })
  const sent = svc.submitResponse(g.id, { token: draft.token, idempotencyKey: key(), answers: { [q.id]: 'Grace' }, meta })
  assert.equal(svc.submitResponse(g.id, { token: draft.token, idempotencyKey: key(), answers: { [q.id]: 'Grace' }, meta }).submissionId, sent.submissionId)
})

test('a draft saved before a schema default was added publishes clean, once', () => {
  const q = newBlock('short', { label: 'Name' })
  const f = publishedForm([q])
  const cur = svc.getFormDetail(f.id).draft
  const old = JSON.parse(JSON.stringify({ ...cur, title: 'Edited before the deploy' }))
  for (const k of ['backButton', 'saveResume', 'allowEdits', 'language', 'description']) delete old.settings[k]
  delete old.theme.footer
  getDb().prepare(`UPDATE forms SET draft_definition = ?, draft_hash = ? WHERE id = ?`).run(JSON.stringify(old), definitionHash(old), f.id)
  assert.equal(svc.getFormDetail(f.id).publishState, 'dirty')
  assert.equal(svc.publishForm(f.id, { by: null }).created, true)
  assert.equal(svc.getFormDetail(f.id).publishState, 'live')
  assert.equal(svc.publishForm(f.id, { by: null }).created, false, 'publishing again makes no identical version')
})
