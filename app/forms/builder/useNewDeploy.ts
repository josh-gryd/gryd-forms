'use client'

// True once the portal has been deployed again since this tab loaded. The
// page is told which deploy served it; this asks which one serves now when the
// tab regains focus or becomes visible, and every few minutes. A tab left open
// across a deploy keeps running the code it loaded, so without this a builder
// can show an old Preview with nothing to say so (QA retest 2026-09-25).

import { useEffect, useState } from 'react'

const EVERY_MS = 5 * 60_000

export function useNewDeploy(build: string | undefined): boolean {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (!build || stale) return
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/app-build', { cache: 'no-store' })
        if (!res.ok) return
        const now = ((await res.json()) as { build?: string }).build
        if (!stopped && now && now !== build) setStale(true)
      } catch { /* offline: the next check tries again */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(check, EVERY_MS)
    return () => { stopped = true; window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer) }
  }, [build, stale])
  return stale
}
