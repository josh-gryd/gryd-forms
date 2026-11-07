import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBig } from './states'

// The rule from the states audit: abbreviate past 7 digits, keep the full
// value available. Below 1,000,000 the figure still fits its tile.
test('leaves anything under seven digits alone', () => {
  assert.deepEqual(formatBig(0), { short: '0', full: '0' })
  assert.deepEqual(formatBig(999_999), { short: '999,999', full: '999,999' })
  assert.deepEqual(formatBig(494_600, '$'), { short: '$494,600', full: '$494,600' })
})

test('abbreviates at a million and keeps three significant figures', () => {
  assert.deepEqual(formatBig(4_948_600, '$'), { short: '$4.95M', full: '$4,948,600' })
  assert.equal(formatBig(1_284_905).short, '1.28M')
  assert.equal(formatBig(49_500_000).short, '49.5M')
  assert.equal(formatBig(495_000_000).short, '495M')
})

test('carries on into billions', () => {
  assert.equal(formatBig(2_400_000_000, '$').short, '$2.40B')
  assert.equal(formatBig(1_000_000_000).short, '1.00B')
})

test('keeps the sign outside the currency mark', () => {
  assert.deepEqual(formatBig(-2_500_000, '$'), { short: '-$2.50M', full: '-$2,500,000' })
  assert.deepEqual(formatBig(-4_200, '$'), { short: '-$4,200', full: '-$4,200' })
})

test('the boundary itself abbreviates', () => {
  assert.equal(formatBig(1_000_000).short, '1.00M')
  assert.equal(formatBig(999_999).short, '999,999')
})
