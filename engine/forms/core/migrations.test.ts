import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateDefinition, detectSchemaVersion } from './migrations'
import { parseDefinition } from './schema'
import { evaluate, normalizeAnswers, ruleSentence } from './logic'
import './components/index'

const v1 = {
  name: 'GRYD OS Blueprint', slug: 'blueprint',
  pages: [
    { id: 'p1', name: 'About you', btn: 'Continue', blocks: [
      { id: 'b100', type: 'dropdown', label: 'Company size', required: true, options: ['1–10', '11–50', '51–200'] },
      { id: 'b101', type: 'short', label: 'First name', ph: 'Ada', width: 'half', desc: 'Given name' },
    ] },
    { id: 'p2', name: 'Enterprise', btn: 'Continue', blocks: [{ id: 'b102', type: 'long', label: 'More' }] },
  ],
  endings: [{ id: 'e1', name: 'Thanks', kind: 'message', title: 'T', body: 'B', btn: 'Go', url: 'https://x' }, { id: 'e2', name: 'R', kind: 'redirect', title: '', body: '', url: 'https://example.com' }],
  rules: [
    { id: 'r1', when: { join: 'AND', items: [{ field: 'b100', op: 'is any of', value: '11–50, 51–200' }] }, then: { action: 'show page', target: 'p2' } },
    { id: 'r2', when: { join: 'OR', items: [{ field: 'b100', op: 'is', value: '1–10' }, { join: 'AND', items: [{ field: 'b101', op: 'contains', value: 'a' }] }] }, then: { action: 'end with', target: 'e2' } },
  ],
}

test('v1 documents are detected as version 1', () => {
  assert.equal(detectSchemaVersion(v1), 1)
  assert.equal(detectSchemaVersion({ schemaVersion: 2 }), 2)
})

test('v1 → v2 is deterministic and produces a valid document', () => {
  const a = migrateDefinition(v1), b = migrateDefinition(v1)
  assert.deepEqual(a.definition, b.definition)
  assert.deepEqual(a.steps, ['1→2'])
  const parsed = parseDefinition(a.definition)
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues))
  const def = parsed.definition!
  assert.equal(def.pages[0].blocks[0].options.length, 3)
  assert.equal(def.pages[0].blocks[1].placeholder, 'Ada')
  assert.equal(def.pages[0].blocks[1].description, 'Given name')
  assert.equal(def.endings[1].redirectUrl, 'https://example.com')
  assert.equal(def.endings[0].buttonUrl, 'https://x')
})

test('migrated rules reference option ids, not labels, and still evaluate', () => {
  const def = parseDefinition(migrateDefinition(v1).definition).definition!
  const size = def.pages[0].blocks[0]
  const r1 = def.rules[0]
  assert.equal(r1.then.type, 'show_page')
  const vals = (r1.when.items[0] as any).value as string[]
  assert.deepEqual(vals, [size.options[1].id, size.options[2].id])
  assert.equal(ruleSentence(def, r1), 'When Company size is any of 11–50, 51–200, show page Enterprise.')
  const stHidden = evaluate(def, normalizeAnswers(def, { [size.id]: size.options[0].id }))
  assert.ok(stHidden.hiddenPages.has('p2'))
  const stShown = evaluate(def, normalizeAnswers(def, { [size.id]: size.options[2].id }))
  assert.ok(!stShown.hiddenPages.has('p2'))
  assert.equal(stHidden.endingId, 'e2')
  assert.equal(stShown.endingId, 'e1')
})

test('a document from the future is refused', () => {
  assert.throws(() => migrateDefinition({ schemaVersion: 99 }), /newer/)
})

test('stable ids are preserved across migration', () => {
  const def = parseDefinition(migrateDefinition(v1).definition).definition!
  assert.deepEqual(def.pages.map(p => p.id), ['p1', 'p2'])
  assert.deepEqual(def.pages[0].blocks.map(b => b.id), ['b100', 'b101'])
  assert.deepEqual(def.endings.map(e => e.id), ['e1', 'e2'])
  assert.deepEqual(def.rules.map(r => r.id), ['r1', 'r2'])
})
