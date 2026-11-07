import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, activeAnswers, nextPageId, visiblePages, validatePage, checkRules, ruleSentence, applySetValues, normalizeAnswers, compare, rulesUsingBlock, isConditionalPage, sourcePageOf, pagePath } from './logic'
import { seedComplexForm, emptyForm, newBlock, newPage, newEnding } from './factory'
import { makeOptions } from './components/choices'
import { shortId } from './ids'
import type { FormDefinition, Rule } from './schema'
import './components/index'

function rule(when: Rule['when']['items'], then: Rule['then'], join: 'and' | 'or' = 'and'): Rule {
  return { id: shortId('r'), when: { id: shortId('c'), join, items: when }, then }
}
const cond = (field: string, op: any, value: any) => ({ id: shortId('c'), field, op, value })

test('compare covers every operator per value kind', () => {
  assert.equal(compare('eq', 'a', 'a', 'text'), true)
  assert.equal(compare('neq', 'a', 'b', 'text'), true)
  assert.equal(compare('contains', 'Hello World', 'world', 'text'), true)
  assert.equal(compare('not_contains', 'Hello', 'x', 'text'), true)
  assert.equal(compare('gt', 51, '50', 'number'), true)
  assert.equal(compare('gte', 50, 50, 'number'), true)
  assert.equal(compare('lt', 49, 50, 'number'), true)
  assert.equal(compare('lte', 50, 50, 'number'), true)
  assert.equal(compare('empty', null, null, 'text'), true)
  assert.equal(compare('empty', '', null, 'text'), true)
  assert.equal(compare('not_empty', 'x', null, 'text'), true)
  assert.equal(compare('in', 'o_2', ['o_1', 'o_2'], 'option'), true)
  assert.equal(compare('not_in', 'o_3', ['o_1', 'o_2'], 'option'), true)
  assert.equal(compare('contains', ['o_1', 'o_3'], ['o_3'], 'options'), true)
  assert.equal(compare('eq', ['o_1', 'o_3'], ['o_3', 'o_1'], 'options'), true)
  assert.equal(compare('is_true', true, null, 'boolean'), true)
  assert.equal(compare('is_false', false, null, 'boolean'), true)
  assert.equal(compare('gt', '2026-02-01', '2026-01-31', 'date'), true)
  assert.equal(compare('gt', 'abc', '5', 'number'), false)
  // an unanswered field never satisfies a positive comparison
  assert.equal(compare('eq', null, 'a', 'text'), false)
  assert.equal(compare('neq', null, 'a', 'text'), true)
})

test('seed form: size routes the enterprise page and the ending', () => {
  const def = seedComplexForm()
  const size = def.pages[0].blocks.find(b => b.label === 'Company size')!
  const role = def.pages[1].blocks[0]
  const small = evaluate(def, { [size.id]: size.options[0].id, [role.id]: role.options[0].id })
  assert.ok(small.hiddenPages.has(def.pages[2].id))
  assert.equal(small.endingId, def.endings[0].id)
  // "role is not Founder" holds while role is unanswered, so the redirect rule fires.
  assert.equal(evaluate(def, { [size.id]: size.options[0].id }).endingId, def.endings[2].id)
  assert.deepEqual(visiblePages(def, small).map(p => p.name), ['About you', 'Your work', 'Wrap up'])
  assert.equal(nextPageId(def, small, def.pages[1].id), def.pages[3].id)
  const big = evaluate(def, { [size.id]: size.options[3].id })
  assert.ok(!big.hiddenPages.has(def.pages[2].id))
  assert.equal(big.endingId, def.endings[1].id)
  const exploring = evaluate(def, { [size.id]: size.options[3].id, [role.id]: role.options[4].id })
  // Rule order decides: the enterprise ending rule comes first.
  assert.equal(exploring.endingId, def.endings[1].id)
  const tiny = evaluate(def, { [size.id]: size.options[0].id, [role.id]: role.options[1].id })
  assert.equal(tiny.endingId, def.endings[2].id)
})

test('hidden answers do not count and are stripped from the active set (fixed point)', () => {
  const def = emptyForm()
  const a = newBlock('yesno', { label: 'Are you a customer?' })
  const b = newBlock('short', { label: 'Customer id' })
  const c = newBlock('short', { label: 'VIP note' })
  def.pages[0].blocks = [a, b, c]
  def.rules = [
    rule([cond(a.id, 'is_true', null)], { type: 'show_field', target: b.id }),
    rule([cond(b.id, 'not_empty', null)], { type: 'show_field', target: c.id }),
  ]
  const answers = { [a.id]: false, [b.id]: 'C-1', [c.id]: 'note' }
  const st = evaluate(def, answers)
  assert.ok(st.hiddenBlocks.has(b.id))
  assert.ok(st.hiddenBlocks.has(c.id), 'c depends on hidden b, so it must be hidden too')
  assert.deepEqual(activeAnswers(def, answers), { [a.id]: false })
  const shown = evaluate(def, { [a.id]: true, [b.id]: 'C-1' })
  assert.ok(!shown.hiddenBlocks.has(c.id))
})

test('show_page vs skip_page, require/optional overrides, sections', () => {
  const def = emptyForm()
  const size = newBlock('number', { label: 'Size' })
  const sec = newBlock('section', { label: 'Enterprise' })
  const q1 = newBlock('short', { label: 'Q1' })
  const q2 = newBlock('short', { label: 'Q2', required: true })
  def.pages[0].blocks = [size, sec, q1, q2]
  const p2 = newPage(2, { name: 'Two', blocks: [newBlock('short', { label: 'X' })] })
  const p3 = newPage(3, { name: 'Three', blocks: [newBlock('short', { label: 'Y' })] })
  def.pages.push(p2, p3)
  def.rules = [
    rule([cond(size.id, 'gt', 50)], { type: 'show_section', target: sec.id }),
    rule([cond(size.id, 'gt', 500)], { type: 'skip_page', target: p2.id }),
    rule([cond(size.id, 'gt', 500)], { type: 'optional_field', target: q2.id }),
    rule([cond(size.id, 'lt', 5)], { type: 'require_field', target: q1.id }),
  ]
  const small = evaluate(def, { [size.id]: 3 })
  assert.ok(small.hiddenBlocks.has(sec.id) && small.hiddenBlocks.has(q1.id) && small.hiddenBlocks.has(q2.id))
  assert.equal(small.hiddenPages.size, 0)
  assert.equal(small.requiredOverrides.get(q1.id), true)
  const mid = evaluate(def, { [size.id]: 100 })
  assert.ok(!mid.hiddenBlocks.has(q1.id))
  assert.equal(Object.keys(validatePage(def, def.pages[0], { [size.id]: 100 }, mid))[0], q2.id)
  const huge = evaluate(def, { [size.id]: 1000 })
  assert.ok(huge.hiddenPages.has(p2.id))
  assert.equal(nextPageId(def, huge, def.pages[0].id), p3.id)
  assert.deepEqual(validatePage(def, def.pages[0], { [size.id]: 1000 }, huge), {})
})

test('jumps go forward from the page holding the condition, never backward', () => {
  const def = emptyForm()
  const q = newBlock('yesno', { label: 'Skip ahead?' })
  def.pages[0].blocks = [q]
  const p2 = newPage(2), p3 = newPage(3), p4 = newPage(4)
  def.pages.push(p2, p3, p4)
  def.rules = [rule([cond(q.id, 'is_true', null)], { type: 'go_to_page', target: p4.id })]
  assert.equal(sourcePageOf(def, def.rules[0])!.id, def.pages[0].id)
  const st = evaluate(def, { [q.id]: true })
  assert.equal(nextPageId(def, st, def.pages[0].id), p4.id)
  assert.equal(nextPageId(def, evaluate(def, { [q.id]: false }), def.pages[0].id), p2.id)
  assert.equal(nextPageId(def, st, p4.id), null)
  assert.deepEqual(checkRules(def), [])
  def.rules[0].then.target = def.pages[0].id
  assert.equal(checkRules(def)[0].kind, 'backward_jump')
  const backQ = newBlock('yesno'); p3.blocks = [backQ]
  def.rules[0] = rule([cond(backQ.id, 'is_true', null)], { type: 'go_to_page', target: p2.id })
  assert.equal(checkRules(def)[0].kind, 'backward_jump')
})

test('reference checks name deleted fields, pages, endings, options, and bad operators', () => {
  const def = seedComplexForm()
  const size = def.pages[0].blocks.find(b => b.label === 'Company size')!
  def.pages[0].blocks = def.pages[0].blocks.filter(b => b.id !== size.id)
  const issues = checkRules(def)
  assert.ok(issues.some(i => i.kind === 'missing_field'))
  const def2 = seedComplexForm()
  def2.pages.splice(2, 1)
  assert.ok(checkRules(def2).some(i => i.kind === 'missing_target' && i.message === 'Page deleted'))
  const def3 = seedComplexForm()
  def3.endings.splice(1, 1)
  assert.ok(checkRules(def3).some(i => i.message === 'Ending deleted'))
  const def4 = seedComplexForm()
  const s4 = def4.pages[0].blocks.find(b => b.label === 'Company size')!
  s4.options.splice(2, 1)
  assert.ok(checkRules(def4).some(i => i.kind === 'missing_option'))
  const def5 = seedComplexForm()
  ;(def5.rules[0].when.items[0] as any).op = 'gt'
  assert.ok(checkRules(def5).some(i => i.kind === 'bad_operator'))
  assert.equal(checkRules(seedComplexForm()).length, 0)
})

test('renaming or reordering options changes nothing about rules or answers', () => {
  const def = seedComplexForm()
  const size = def.pages[0].blocks.find(b => b.label === 'Company size')!
  const chosen = size.options[3].id
  const before = evaluate(def, { [size.id]: chosen })
  size.options.reverse()
  size.options.forEach(o => { o.label = o.label + ' people' })
  const after = evaluate(def, { [size.id]: chosen })
  assert.equal(after.endingId, before.endingId)
  assert.deepEqual([...after.hiddenPages], [...before.hiddenPages])
  assert.match(ruleSentence(def, def.rules[0]), /51–200 people/)
})

test('set_value fills empty answers only', () => {
  const def = emptyForm()
  const a = newBlock('choice', { label: 'Plan', options: makeOptions(['Free', 'Pro']) })
  const b = newBlock('short', { label: 'Tier' })
  def.pages[0].blocks = [a, b]
  def.rules = [rule([cond(a.id, 'eq', a.options[1].id)], { type: 'set_value', target: b.id, value: 'paid' })]
  const answers = { [a.id]: a.options[1].id }
  const st = evaluate(def, answers)
  assert.equal(applySetValues(def, answers, st)[b.id], 'paid')
  assert.equal(applySetValues(def, { ...answers, [b.id]: 'custom' }, st)[b.id], 'custom')
})

test('normalizeAnswers drops unknown ids, display blocks and garbage', () => {
  const def = seedComplexForm()
  const heading = def.pages[0].blocks[0]
  const first = def.pages[0].blocks[2]
  const out = normalizeAnswers(def, { [heading.id]: 'x', [first.id]: 'Ada', nope: 'y', [def.pages[1].blocks[0].id]: { evil: true } })
  assert.deepEqual(out, { [first.id]: 'Ada' })
})

test('rule sentences read as English and flag deleted things', () => {
  const def = seedComplexForm()
  assert.equal(ruleSentence(def, def.rules[0]), 'When Company size is any of 51–200, 201–1,000, 1,000+, show page Enterprise questions.')
  def.endings.splice(1, 1)
  assert.match(ruleSentence(def, def.rules[1]), /something that was deleted/)
  const size = def.pages[0].blocks.find(b => b.label === 'Company size')!
  assert.equal(rulesUsingBlock(def, size.id).length, 3)
  assert.equal(isConditionalPage(def, def.pages[2].id), true)
  assert.equal(isConditionalPage(def, def.pages[1].id), false)
})

test('group evaluation: AND requires all, OR any, empty groups never pass, depth 2', () => {
  const def = emptyForm()
  const a = newBlock('number', { label: 'A' }), b = newBlock('number', { label: 'B' })
  def.pages[0].blocks = [a, b]
  const p2 = newPage(2); def.pages.push(p2)
  def.rules = [rule([cond(a.id, 'gt', 1), { id: 'g', join: 'or', items: [cond(b.id, 'gt', 100), cond(b.id, 'lt', 0)] }], { type: 'show_page', target: p2.id })]
  assert.ok(!evaluate(def, { [a.id]: 2, [b.id]: 200 }).hiddenPages.has(p2.id))
  assert.ok(evaluate(def, { [a.id]: 2, [b.id]: 50 }).hiddenPages.has(p2.id))
  assert.ok(evaluate(def, { [a.id]: 0, [b.id]: 200 }).hiddenPages.has(p2.id))
  def.rules[0].when.items = []
  assert.ok(evaluate(def, { [a.id]: 2 }).hiddenPages.has(p2.id), 'a show_page rule with no conditions never passes → page hidden')
})

test('pagePath walks the visible pages in order and honours jumps', () => {
  const def = emptyForm('Path')
  const q = newBlock('yesno', { label: 'Skip?' })
  def.pages[0].blocks = [q]
  const p2 = newPage(2), p3 = newPage(3)
  def.pages.push(p2, p3)
  def.rules = [{ id: 'r_jump', when: { id: 'c_1', join: 'and', items: [{ id: 'c_2', field: q.id, op: 'is_true', value: null }] }, then: { type: 'go_to_page', target: p3.id } }]
  assert.deepEqual(pagePath(def, evaluate(def, {})).map(p => p.id), [def.pages[0].id, p2.id, p3.id])
  assert.deepEqual(pagePath(def, evaluate(def, { [q.id]: true })).map(p => p.id), [def.pages[0].id, p3.id])
})
