import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampPopoverDx } from './popover-clamp'

// DEV-306: on a 390px phone the Prospecting filter popover (width 330, anchored
// to a toolbar button near the middle) rendered with its left edge at x=-180 —
// clipped off the screen. The clamp must push it back to the 8px gutter.
test('phone: shifts a left-overflowing panel to the gutter', () => {
  // measured natural left before the fix was -180 (right-anchored to a button
  // whose right edge sat at x=150, minus the 330 width).
  assert.equal(clampPopoverDx(-180, 330, 390), 188) // -180 + 188 = 8
})

test('desktop: leaves an on-screen panel untouched', () => {
  assert.equal(clampPopoverDx(592, 330, 1280), 0)
})

test('pulls a right-overflowing panel back inside the gutter', () => {
  // a left-anchored panel starting at 300, width 330, on a 390 screen: right
  // edge 630 → must come back so the right edge sits at 390 - 8 = 382.
  assert.equal(clampPopoverDx(300, 330, 390), -248) // 300 - 248 = 52, right = 382
})

test('when wider than the viewport, keeps the LEFT edge visible', () => {
  // panel wider than the gutters allow: left visibility wins (the fields and
  // their labels live on the left), so dx pins left to the gutter.
  const dx = clampPopoverDx(-50, 380, 390)
  assert.equal(-50 + dx, 8)
})

test('a panel already flush against the left gutter does not move', () => {
  assert.equal(clampPopoverDx(8, 200, 390), 0)
})
