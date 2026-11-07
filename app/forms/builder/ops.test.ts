import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyForm, newBlock, seedComplexForm, makeOptions, rowsOf, checkRules } from '@/lib/forms-core/index'
import { appendBlock, dropBlock, duplicateBlock, removeBlock, moveBlockBy, moveBlockToContainer, setOptionsFromText, deletePage, deleteEnding, addPage, addEnding, insertColumns, fillSlot, newRule, addRule, locate, restoreBlock } from './ops'
import { flowLayout } from './flow'

test('ops never mutate the input document', () => {
  const def = emptyForm()
  const before = JSON.stringify(def)
  const b = newBlock('short')
  const next = appendBlock(def, def.pages[0].id, b)
  assert.equal(JSON.stringify(def), before)
  assert.equal(next.pages[0].blocks.length, 1)
})

test('side drop builds a half-width column row; top/bottom keeps target width', () => {
  let def = emptyForm()
  const a = newBlock('short', { label: 'A' }), b = newBlock('short', { label: 'B' }), c = newBlock('short', { label: 'C' })
  def = appendBlock(def, def.pages[0].id, a)
  def = appendBlock(def, def.pages[0].id, b)
  def = appendBlock(def, def.pages[0].id, c)
  const r1 = dropBlock(def, { blockId: c.id }, a.id, 'right')!
  const blocks = r1.def.pages[0].blocks
  assert.deepEqual(blocks.map(x => x.label), ['A', 'C', 'B'])
  assert.deepEqual(blocks.map(x => x.width), ['half', 'half', 'full'])
  assert.equal(rowsOf(blocks).length, 2)
  // ids never change on a move
  assert.equal(blocks[1].id, c.id)
  const r2 = dropBlock(r1.def, { blockId: b.id }, a.id, 'top')!
  assert.deepEqual(r2.def.pages[0].blocks.map(x => x.label), ['B', 'A', 'C'])
  assert.equal(r2.def.pages[0].blocks[0].width, 'half')
})

test('a new block dropped from the library takes the zone rules too', () => {
  let def = emptyForm()
  const a = newBlock('short', { label: 'A' })
  def = appendBlock(def, def.pages[0].id, a)
  const r = dropBlock(def, { block: newBlock('email') }, a.id, 'left')!
  assert.deepEqual(r.def.pages[0].blocks.map(x => x.type), ['email', 'short'])
  assert.deepEqual(r.def.pages[0].blocks.map(x => x.width), ['half', 'half'])
})

test('duplicate inserts directly below with fresh ids for the block and its options', () => {
  let def = emptyForm()
  const a = newBlock('choice', { options: makeOptions(['x', 'y']) })
  def = appendBlock(def, def.pages[0].id, a)
  const r = duplicateBlock(def, a.id)!
  const [orig, copy] = r.def.pages[0].blocks
  assert.equal(copy.id, r.id)
  assert.notEqual(copy.id, orig.id)
  assert.notEqual(copy.options[0].id, orig.options[0].id)
  assert.equal(copy.options[0].label, 'x')
})

test('remove + restore puts a block back at its index', () => {
  let def = emptyForm()
  const a = newBlock('short', { label: 'A' }), b = newBlock('short', { label: 'B' })
  def = appendBlock(def, def.pages[0].id, a)
  def = appendBlock(def, def.pages[0].id, b)
  const loc = locate(def, a.id)!
  const without = removeBlock(def, a.id)
  assert.equal(without.pages[0].blocks.length, 1)
  const back = restoreBlock(without, loc.containerId, loc.index, loc.block)
  assert.deepEqual(back.pages[0].blocks.map(x => x.id), [a.id, b.id])
})

test('move up/down and move to page', () => {
  let def = emptyForm()
  const a = newBlock('short', { label: 'A' }), b = newBlock('short', { label: 'B' })
  def = appendBlock(def, def.pages[0].id, a)
  def = appendBlock(def, def.pages[0].id, b)
  def = moveBlockBy(def, b.id, -1)
  assert.deepEqual(def.pages[0].blocks.map(x => x.id), [b.id, a.id])
  assert.equal(moveBlockBy(def, b.id, -1), def) // no-op at the edge
  const p2 = addPage(def)
  def = moveBlockToContainer(p2.def, a.id, p2.id)
  assert.deepEqual(def.pages[0].blocks.map(x => x.id), [b.id])
  assert.deepEqual(def.pages[1].blocks.map(x => x.id), [a.id])
})

test('options from text keep ids for unchanged labels and for in-place renames', () => {
  let def = emptyForm()
  const a = newBlock('choice', { options: makeOptions(['One', 'Two', 'Three']) })
  def = appendBlock(def, def.pages[0].id, a)
  const ids = a.options.map(o => o.id)
  def = setOptionsFromText(def, a.id, 'One\nTwo!\nThree\nFour')
  const opts = def.pages[0].blocks[0].options
  assert.deepEqual(opts.map(o => o.label), ['One', 'Two!', 'Three', 'Four'])
  assert.equal(opts[0].id, ids[0])
  assert.equal(opts[1].id, ids[1], 'a rename in place keeps its id')
  assert.equal(opts[2].id, ids[2])
  assert.notEqual(opts[3].id, ids[0])
  // reorder keeps ids by label
  def = setOptionsFromText(def, a.id, 'Three\nOne')
  const o2 = def.pages[0].blocks[0].options
  assert.deepEqual(o2.map(o => o.id), [ids[2], ids[0]])
})

test('the last answer page and the last ending cannot be deleted', () => {
  const def = emptyForm()
  assert.equal(deletePage(def, def.pages[0].id), null)
  assert.equal(deleteEnding(def, def.endings[0].id), null)
  const p = addPage(def)
  const r = deletePage(p.def, p.id)!
  assert.equal(r.def.pages.length, 1)
  assert.equal(r.removed.id, p.id)
})

test('deleting an ending removes the rules that target it', () => {
  const def = seedComplexForm()
  const e2 = def.endings[1]
  const targeted = def.rules.filter(r => r.then.type === 'go_to_ending' && r.then.target === e2.id)
  assert.ok(targeted.length > 0)
  const r = deleteEnding(def, e2.id)!
  assert.equal(r.rulesRemoved.length, targeted.length)
  assert.ok(r.def.rules.every(x => !(x.then.type === 'go_to_ending' && x.then.target === e2.id)))
})

test('columns: slots are inserted with the right width and filled in place', () => {
  const def = emptyForm()
  const r = insertColumns(def, def.pages[0].id, 0, 3)
  assert.equal(r.ids.length, 3)
  assert.ok(r.def.pages[0].blocks.every(b => b.type === 'slot' && b.width === 'third'))
  const filled = fillSlot(r.def, r.ids[1], newBlock('email'))
  assert.deepEqual(filled.pages[0].blocks.map(b => b.type), ['slot', 'email', 'slot'])
  assert.equal(filled.pages[0].blocks[1].width, 'third')
})

test('a new rule is valid against the engine checks', () => {
  const def = seedComplexForm()
  const size = def.pages[0].blocks.find(b => b.type === 'dropdown')!
  const rule = newRule(def, { fieldId: size.id, action: 'go_to_ending' })
  const next = addRule(def, rule)
  assert.deepEqual(checkRules(next).filter(i => i.ruleId === rule.id), [])
  const ending = addEnding(next)
  assert.equal(ending.def.endings.length, 4)
})

test('flow layout: nodes do not overlap and rule edges are labelled', () => {
  const def = seedComplexForm()
  const f = flowLayout(def)
  assert.equal(f.nodes.length, def.pages.length + def.endings.length)
  for (let i = 0; i < f.nodes.length; i++) for (let j = i + 1; j < f.nodes.length; j++) {
    const a = f.nodes[i], b = f.nodes[j]
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    assert.equal(overlap, false, `${a.name} overlaps ${b.name}`)
  }
  const gold = f.edges.filter(e => e.cond)
  assert.ok(gold.length >= 2)
  assert.ok(gold.every(e => /^\d+ · /.test(e.label)))
  assert.ok(f.edges.some(e => e.label === 'otherwise'))
})
