'use client'

// "Go back" on the unavailable page, shown only when the visitor came from a page:
// a link opened into a fresh tab has nowhere useful to go back to.

import React, { useEffect, useState } from 'react'

export default function BackButton({ label, style }: { label: string; style: React.CSSProperties }) {
  const [canGoBack, setCanGoBack] = useState(false)
  useEffect(() => { setCanGoBack(window.history.length > 1 && document.referrer !== '') }, [])
  if (!canGoBack) return null
  return <button type="button" onClick={() => window.history.back()} style={style} data-testid="unavailable-back">{label}</button>
}
