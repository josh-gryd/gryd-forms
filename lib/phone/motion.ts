// Motion for the phone layer's gestures. Every gesture follows the finger and
// can be grabbed mid-motion, so anything a finger moves (sheets, the pushed
// conversation, swipe rows, the Home stack) animates with a spring that starts
// from where the element IS and inherits the finger's velocity, rather than a
// CSS transition that would have to finish before it could be caught.

export const EASE_IOS = 'cubic-bezier(.32,.72,0,1)'

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface SpringOpts {
  from: number
  to: number
  /** px/s, the finger's speed at release. */
  velocity?: number
  /** Seconds to settle (Apple's "response"). 0.36 tracks --dur-slow. */
  response?: number
  /** 1 = no overshoot. */
  damping?: number
  onUpdate: (x: number) => void
  onDone?: () => void
}

export interface SpringHandle {
  /** Stops in place and returns where it was, so a new drag starts there. */
  stop: () => { x: number; v: number }
}

export function spring(o: SpringOpts): SpringHandle {
  if (reduced()) {
    o.onUpdate(o.to)
    o.onDone?.()
    return { stop: () => ({ x: o.to, v: 0 }) }
  }
  const response = o.response ?? 0.36
  const zeta = o.damping ?? 1
  const k = (2 * Math.PI / response) ** 2
  const c = (4 * Math.PI * zeta) / response
  let x = o.from
  let v = o.velocity ?? 0
  let t = performance.now()
  let raf = 0
  let stopped = false
  const tick = (now: number) => {
    if (stopped) return
    const dt = Math.min(0.034, (now - t) / 1000)
    t = now
    for (let i = 0; i < 6; i++) {
      const h = dt / 6
      v += (-k * (x - o.to) - c * v) * h
      x += v * h
    }
    if (Math.abs(v) < 2 && Math.abs(x - o.to) < 0.3) {
      o.onUpdate(o.to)
      o.onDone?.()
      return
    }
    o.onUpdate(x)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return {
    stop: () => {
      stopped = true
      cancelAnimationFrame(raf)
      return { x, v }
    },
  }
}

/** Velocity from the last ~90ms of samples, in px/s. */
export function velocityTracker() {
  const s: [number, number][] = []
  return {
    add(p: number) {
      const t = performance.now()
      s.push([t, p])
      while (s.length > 2 && t - s[0][0] > 90) s.shift()
    },
    velocity(): number {
      if (s.length < 2) return 0
      const a = s[0], b = s[s.length - 1]
      const dt = (b[0] - a[0]) / 1000
      return dt > 0 ? (b[1] - a[1]) / dt : 0
    },
  }
}

/** Where a flick would come to rest (Apple's decay projection). */
export function project(velocity: number, decelerationRate = 0.995): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}
