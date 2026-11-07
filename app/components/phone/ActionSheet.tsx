'use client'

// The phone's menu: an option card plus a separate Cancel, from the bottom.
// Snooze until · Move ‹company› to · Reschedule to · a page picker — every
// "pick one of these" on the phone goes through here (phone rule 3).

import { useEffect, useState } from 'react'
import { closeActionSheet, usePhoneUI, type ActionSheetState } from '@/lib/phone/ui-store'
import { PhoneIcon } from './icons'

export default function ActionSheet() {
  const live = usePhoneUI(s => s.actionSheet)
  // Keep the last content on screen while it slides away.
  const [shown, setShown] = useState<ActionSheetState | null>(live)
  useEffect(() => { if (live) setShown(live) }, [live])
  const open = !!live

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeActionSheet() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className="ph-as-scrim" data-open={open || undefined} onClick={closeActionSheet} />
      <div className="ph-as" data-open={open || undefined} role="dialog" aria-modal={open} aria-label={shown?.title} aria-hidden={!open}>
        <div className="ph-as-card">
          {shown?.title ? <div className="ph-as-title">{shown.title}</div> : null}
          {shown?.options.map((o, i) => (
            <button
              key={i}
              type="button"
              className="ph-as-opt"
              data-current={o.current || undefined}
              data-danger={o.danger || undefined}
              disabled={o.disabled || !open}
              onClick={() => { closeActionSheet(); o.onPick() }}
            >
              {o.label}
              {o.current ? <PhoneIcon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
        <button type="button" className="ph-as-cancel" onClick={closeActionSheet} disabled={!open}>Cancel</button>
      </div>
    </>
  )
}
