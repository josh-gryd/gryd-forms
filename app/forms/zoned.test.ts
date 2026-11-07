import test from 'node:test'
import assert from 'node:assert/strict'
import { isoToZonedInput, zonedInputToIso } from './zoned'
import { isFormBuilderPath } from '@/lib/forms/slot'
import { formStatusTag } from './status'

test('opening and closing times are read and written on the form zone’s clock, across daylight saving', () => {
  // 9:00 in New York is 13:00 UTC in summer (EDT) and 14:00 UTC in winter (EST).
  assert.equal(zonedInputToIso('2026-07-01T09:00', 'America/New_York'), '2026-07-01T13:00:00.000Z')
  assert.equal(zonedInputToIso('2026-12-01T09:00', 'America/New_York'), '2026-12-01T14:00:00.000Z')
  assert.equal(isoToZonedInput('2026-07-01T13:00:00.000Z', 'America/New_York'), '2026-07-01T09:00')
  assert.equal(isoToZonedInput('2026-12-01T14:00:00.000Z', 'Europe/London'), '2026-12-01T14:00')
  // Round trips hold on the day the clocks change.
  for (const v of ['2026-03-08T12:00', '2026-11-01T12:00', '2026-03-29T12:00']) assert.equal(isoToZonedInput(zonedInputToIso(v, 'Europe/Paris')!, 'Europe/Paris'), v)
  assert.equal(zonedInputToIso('not a date', 'UTC'), null)
  assert.equal(isoToZonedInput(null, 'UTC'), '')
})

test('the Forms app’s own pages are never mistaken for a form id', () => {
  for (const p of ['/forms/responses', '/forms/templates', '/forms/archived', '/forms/settings', '/forms']) assert.equal(isFormBuilderPath(p), false, p)
  assert.equal(isFormBuilderPath('/forms/frm_abc123'), true)
})

test('the list says scheduled and closed-by-limit in words', () => {
  assert.equal(formStatusTag({ publishState: 'live', availability: 'scheduled', closedReason: null }).label, 'Scheduled')
  assert.equal(formStatusTag({ publishState: 'live', availability: 'closed', closedReason: 'limit' }).label, 'Closed · limit reached')
  assert.equal(formStatusTag({ publishState: 'draft', availability: 'open', closedReason: null }).label, 'Draft')
  assert.equal(formStatusTag({ publishState: 'closed', availability: 'closed', closedReason: 'manual' }).label, 'Closed')
})
