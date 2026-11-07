// Focus handling for `Popover` (ui.tsx), kept DOM-light so it can be unit
// tested: on open, focus moves into the panel; on close, it goes back to
// whatever had it before (the button that opened it), as MenuPanel does.

interface Focusable { focus(opts?: { preventScroll?: boolean }): void }

/** Focus `panel` and return a function that hands focus back to `prev`,
 *  unless `prev` has left the page or a click has since put focus on
 *  something else outside the panel (another button: leave it there). */
export function enterPopover(
  panel: Focusable & { contains(n: unknown): boolean },
  prev: (Focusable & { isConnected?: boolean }) | null,
  doc: { activeElement: unknown; body: unknown },
): () => void {
  panel.focus({ preventScroll: true })
  return () => {
    const now = doc.activeElement
    const elsewhere = now != null && now !== doc.body && now !== panel && !panel.contains(now)
    if (!prev || prev.isConnected === false || elsewhere) return
    prev.focus({ preventScroll: true })
  }
}

/** Escape closes, unless something inside already handled it. */
export function isPopoverCloseKey(e: { key: string; defaultPrevented: boolean }): boolean {
  return e.key === 'Escape' && !e.defaultPrevented
}
