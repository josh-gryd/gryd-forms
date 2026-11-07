'use client'

// Where you are on the phone, for the command bar and a pushed page's back
// label: which app, which page, and the app you were in before. Each app also
// keeps your place, so going back into it lands on the page you left rather
// than its front.

import { useSyncExternalStore } from 'react'
import { activePage, appForPath, extraPageFor } from '@/lib/apps'
import { v2FrameFor, type V2AppId } from '@/lib/apps-v2'

export interface Place {
  app: V2AppId
  name: string
  emoji: string
  page: string
  path: string
}

export function placeFor(pathname: string): Place {
  const v1 = appForPath(pathname)
  const frame = v2FrameFor(pathname, v1)
  const page = activePage(v1.pages, pathname)
  const pageLabel = extraPageFor(pathname)?.title ?? page?.label ?? v1.label
  return { app: frame.theme, name: frame.name, emoji: frame.emoji, page: pageLabel, path: pathname }
}

const LAST_KEY = 'gryd-ph-last'
const PLACES_KEY = 'gryd-ph-places'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function write(key: string, v: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ }
}

const listeners = new Set<() => void>()
let lastPlace: Place | null = null
let current: Place | null = null

/** Called on every route change by the command bar. */
export function notePlace(pathname: string) {
  const next = placeFor(pathname)
  if (current === null) {
    lastPlace = read<Place | null>(LAST_KEY, null)
  } else if (current.app !== next.app) {
    lastPlace = current
    write(LAST_KEY, lastPlace)
  }
  current = next
  const places = read<Record<string, string>>(PLACES_KEY, {})
  places[next.app] = pathname + (typeof location !== 'undefined' ? location.search : '')
  write(PLACES_KEY, places)
  listeners.forEach(l => l())
}

export function useLastPlace(): Place | null {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    () => lastPlace,
    () => null,
  )
}

/** The page you left in an app, or its front page. */
export function placeInApp(app: string, fallback: string): string {
  const places = read<Record<string, string>>(PLACES_KEY, {})
  return places[app] || fallback
}

/** "N needs attention" / "N need attention" — a command-bar subtitle fragment
 *  that agrees with the count ("need" reads wrong on exactly one). */
export function attentionLabel(n: number): string {
  return `${n} need${n === 1 ? 's' : ''} attention`
}

// A page can say more than its label on the command bar's second line
// (Sales: "Board · Workspace · synced 1m ago").
let sub: { path: string; text: string } | null = null
const subListeners = new Set<() => void>()
export function setJumpSub(path: string, text: string | null) {
  sub = text ? { path, text } : null
  subListeners.forEach(l => l())
}
export function useJumpSub(path: string): string | null {
  const s = useSyncExternalStore(
    l => { subListeners.add(l); return () => { subListeners.delete(l) } },
    () => sub,
    () => null,
  )
  return s && s.path === path ? s.text : null
}
