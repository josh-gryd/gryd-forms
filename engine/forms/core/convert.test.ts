import test from 'node:test'
import assert from 'node:assert/strict'
import './components/index'
import { emptyForm, newBlock } from './factory'
import { makeOptions } from './components/choices'
import { parseDefinition, cloneDefinition, type FormDefinition, type Block } from './schema'
import { conversionTargets, planConversion, carryAnswer } from './convert'
import { blockSettings } from './registry'
import { checkRules } from './logic'

function formWith(...blocks: Block[]): FormDefinition {
  const def = emptyForm('Convert')
  def.pages[0].blocks = blocks
  return def
}

test('only real types are offered, and only sensible ones', () => {
  assert.deepEqual(conversionTargets('short'), ['long', 'email', 'phone', 'url', 'number', 'choice', 'checks', 'dropdown'])
  assert.deepEqual(conversionTargets('long'), ['short', 'email', 'phone', 'url', 'number', 'choice', 'checks', 'dropdown'])
  assert.deepEqual(conversionTargets('email'), ['short', 'long', 'phone', 'url', 'number'])
  assert.deepEqual(conversionTargets('checks'), ['choice', 'dropdown', 'picture', 'short', 'long'])
  for (const t of ['heading', 'upload', 'signature', 'matrix', 'hidden', 'date', 'rating', 'yesno'] as const) assert.deepEqual(conversionTargets(t), [], t)
})

test('short ↔ long is lossless and keeps id, label, description, required, width and limits', () => {
  const q = newBlock('short', { label: 'Your role', description: 'One line', required: true, width: 'half', placeholder: 'Engineer', settings: { maxLength: 80, autoComplete: 'organization-title' } })
  const def = formWith(q)
  const toLong = planConversion(def, q.id, 'long')!
  assert.deepEqual(toLong.losses, [])
  const b = toLong.block
  assert.equal(b.id, q.id); assert.equal(b.type, 'long'); assert.equal(b.label, 'Your role'); assert.equal(b.description, 'One line')
  assert.equal(b.required, true); assert.equal(b.width, 'half'); assert.equal(b.placeholder, 'Engineer'); assert.equal(b.settings.maxLength, 80)
  assert.equal(def.pages[0].blocks[0].type, 'short', 'the input definition is never mutated')
  const back = planConversion(toLong.def, q.id, 'short')!
  assert.deepEqual(back.losses, [])
  assert.deepEqual(back.block, { ...q, settings: { ...q.settings } })
  assert.equal(parseDefinition(back.def).ok, true)
})

test('a label and placeholder still at the default follow the new type', () => {
  const q = newBlock('short')
  const p = planConversion(formWith(q), q.id, 'long')!
  assert.equal(p.block.label, 'Long answer')
  assert.equal(p.block.placeholder, 'Write as much as you like')
})

test('choice ↔ checks ↔ dropdown keep the options, their ids and the layout; rules follow', () => {
  const q = newBlock('choice', { label: 'Plan', required: true, options: makeOptions(['Basic', 'Pro']), settings: { layout: 'inline' } })
  const def = formWith(q, newBlock('short', { label: 'Why' }))
  def.rules.push({ id: 'r1', when: { id: 'g1', join: 'and', items: [{ id: 'c1', field: q.id, op: 'eq', value: q.options[1].id }] }, then: { type: 'show_field', target: def.pages[0].blocks[1].id } })
  const multi = planConversion(def, q.id, 'checks')!
  assert.deepEqual(multi.losses, [])
  assert.deepEqual(multi.block.options, q.options)
  assert.equal(multi.block.settings.layout, 'inline')
  assert.equal(multi.rulesAdjusted, 1)
  assert.equal((multi.def.rules[0].when.items[0] as { op: string }).op, 'contains')
  assert.deepEqual(checkRules(multi.def), [])
  const single = planConversion(multi.def, q.id, 'choice')!
  assert.equal((single.def.rules[0].when.items[0] as { op: string }).op, 'eq')
  const dd = planConversion(def, q.id, 'dropdown')!
  assert.deepEqual(dd.losses, []); assert.deepEqual(dd.block.options, q.options)
})

test('lossy changes say what goes: options, limits, the email role, broken rules', () => {
  const tools = newBlock('checks', { label: 'Tools', options: makeOptions(['Slack', 'Jira', 'Notion', 'Linear']), settings: { max: 2, layout: 'inline' } })
  const toText = planConversion(formWith(tools), tools.id, 'short')!
  assert.equal(toText.block.options.length, 0)
  assert.ok(toText.losses.some(l => /Removes its 4 options \(Slack, Jira, Notion…\)/.test(l)), toText.losses.join(' | '))
  assert.ok(toText.losses.some(l => /minimum and maximum selections/.test(l)))
  assert.ok(toText.losses.some(l => /pills layout/.test(l)))

  const email = newBlock('email', { settings: { workOnly: true } })
  const e = planConversion(formWith(email), email.id, 'short')!
  assert.ok(e.losses.some(l => /work-emails-only/.test(l)))
  assert.ok(e.losses.some(l => /stops counting as an email question/.test(l)))

  const name = newBlock('short', { label: 'Name' })
  const next = newBlock('short', { label: 'Next' })
  const def = formWith(name, next)
  def.rules.push({ id: 'r1', when: { id: 'g1', join: 'and', items: [{ id: 'c1', field: name.id, op: 'contains', value: 'x' }] }, then: { type: 'hide_field', target: next.id } })
  const num = planConversion(def, name.id, 'number')!
  assert.ok(num.losses.some(l => /1 logic condition won’t work with Number/.test(l)), num.losses.join(' | '))
  assert.equal((num.def.rules[0].when.items[0] as { op: string }).op, 'contains', 'a rule is never rewritten into a different meaning')
})

test('text → choice starts with fresh options; picture keeps multiple from checks', () => {
  const q = newBlock('short', { label: 'Team size' })
  const p = planConversion(formWith(q), q.id, 'dropdown')!
  assert.equal(p.block.options.length, 3)
  assert.deepEqual(p.losses, [])
  const c = newBlock('checks', { options: makeOptions(['A', 'B']) })
  const pic = planConversion(formWith(c), c.id, 'picture')!
  assert.equal(blockSettings<{ multiple: boolean }>(pic.block).multiple, true)
})

test('an unsupported change or a missing field returns null', () => {
  const q = newBlock('upload')
  const def = formWith(q)
  assert.equal(planConversion(def, q.id, 'short'), null)
  assert.equal(planConversion(def, 'b_missing', 'short'), null)
})

test('carryAnswer reads an older answer as the new type would', () => {
  const checks = newBlock('checks', { options: makeOptions(['Slack', 'Jira']) })
  const short = { ...cloneDefinition(checks), type: 'short' as const, options: [] }
  assert.equal(carryAnswer(checks, short, [checks.options[0].id, checks.options[1].id]), 'Slack, Jira')
  const choice = { ...checks, type: 'choice' as const }
  assert.equal(carryAnswer(checks, choice, [checks.options[0].id]), checks.options[0].id)
  assert.deepEqual(carryAnswer(choice, checks, checks.options[1].id), [checks.options[1].id])
  const n = newBlock('number'), s = newBlock('short')
  assert.equal(carryAnswer(s, n, '1,200'), 1200)
  assert.equal(carryAnswer(s, n, 'lots'), undefined)
  assert.equal(carryAnswer(n, s, 42), '42')
  assert.equal(carryAnswer(s, newBlock('choice'), 'Pro'), undefined)
})

test('choice layout: a missing setting reads as list, pills persist as "inline"', () => {
  const old = newBlock('checks', { options: makeOptions(['A']) })
  delete (old.settings as Record<string, unknown>).layout
  assert.equal(blockSettings<{ layout: string }>(old).layout, 'list')
  const pills = newBlock('checks', { options: makeOptions(['A']), settings: { layout: 'inline' } })
  const r = parseDefinition(formWith(old, pills))
  assert.equal(r.ok, true)
  assert.equal(blockSettings<{ layout: string }>(r.definition!.pages[0].blocks[0]).layout, 'list')
  assert.equal(blockSettings<{ layout: string }>(r.definition!.pages[0].blocks[1]).layout, 'inline')
  assert.equal(blockSettings<{ layout: string }>({ ...pills, settings: { layout: 'sideways' } }).layout, 'list')
})
