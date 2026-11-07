'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'gryd-theme'

/** Inline script that sets html[data-theme] BEFORE first paint, so there is no
 *  flash of the wrong theme. Order of precedence: ?theme= URL override →
 *  saved gryd-theme → legacy docs-theme (so existing /docs users keep their
 *  pref) → OS prefers-color-scheme → light. Runs as the first thing in <body>. */
export const THEME_INIT_SCRIPT = `(function(){try{
var K='${THEME_KEY}';
var u=new URLSearchParams(location.search).get('theme');
var s=localStorage.getItem(K)||localStorage.getItem('docs-theme');
var t=(u==='dark'||u==='light')?u:(s==='dark'||s==='light')?s:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');
document.documentElement.setAttribute('data-theme',t);
if(u==='dark'||u==='light'){try{localStorage.setItem(K,u)}catch(e){}}
}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`

function current(): Theme {
  if (typeof document === 'undefined') return 'light'
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'light'
}

/** Apply a theme app-wide: flip the root attribute, persist it, briefly enable
 *  the cross-fade transition, and notify every listener (other toggles, the
 *  docs page) so the whole app stays in sync from a single source of truth. */
let wipeSeq = 0

export function applyTheme(t: Theme, origin?: { x: number; y: number }) {
  const el = document.documentElement
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } }
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || el.getAttribute('data-motion') === 'reduced'
  // A circle wipes the new theme in from the button; browsers without view transitions, and reduced motion, keep the cross-fade.
  if (doc.startViewTransition && !calm) {
    el.style.setProperty('--wipe-x', origin ? `${origin.x}px` : '100%')
    el.style.setProperty('--wipe-y', origin ? `${origin.y}px` : '0')
    el.classList.add('gx-vt')
    // A second click skips the first transition, whose cleanup would then strip the wipe from the one still running.
    const mine = ++wipeSeq
    const vt = doc.startViewTransition(() => flip(t))
    vt.finished
      .finally(() => { if (mine === wipeSeq) { el.classList.remove('gx-vt'); el.style.removeProperty('--wipe-x'); el.style.removeProperty('--wipe-y') } })
      .catch(() => {})
    return
  }
  el.classList.add('theme-transition')
  flip(t)
  window.setTimeout(() => el.classList.remove('theme-transition'), 280)
}

function flip(t: Theme) {
  const el = document.documentElement
  el.setAttribute('data-theme', t)
  try { localStorage.setItem(THEME_KEY, t) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('gryd-theme-change', { detail: t }))
}

/** Subscribe to the live theme. Returns [theme, toggle]. Works across tabs
 *  (storage event) and across components in the same tab (custom event). */
export type ToggleTheme = (e?: { clientX?: number; clientY?: number; detail?: number }) => void
export function useTheme(): [Theme, ToggleTheme] {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => {
    setTheme(current())
    const sync = () => setTheme(current())
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) sync() }
    window.addEventListener('gryd-theme-change', sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('gryd-theme-change', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const toggle = useCallback((e?: { clientX?: number; clientY?: number; detail?: number }) => {
    // A pointer click wipes from where it landed; a keyboard press (no coordinates) wipes from the top right.
    const pt = e && e.detail && e.clientX != null && e.clientY != null ? { x: e.clientX, y: e.clientY } : undefined
    applyTheme(current() === 'dark' ? 'light' : 'dark', pt)
  }, [])
  return [theme, toggle]
}

/** Sun/moon switcher. Self-themes via global tokens, so it fits in any chrome
 *  (top bar, mobile bar). `size` controls the square button. */
export function ThemeToggle({ size = 30, bare = false }: { size?: number; bare?: boolean }) {
  const [theme, toggle] = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 9,
        background: bare ? 'transparent' : 'var(--card)',
        border: bare ? 'none' : '1.5px solid var(--ink)',
        color: 'var(--tx)', cursor: 'pointer', flexShrink: 0, padding: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {dark ? (
        <svg width={Math.min(Math.round(size * 0.53), 20)} height={Math.min(Math.round(size * 0.53), 20)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
      ) : (
        <svg width={Math.min(Math.round(size * 0.53), 20)} height={Math.min(Math.round(size * 0.53), 20)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      )}
    </button>
  )
}
