'use client'

// The strip across the top of the demo portal: what this is, when it resets,
// and where the code lives.

import { useEffect, useState } from 'react'

const HOUR = 3600_000

function minutesLeft(): number {
  return Math.max(1, Math.ceil((HOUR - (Date.now() % HOUR)) / 60_000))
}

export default function DemoBanner({ repo }: { repo: string }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setLeft(minutesLeft())
    tick()
    const t = setInterval(tick, 20_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div role="note" data-testid="demo-banner"
      style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 16px', background: 'var(--gold)', color: 'var(--ink)', borderBottom: '2px solid var(--ink)', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 700, textAlign: 'center' }}>
      <span>🧪 Live demo. Anyone can see what you make here, and everything resets{left ? ` in ${left} min` : ' every hour'}.</span>
      <a href={repo} target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}>Get the code (free, MIT) →</a>
    </div>
  )
}
