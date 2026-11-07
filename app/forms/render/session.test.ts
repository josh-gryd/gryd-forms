import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyForm, newBlock, newPage, makeOptions } from '@/lib/forms-core/index'
import { carryOver, type LocalDraft } from './session'

function draft(answers: LocalDraft['answers'], pageId: string, visited: string[] = []): LocalDraft {
  return { v: 1, answers, pageId, visited, token: 'tok_x', idempotencyKey: 'idem-000000001', at: 1 }
}

test('carryOver keeps answers that still fit, drops and counts the ones that no longer do', () => {
  const def = emptyForm('Carry')
  const name = newBlock('short', { label: 'Name' })
  const pick = newBlock('choice', { label: 'Pick', options: makeOptions(['Alpha', 'Beta']) })
  const many = newBlock('checks', { label: 'Many', options: makeOptions(['One', 'Two', 'Three']) })
  def.pages[0].blocks = [name, pick, many]
  const d = draft({ [name.id]: 'Kim', [pick.id]: 'o_removed', [many.id]: [many.options[0].id, 'o_gone'], b_deleted_question: 'whatever' }, def.pages[0].id)
  const { draft: out, dropped } = carryOver(d, def)
  assert.equal(out.answers[name.id], 'Kim')
  assert.equal(out.answers[pick.id], undefined, 'a removed option is not carried')
  assert.deepEqual(out.answers[many.id], [many.options[0].id], 'the options that still exist are kept')
  assert.equal(out.answers.b_deleted_question, undefined)
  assert.equal(dropped, 1, 'only the answer that must be given again counts — not a question that no longer exists, not a partly kept one')
  assert.equal(out.token, 'tok_x', 'the session (and its partial row) carries over too')
  assert.equal(out.idempotencyKey, 'idem-000000001')
})

test('carryOver keeps the page when it still exists, else starts at the first', () => {
  const def = emptyForm('Pages')
  const p2 = newPage(2)
  def.pages.push(p2)
  assert.equal(carryOver(draft({}, p2.id, [def.pages[0].id]), def).draft.pageId, p2.id)
  const gone = carryOver(draft({}, 'p_gone', ['p_gone', def.pages[0].id]), def).draft
  assert.equal(gone.pageId, def.pages[0].id)
  assert.deepEqual(gone.visited, [def.pages[0].id])
})

test('carryOver refits matrix rows and a ranking whose options changed', () => {
  const def = emptyForm('Grid')
  const grid = newBlock('matrix', { label: 'Grid' })
  const rank = newBlock('ranking', { label: 'Rank', options: makeOptions(['A', 'B']) })
  def.pages[0].blocks = [grid, rank]
  const rows = grid.settings.rows as Array<{ id: string }>
  const { draft: out, dropped } = carryOver(draft({ [grid.id]: { [rows[0].id]: grid.options[0].id, row_gone: grid.options[0].id }, [rank.id]: [rank.options[1].id, 'o_gone'] }, def.pages[0].id), def)
  assert.deepEqual(out.answers[grid.id], { [rows[0].id]: grid.options[0].id })
  assert.equal(out.answers[rank.id], undefined, 'a ranking of a different set of options is asked again')
  assert.equal(dropped, 1)
})
