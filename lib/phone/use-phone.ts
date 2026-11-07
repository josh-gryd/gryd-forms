'use client'

// The phone layer ("Stack + Bar", engine/docs/design/phone-shell/) is the v2 design system
// at phone width. One breakpoint for all of it: the width the old mobile shell
// (bottom tab bar + drawer) already switched at, so there is no third layout
// between a phone and the desktop.

import { useSyncExternalStore } from 'react'
import { useDS } from '@/app/components/v2/ds-context'
import { usePhoneUI } from './ui-store'

export const PHONE_MAX = 767
export const PHONE_MQ = `(max-width: ${PHONE_MAX}px)`

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(PHONE_MQ)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

const snapshot = () => (typeof window === 'undefined' ? false : window.matchMedia(PHONE_MQ).matches)

/** True at phone width. False on the server, so a phone-only branch renders
 *  after hydration and the desktop markup never flashes a mismatch. */
export function useIsPhoneWidth(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

/** Whether the phone shell should draw: phone width under the v2 system. The
 *  v1 ("Old") system keeps its own mobile shell. Only PhoneChrome asks this. */
export function usePhoneShell(): boolean {
  const ds = useDS()
  return useIsPhoneWidth() && ds === 'v2'
}

/** True when the phone layer is drawn, so a page or component renders its
 *  phone form. Needs the shell mounted: a page outside the portal's chrome (a
 *  client's agreement, a public form, the bare Plan host) has no action sheet
 *  or toast to hand things to, so it keeps its own layout. */
export function usePhone(): boolean {
  const shell = usePhoneShell()
  const mounted = usePhoneUI(s => s.layer)
  return shell && mounted
}
