// Sliding-window limits for the public respondent surface. In-memory: the
// engine is one machine (SQLite is single-writer) so one process sees all
// traffic. Keys are opaque strings — the caller decides whether that is an
// IP, a form id, or both. Nothing here persists or logs the key.

interface Bucket { hits: number[] }

export class SlidingWindow {
  private buckets = new Map<string, Bucket>()
  private lastSweep = Date.now()

  constructor(private readonly windowMs: number, private readonly max: number) {}

  /** Returns true when the request is allowed (and counts it). */
  take(key: string, now = Date.now()): boolean {
    this.sweep(now)
    let b = this.buckets.get(key)
    if (!b) { b = { hits: [] }; this.buckets.set(key, b) }
    while (b.hits.length && now - b.hits[0] > this.windowMs) b.hits.shift()
    if (b.hits.length >= this.max) return false
    b.hits.push(now)
    return true
  }

  remaining(key: string, now = Date.now()): number {
    const b = this.buckets.get(key)
    if (!b) return this.max
    const live = b.hits.filter(t => now - t <= this.windowMs).length
    return Math.max(0, this.max - live)
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    for (const [k, b] of this.buckets) {
      while (b.hits.length && now - b.hits[0] > this.windowMs) b.hits.shift()
      if (!b.hits.length) this.buckets.delete(k)
    }
  }
}

const MIN = 60_000

/** Per client (IP) limits; generous for a person, tight for a script. */
export const LIMITS = {
  read: new SlidingWindow(MIN, 240),
  start: new SlidingWindow(MIN, 40),
  autosave: new SlidingWindow(MIN, 180),
  submit: new SlidingWindow(MIN, 30),
  /** The early email check as a respondent leaves a page (a form taking one response per address). */
  check: new SlidingWindow(MIN, 30),
  upload: new SlidingWindow(MIN, 60),
  /** Whole-form ceiling: even a botnet can't flood one form past this. */
  formSubmit: new SlidingWindow(MIN, 600),
  /** Password tries: per client, and per form so a spread-out guesser is slowed too. */
  unlock: new SlidingWindow(MIN, 10),
  formUnlock: new SlidingWindow(MIN, 60),
  edit: new SlidingWindow(MIN, 30),
}
