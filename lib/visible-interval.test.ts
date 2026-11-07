import { test } from 'node:test'
import { strict as assert } from 'node:assert'

// A minimal document whose visibility the test controls.
let state: 'visible' | 'hidden' = 'visible'
const listeners = new Set<() => void>()
;(globalThis as unknown as { document: unknown }).document = {
  get visibilityState() { return state },
  addEventListener: (_: string, l: () => void) => listeners.add(l),
  removeEventListener: (_: string, l: () => void) => listeners.delete(l),
}
const setVisibility = (s: 'visible' | 'hidden') => { state = s; for (const l of listeners) l() }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('ticks while visible, not while hidden, and catches up once on return', async () => {
  const { visibleInterval } = await import('./visible-interval')
  let n = 0
  const stop = visibleInterval(() => { n++ }, 20)
  await wait(70)
  const visibleTicks = n
  assert.ok(visibleTicks >= 2, `ticked ${visibleTicks}x while visible`)
  setVisibility('hidden')
  await wait(80)
  assert.equal(n, visibleTicks, 'no ticks while hidden')
  setVisibility('visible')
  assert.equal(n, visibleTicks + 1, 'one catch-up tick the moment it is shown')
  await wait(50)
  assert.ok(n >= visibleTicks + 2, 'and resumes its interval')
  stop()
  const at = n
  await wait(50)
  assert.equal(n, at, 'stop() ends it')
  assert.equal(listeners.size, 0, 'and removes its listener')
})

test('a short hide that misses no beat does not fire early', async () => {
  const { visibleInterval } = await import('./visible-interval')
  let n = 0
  const stop = visibleInterval(() => { n++ }, 200)
  setVisibility('hidden')
  setVisibility('visible')
  assert.equal(n, 0)
  stop()
})
