process.env.DB_PATH = ':memory:'
process.env.FORMS_STORAGE = 'local'
process.env.FORMS_STORAGE_DIR = `/tmp/forms-demo-test-${process.pid}`
process.env.FORMS_MAINTENANCE = '0'
process.env.FORMS_DEMO = '1'

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import * as svc from './forms/service.js'
import * as ws from './forms/workspace.js'
import { slackTargets } from './forms/slack.js'
import { getDb } from './db/index.js'
import { resetDemo, nextResetAt, DEMO_MAX_FORMS, DEMO_RESET_MS } from './demo.js'
import { emptyForm, newBlock, newEnding, type FormDefinition } from './forms/core/index'

const count = (table: string) => (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
const failsWith = (status: number) => (err: unknown) => (err as { status?: number }).status === status

test('a reset wipes everything and seeds the sample forms with responses', async () => {
  svc.createForm({ title: 'Someone else’s form', createdBy: 'stranger@example.com' })
  fs.mkdirSync(process.env.FORMS_STORAGE_DIR!, { recursive: true })
  fs.writeFileSync(path.join(process.env.FORMS_STORAGE_DIR!, 'left-behind.bin'), 'x')
  await resetDemo()
  const forms = svc.listForms()
  assert.deepEqual(forms.map(f => f.title).sort(), ['Client Intake', 'Customer Feedback', 'Newsletter Signup (draft)', 'Spring Workshop Registration', 'Website Contact'])
  assert.equal(forms.filter(f => f.status === 'published').length, 4)
  assert.ok(forms.every(f => f.title !== 'Someone else’s form'))
  assert.deepEqual(fs.readdirSync(process.env.FORMS_STORAGE_DIR!), [])
  const completed = forms.reduce((n, f) => n + f.completedCount, 0)
  assert.ok(completed >= 40, `seeded ${completed} responses`)
  // The intake form refuses free email addresses, as the demo promises.
  const intake = forms.find(f => f.title === 'Client Intake')!
  const def = svc.getFormDetail(intake.id).draft as FormDefinition
  const email = def.pages.flatMap(p => p.blocks).find(b => b.type === 'email')!
  assert.equal(email.settings.workOnly, true)
  // A second reset gives the same starting point, not double.
  await resetDemo()
  assert.equal(svc.listForms().length, 5)
})

test('the demo refuses uploads, image uploads and Slack, and never notifies', async () => {
  await resetDemo()
  const f = svc.listForms().find(x => x.status === 'published')!
  await assert.rejects(svc.createUpload(f.id, { blockId: 'b_x', name: 'a.pdf', size: 10, mime: 'application/pdf' } as never), failsWith(403))
  await assert.rejects(svc.uploadAsset(f.id, { name: 'logo.png', body: Readable.from([Buffer.from('x')]), by: null }), failsWith(403))
  await assert.rejects(ws.uploadWorkspaceAsset({ name: 'logo.png', body: Readable.from([Buffer.from('x')]), by: null }), failsWith(403))
  assert.match((await slackTargets('')).unavailable ?? '', /turned off in the demo/)
  assert.deepEqual(await ws.listSenders(), [])
  assert.equal(count('form_notifications'), 0)
})

test('a redirect ending can’t be published in the demo; a thank-you ending can', async () => {
  await resetDemo()
  const def = emptyForm('Phish?')
  def.pages[0].blocks.push(newBlock('short', { label: 'Name' }))
  def.endings = [newEnding(1, { kind: 'redirect', redirectUrl: 'https://example.com/login' })]
  const f = svc.createForm({ definition: def, createdBy: null })
  assert.throws(() => svc.publishForm(f.id, { by: null }), failsWith(422))
  const fixed = svc.getFormDetail(f.id).draft as FormDefinition
  fixed.endings = [newEnding(1, { kind: 'message', title: 'Thanks' })]
  svc.saveDraft(f.id, { definition: fixed, baseRevision: svc.getFormDetail(f.id).revision, by: null })
  assert.equal(svc.publishForm(f.id, { by: null }).version.number, 1)
})

test('the demo holds at most DEMO_MAX_FORMS forms until the next reset', async () => {
  await resetDemo()
  for (let n = svc.listForms().length; n < DEMO_MAX_FORMS; n++) svc.createForm({ title: `Filler ${n}`, createdBy: null })
  assert.throws(() => svc.createForm({ title: 'One too many', createdBy: null }), failsWith(429))
  const any = svc.listForms()[0]
  assert.throws(() => svc.duplicateForm(any.id, null), failsWith(429))
  await resetDemo()
  assert.ok(svc.createForm({ title: 'Room again', createdBy: null }).id)
})

test('resets land on the top of the hour', () => {
  const t = Date.UTC(2026, 10, 7, 14, 23, 5)
  assert.equal(nextResetAt(t), Date.UTC(2026, 10, 7, 15, 0, 0))
  assert.equal(nextResetAt(Date.UTC(2026, 10, 7, 15, 0, 0)), Date.UTC(2026, 10, 7, 15, 0, 0) + DEMO_RESET_MS)
})
