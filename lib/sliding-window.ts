/** At most `max` hits per key in any `windowMs`. In memory: one process. */
export class SlidingWindow {
  private hits = new Map<string, number[]>()
  constructor(private max: number, private windowMs: number) {}
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs)
    if (recent.length >= this.max) { this.hits.set(key, recent); return false }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.hits.clear()
    return true
  }
}
