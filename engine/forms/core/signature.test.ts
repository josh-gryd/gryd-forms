import test from 'node:test'
import assert from 'node:assert/strict'
import { componentDef, libraryItems } from './registry'
import { newBlock, emptyForm } from './factory'
import { parseDefinition } from './schema'
import { evaluate, applySetValues } from './logic'
import { signaturePath, inkLength, SIGNATURE_W, SIGNATURE_H, DEFAULT_AGREEMENT } from './components/signature'
import './components/index'

const d = componentDef('signature')
const stroke = (n = 20) => Array.from({ length: n }, (_, i) => [40 + i * 10, 120 + (i % 2 ? 12 : -12)]).flat()

test('e-signature is in the palette under Media and found by "esign"', () => {
  const media = libraryItems('').groups.find(g => g.category === 'Media')
  assert.ok(media?.items.some(i => i.type === 'signature' && i.label === 'E-signature'))
  for (const q of ['esign', 'e-sign', 'signature', 'autograph']) assert.ok(libraryItems(q).flat.some(i => i.type === 'signature'), q)
})

test('a new e-signature block offers drawing or typing and carries the agreement line', () => {
  const b = newBlock('signature')
  assert.equal(b.label, 'Signature')
  assert.deepEqual(d.settings(b.settings), { mode: 'both', agreement: DEFAULT_AGREEMENT })
  assert.deepEqual(d.settings({ mode: 'draw-only', agreement: 7 }), { mode: 'both', agreement: DEFAULT_AGREEMENT })
  assert.deepEqual(d.settings({ mode: 'type', agreement: '' }), { mode: 'type', agreement: '' })
})

test('a drawn signature is kept as rounded points inside the pad', () => {
  const b = newBlock('signature')
  const v = d.normalize(b, { kind: 'drawn', strokes: [[10.4, 20.6, 30, 40], [-5, 900, 800, -2, Number.NaN, 3, 'x', 4], 'junk', []] })
  assert.deepEqual(v, { kind: 'drawn', strokes: [[10, 21, 30, 40], [0, SIGNATURE_H, SIGNATURE_W, 0]] })
})

test('a drawn signature is capped in strokes and points', () => {
  const b = newBlock('signature')
  const many = Array.from({ length: 200 }, () => [1, 1, 2, 2])
  const v = d.normalize(b, { kind: 'drawn', strokes: many }) as { strokes: number[][] }
  assert.equal(v.strokes.length, 80)
  const long = d.normalize(b, { kind: 'drawn', strokes: [Array.from({ length: 30000 }, (_, i) => i % 400)] }) as { strokes: number[][] }
  assert.equal(long.strokes[0].length, 10000)
})

test('a typed signature is the name, tidied and capped', () => {
  const b = newBlock('signature')
  assert.deepEqual(d.normalize(b, { kind: 'typed', name: '  Ada   Lovelace \n' }), { kind: 'typed', name: 'Ada Lovelace' })
  assert.equal((d.normalize(b, { kind: 'typed', name: 'x'.repeat(500) }) as { name: string }).name.length, 120)
  assert.equal(d.normalize(b, { kind: 'typed', name: '   ' }), undefined)
})

test('nothing but a signature-shaped object becomes a signature', () => {
  const b = newBlock('signature')
  for (const raw of ['Ada', 42, true, ['drawn'], null, undefined, '', {}, { kind: 'stamp', name: 'Ada' }, { kind: 'drawn' }, { kind: 'drawn', strokes: 'M0 0' }, { kind: 'drawn', strokes: [] }]) {
    assert.equal(d.normalize(b, raw), undefined, JSON.stringify(raw) ?? String(raw))
  }
})

test('a logic rule cannot sign for the respondent', () => {
  const def = emptyForm('QA-TEST Sign')
  const name = newBlock('short', { label: 'Name' })
  const sig = newBlock('signature', { required: true })
  def.pages[0].blocks = [name, sig]
  def.rules = [{ id: 'r_sigset01', when: { id: 'c_sigset01', join: 'and', items: [{ id: 'c_sigset02', field: name.id, op: 'not_empty', value: null }] }, then: { type: 'set_value', target: sig.id, value: 'Ada Lovelace' } }]
  const answers = { [name.id]: 'Ada' }
  const state = evaluate(def, answers)
  assert.equal(state.setValues.get(sig.id), 'Ada Lovelace')
  assert.equal(applySetValues(def, answers, state)[sig.id], undefined)
})

test('required, too-short and wrong-mode signatures get plain messages', () => {
  const req = newBlock('signature', { required: true })
  assert.equal(d.validate(req, undefined, {}), 'Add your signature to continue.')
  assert.equal(d.validate(newBlock('signature'), undefined, {}), null)
  assert.equal(d.validate(req, { kind: 'drawn', strokes: [[100, 100]] }, {}), 'Draw your full signature.')
  assert.equal(d.validate(req, { kind: 'drawn', strokes: [[100, 100, 120, 102]] }, {}), 'Draw your full signature.')
  assert.equal(d.validate(req, { kind: 'drawn', strokes: [stroke()] }, {}), null)
  assert.equal(d.validate(req, { kind: 'typed', name: 'A' }, {}), 'Type your full name to sign.')
  assert.equal(d.validate(req, { kind: 'typed', name: 'Ada Lovelace' }, {}), null)
  const typeOnly = newBlock('signature', { required: true, settings: { mode: 'type' } })
  assert.equal(d.validate(typeOnly, { kind: 'drawn', strokes: [stroke()] }, {}), 'Type your full name to sign.')
  assert.equal(d.validate(typeOnly, { kind: 'typed', name: 'Ada Lovelace' }, {}), null)
})

test('empty, logic and display read the signature, never its coordinates', () => {
  const b = newBlock('signature')
  const drawn = { kind: 'drawn' as const, strokes: [stroke()] }
  assert.equal(d.isEmpty(undefined), true)
  assert.equal(d.isEmpty({ kind: 'drawn', strokes: [] } as never), true)
  assert.equal(d.isEmpty(drawn), false)
  assert.equal(d.logicValue(b, drawn), 'signed')
  assert.equal(d.logicValue(b, undefined), null)
  assert.deepEqual(d.logic.ops, ['empty', 'not_empty'])
  assert.equal(d.display(b, drawn), 'Drawn signature')
  assert.equal(d.display(b, { kind: 'typed', name: 'Ada Lovelace' }), 'Typed signature: Ada Lovelace')
  assert.equal(d.display(b, undefined), '')
})

test('strokes draw as smooth SVG paths, and a single point as a dot', () => {
  assert.equal(signaturePath([[10, 20]]), 'M10 20h0.01')
  assert.equal(signaturePath([[10, 20, 30, 40]]), 'M10 20L30 40')
  assert.equal(signaturePath([[0, 0, 10, 10, 20, 0]]), 'M0 0Q10 10 15 5L20 0')
  assert.equal(signaturePath([[0, 0, 3, 4], [5, 5]]), 'M0 0L3 4M5 5h0.01')
  assert.equal(inkLength([[0, 0, 3, 4], [5, 5]]), 5)
})

test('a form with an e-signature round-trips through the parser', () => {
  const def = emptyForm('QA-TEST Sign')
  def.pages[0].blocks = [newBlock('signature', { required: true, settings: { mode: 'type', agreement: 'I sign.' } })]
  const parsed = parseDefinition(JSON.parse(JSON.stringify(def)))
  assert.ok(parsed.ok, JSON.stringify(parsed.issues))
  const b = parsed.definition!.pages[0].blocks[0]
  assert.equal(b.type, 'signature')
  assert.deepEqual(d.settings(b.settings), { mode: 'type', agreement: 'I sign.' })
})
