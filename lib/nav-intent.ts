'use client'

// What makes a nav click feel instant (the Superhuman / Linear tricks), as
// props for a nav <Link>:
//
//   • prefetch — the FULL route, not just the layout. Pages are client shells,
//     so a full prefetch is ~2KB, and the click then needs no server round trip.
//   • press, not release — a mouse press navigates at once instead of on
//     release, ~80–120ms sooner. Mouse only: a finger on a scrolling sidebar
//     is a scroll, not a tap, until it lifts. Never for the page you're on
//     (its click is the "back to this app's home" gesture).
//   • intent — hovering or focusing a link warms the destination's DATA in the
//     live store, so the page paints filled instead of empty. Only the
//     read-only GETs listed in DATA_FOR — never a route with side effects.

import type { MouseEvent, PointerEvent } from 'react'

type Router = { push: (href: string) => void }

/** No page here has data worth warming before the click. */
export function warmData(_href: string): void {}

let pressed: { href: string; at: number } | null = null

function plainPrimary(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/** Spread onto a nav <Link>. `current` = it points at the page on screen.
 *  `onClick` still runs (drawer closing, the nav-home event) either way. */
/** Routes whose server render does more than draw a shell, so a full prefetch
 *  would cache it: /webinars mints a 60s GRYD Live sign-in token, which the
 *  router cache would keep (and hand back expired) for minutes. */
export function fullPrefetchOk(href: string): boolean {
  const path = href.split('?')[0]
  return !(path === '/webinars' || path.startsWith('/webinars/'))
}

export function navLinkProps(href: string, router: Router, opts: { current?: boolean; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void } = {}) {
  return {
    // `undefined` = Next's default prefetch (layout only) for a route that
    // mustn't be cached whole.
    prefetch: fullPrefetchOk(href) ? (true as const) : undefined,
    onPointerEnter: () => warmData(href),
    onFocus: () => warmData(href),
    onPointerDown: (e: PointerEvent<HTMLAnchorElement>) => {
      if (opts.current || e.pointerType !== 'mouse' || !plainPrimary(e)) return
      pressed = { href, at: Date.now() }
      router.push(href)
    },
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      opts.onClick?.(e)
      // Already on its way from the press: don't navigate a second time.
      if (pressed && pressed.href === href && Date.now() - pressed.at < 2000 && plainPrimary(e)) e.preventDefault()
      pressed = null
    },
  }
}
