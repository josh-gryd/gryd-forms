'use client'

// Shell state for the phone layer, shared by the command bar, the switcher,
// the action sheet and the toast. A tiny external store rather than React context,
// so any page can open an action sheet or raise a toast with a plain function
// call, and only the components that read a slice re-render.

import { useSyncExternalStore } from 'react'

export interface ActionSheetOption {
  label: string
  /** Marks the current value: drawn at 800 with a check. */
  current?: boolean
  danger?: boolean
  disabled?: boolean
  onPick: () => void
}

export interface ActionSheetState {
  title: string
  options: ActionSheetOption[]
  /** Called once when the sheet goes away, picked or not (a converted menu's onClose). */
  onDismiss?: () => void
}

export interface ToastState {
  id: number
  text: string
  undo: (() => void) | null
}

interface PhoneUI {
  /** The app switcher (the command bar's panel). */
  launcherOpen: boolean
  /** It opened from Search: the field takes focus at once. */
  launcherSearch: boolean
  actionSheet: ActionSheetState | null
  toast: ToastState | null
  /** Sheets and pushed pages currently open. The command bar hides while > 0. */
  overlays: number
  /** PhoneChrome is drawing the phone shell (see usePhone). */
  layer: boolean
}

let state: PhoneUI = { launcherOpen: false, launcherSearch: false, actionSheet: null, toast: null, overlays: 0, layer: false }
const listeners = new Set<() => void>()

function set(patch: Partial<PhoneUI>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function usePhoneUI<T>(pick: (s: PhoneUI) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state), () => pick(state))
}

export function setPhoneLayer(on: boolean) { if (state.layer !== on) set({ layer: on }) }

/** Open the switcher; `search` focuses its field (the bar's Search button, ⌘K). */
export function openLauncher(search = false) { set({ launcherOpen: true, launcherSearch: search }) }
export function closeLauncher() { set({ launcherOpen: false, launcherSearch: false }) }

export function openActionSheet(title: string, options: ActionSheetOption[], onDismiss?: () => void) {
  const prev = state.actionSheet
  set({ actionSheet: { title, options, onDismiss } })
  if (prev && prev.onDismiss && prev.onDismiss !== onDismiss) prev.onDismiss()
}
export function closeActionSheet() {
  const prev = state.actionSheet
  if (!prev) return
  set({ actionSheet: null })
  prev.onDismiss?.()
}

let toastSeq = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null
const TOAST_MS = 4200

/** The phone toast: `Done · ‹title›`, `Moved PacBio to Engaged`. With `undo`
 *  it carries an Undo button for its whole life. */
export function phoneToast(text: string, undo?: () => void) {
  if (toastTimer) clearTimeout(toastTimer)
  const id = ++toastSeq
  set({ toast: { id, text, undo: undo ?? null } })
  toastTimer = setTimeout(() => { if (state.toast?.id === id) set({ toast: null }) }, TOAST_MS)
}
export function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer)
  set({ toast: null })
}

/** Register an open sheet or pushed page; returns the release. */
export function holdOverlay(): () => void {
  set({ overlays: state.overlays + 1 })
  let released = false
  return () => {
    if (released) return
    released = true
    set({ overlays: Math.max(0, state.overlays - 1) })
  }
}
