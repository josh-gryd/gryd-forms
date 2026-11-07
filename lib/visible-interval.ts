'use client'

// setInterval for polls: it doesn't tick while the tab is hidden, and when the
// tab is shown again it runs once at once if a beat was missed, then resumes.
//
// The portal had ~25 data polls (2.5s to 2min) that kept firing in background
// tabs — every open tab hit the engine's one event loop forever. Drop-in for
// `const id = setInterval(fn, ms)` … `clearInterval(id)`:
//
//   const stop = visibleInterval(fn, ms)   …   stop()
//
// For timers that only animate the screen (countdowns, tickers) keep plain
// setInterval: the browser already throttles those in a background tab.

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

export function visibleInterval(fn: () => unknown, ms: number): () => void {
  if (typeof document === 'undefined') return () => {}
  let last = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null
  const run = () => { last = Date.now(); void fn() }
  const start = () => {
    if (timer == null) timer = setInterval(() => { if (!hidden()) run() }, ms)
  }
  const stopTimer = () => { if (timer != null) { clearInterval(timer); timer = null } }
  const onVisibility = () => {
    if (hidden()) { stopTimer(); return }
    if (Date.now() - last >= ms) run()
    start()
  }
  if (!hidden()) start()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopTimer()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** True while the tab is in the background. For a self-rescheduling
 *  setTimeout poll: skip the fetch (but keep rescheduling) while hidden. */
export function tabHidden(): boolean {
  return hidden()
}
