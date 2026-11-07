import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enterPopover, isPopoverCloseKey } from './popover-focus'

// QA 2026-10-16 (Models v3): the shortlist popover ignored Escape and left
// focus on the row, so a keyboard user couldn't reach "Show on the chart".

const el = (name: string, log: string[], inside: unknown[] = []) => ({
  name, isConnected: true,
  focus: () => { log.push(name) },
  contains: (n: unknown) => inside.includes(n),
})

test('open focuses the panel; close hands focus back to the opener', () => {
  const log: string[] = []
  const opener = el('opener', log), panel = el('panel', log)
  const doc = { activeElement: null as unknown, body: {} }
  const restore = enterPopover(panel, opener, doc)
  assert.deepEqual(log, ['panel'])
  doc.activeElement = doc.body // the panel unmounted with focus in it
  restore()
  assert.deepEqual(log, ['panel', 'opener'])
})

test('close from inside the panel (Escape on a link in it) restores too', () => {
  const log: string[] = []
  const link = {}
  const opener = el('opener', log), panel = el('panel', log, [link])
  const restore = enterPopover(panel, opener, { activeElement: link, body: {} })
  restore()
  assert.deepEqual(log, ['panel', 'opener'])
})

test('a click that moved focus to another control keeps it there', () => {
  const log: string[] = []
  const opener = el('opener', log), panel = el('panel', log)
  const restore = enterPopover(panel, opener, { activeElement: { other: true }, body: {} })
  restore()
  assert.deepEqual(log, ['panel'])
})

test('an opener that left the page is not focused', () => {
  const log: string[] = []
  const opener = { ...el('opener', log), isConnected: false }
  const restore = enterPopover(el('panel', log), opener, { activeElement: null, body: {} })
  restore()
  assert.deepEqual(log, ['panel'])
})

test('Escape closes unless something inside already handled it', () => {
  assert.equal(isPopoverCloseKey({ key: 'Escape', defaultPrevented: false }), true)
  assert.equal(isPopoverCloseKey({ key: 'Escape', defaultPrevented: true }), false)
  assert.equal(isPopoverCloseKey({ key: 'Enter', defaultPrevented: false }), false)
})
