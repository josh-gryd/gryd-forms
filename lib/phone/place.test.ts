import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionLabel } from './place'

// Pins the singular agreement: the phone Jump subtitles read "1 needs
// attention", never "1 need attention" (DEV-326 — a #1945 regression).
test('attentionLabel agrees with the count', () => {
  assert.equal(attentionLabel(1), '1 needs attention')
  assert.equal(attentionLabel(2), '2 need attention')
  assert.equal(attentionLabel(0), '0 need attention')
  assert.equal(attentionLabel(12), '12 need attention')
})
