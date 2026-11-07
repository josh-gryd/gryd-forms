// Which design system the portal wears: the pre-v2 chrome ('v1') or GRYD v2.4.2
// ('v2'). One cookie decides it, read by the root layout on the server so the
// first paint is already right — no flash of the other shell, no hydration
// mismatch. Settings → Appearance flips it and reloads.
//
// Both shells ship in every build, so switching back is a click, not a deploy.

export type DesignSystem = 'v1' | 'v2'

export const DS_COOKIE = 'gryd-ds'
export const DS_DEFAULT: DesignSystem = 'v2'

export function parseDesignSystem(raw: string | undefined | null): DesignSystem {
  return raw === 'v1' || raw === 'v2' ? raw : DS_DEFAULT
}

/** Client only: persist the choice for a year and reload into it. */
export function setDesignSystem(ds: DesignSystem): void {
  document.cookie = `${DS_COOKIE}=${ds}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  window.location.reload()
}

/** Client only: the system the page was rendered with. */
export function currentDesignSystem(): DesignSystem {
  if (typeof document === 'undefined') return DS_DEFAULT
  return parseDesignSystem(document.documentElement.getAttribute('data-ds'))
}
