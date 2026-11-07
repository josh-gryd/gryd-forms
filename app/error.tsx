'use client'

// The route-level boundary (QA A1, 2026-10-16). A page that throws while it
// renders — usually an engine reply missing a field it expected — used to
// blank the whole screen. This sits inside the root layout, so the rail, the
// top bar and the phone chrome stay up and only the page area shows the
// failure, with Retry re-rendering the page.

import { useEffect } from 'react'
import { ErrorState } from './components/states'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[route error]', error) }, [error])
  return (
    <div data-testid="route-error" style={{ padding: '32px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: 420, width: '100%', background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: 'var(--r-card, 14px)', boxShadow: 'var(--el-3)' }}>
        <ErrorState
          title="This page didn't load"
          sub="Part of its data came back incomplete. The rest of the portal is fine; try again, or open another page."
          cause={error.digest ? `ref ${error.digest}` : error.message?.slice(0, 160)}
          onRetry={reset}
        />
      </div>
    </div>
  )
}
