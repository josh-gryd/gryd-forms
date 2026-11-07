'use client'

// Forms primitives, built to the GRYD v2 "Poster" contracts the handoff names
// (Btn, IconBtn, Seg, Tag, Toggle, Menu, Toaster, Sheet, Confirm, Banner,
// SaveState, Stamp, EmptyState, Field/Input/Select/Textarea). Tokens only —
// no literal colour anywhere in here; forms.css carries the classes.

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePhone } from '@/lib/phone/use-phone'
import { openActionSheet } from '@/lib/phone/ui-store'
import { Icon } from './icons'

export { Icon }

type Div = React.HTMLAttributes<HTMLDivElement>

// ── Buttons ──────────────────────────────────────────────────────────────────

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  solid?: boolean; danger?: boolean; ghost?: boolean; dashed?: boolean; quiet?: boolean
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  testId?: string
}
export function Btn({ solid, danger, ghost, dashed, quiet, size = 'md', icon, children, className, testId, type = 'button', ...rest }: BtnProps) {
  const cls = ['fb-btn', solid && 'fb-btn--solid', danger && 'fb-btn--danger', ghost && 'fb-btn--ghost', dashed && 'fb-btn--dashed', quiet && 'fb-btn--quiet', size === 'lg' && 'fb-btn--lg', size === 'sm' && 'fb-btn--sm', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} data-testid={testId} {...rest}>{icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}{children}</button>
}

export interface IconBtnProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string; label: string; size?: 'xs' | 'sm' | 'md'; framed?: boolean; danger?: boolean; active?: boolean; iconSize?: number
}
export function IconBtn({ icon, label, size = 'md', framed, danger, active, iconSize, className, type = 'button', ...rest }: IconBtnProps) {
  const cls = ['fb-iconbtn', size === 'sm' && 'fb-iconbtn--sm', size === 'xs' && 'fb-iconbtn--xs', framed && 'fb-iconbtn--framed', danger && 'fb-iconbtn--danger', active && 'fb-iconbtn--active', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} aria-label={label} title={label} {...rest}><Icon name={icon} size={iconSize ?? (size === 'md' ? 16 : 14)} /></button>
}

// ── Seg ──────────────────────────────────────────────────────────────────────

export interface SegOption<T extends string> { value: T; label: React.ReactNode; icon?: string; testId?: string; /** Name when the label is a node (or hidden, as the floating bar's are when narrow). */ ariaLabel?: string }
export function Seg<T extends string>({ value, options, onChange, thumb = 'gold', size = 'md', grow, round, label, role = 'radiogroup', style, className, testId }: {
  value: T; options: SegOption<T>[]; onChange: (v: T) => void; thumb?: 'gold' | 'lime'; size?: 'md' | 'lg'; grow?: boolean; round?: boolean; label: string; role?: 'radiogroup' | 'tablist'; style?: React.CSSProperties; className?: string; testId?: string
}) {
  const cls = ['fb-seg', thumb === 'lime' && 'fb-seg--lime', size === 'lg' && 'fb-seg--lg', grow && 'fb-seg--grow', round && 'fb-seg--round', className].filter(Boolean).join(' ')
  const itemRole = role === 'tablist' ? 'tab' : 'radio'
  const checkedAttr = role === 'tablist' ? 'aria-selected' : 'aria-checked'
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onChange(options[j].value)
    ;(e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus()
  }
  return (
    <div className={cls} role={role} aria-label={label} style={style} data-testid={testId}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role={itemRole} {...{ [checkedAttr]: o.value === value }} tabIndex={o.value === value ? 0 : -1} className="fb-seg__opt" onClick={() => onChange(o.value)} onKeyDown={e => onKey(e, i)} data-testid={o.testId} aria-label={o.ariaLabel}>
          {o.icon && <span className="fb-seg__ico"><Icon name={o.icon} size={14} /></span>}<span className="fb-seg__label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Tag, Stamp ───────────────────────────────────────────────────────────────

export type TagTone = 'neutral' | 'lime' | 'lime-bg' | 'gold' | 'gold-bg' | 'coral' | 'plain'
export function Tag({ tone = 'plain', children, large, style, title, testId }: { tone?: TagTone; children: React.ReactNode; large?: boolean; style?: React.CSSProperties; title?: string; testId?: string }) {
  const cls = ['fb-tag', tone !== 'plain' && `fb-tag--${tone}`, large && 'fb-tag--lg'].filter(Boolean).join(' ')
  return <span className={cls} style={style} title={title} data-testid={testId}>{children}</span>
}

export function Stamp({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <span className={['fb-stamp', className].filter(Boolean).join(' ')} aria-hidden="true" style={style}>{children}</span>
}

// ── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({ on, onChange, label, sub, coral, testId, disabled }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode; sub?: React.ReactNode; coral?: boolean; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={['fb-toggle', coral && 'fb-toggle--coral'].filter(Boolean).join(' ')} onClick={() => onChange(!on)} data-testid={testId} disabled={disabled}>
      <span style={{ flex: 1 }}>{label}{sub && <span style={{ fontWeight: 600, color: 'var(--mut2)' }}> · {sub}</span>}</span>
      <span className="fb-toggle__track"><span className="fb-toggle__knob" /></span>
    </button>
  )
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export function Field({ label, hint, error, children, style, htmlFor }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; style?: React.CSSProperties; htmlFor?: string }) {
  return (
    <div className="fb-field" style={style}>
      {label && <label className="fb-caps fb-caps--tx2" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="fb-field__error" role="alert"><Icon name="alert" size={13} />{error}</span> : hint ? <span className="fb-field__hint">{hint}</span> : null}
    </div>
  )
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(function Input({ className, invalid, mono, readOnly, ...rest }, ref) {
  return <input ref={ref} readOnly={readOnly} className={['fb-input', invalid && 'fb-input--error', readOnly && mono && 'fb-input--readonly', className].filter(Boolean).join(' ')} {...rest} />
})
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, ...rest }, ref) {
  return <select ref={ref} className={['fb-select', invalid && 'fb-select--error', className].filter(Boolean).join(' ')} {...rest} />
})
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={['fb-textarea', invalid && 'fb-textarea--error', className].filter(Boolean).join(' ')} {...rest} />
})
export function Checkbox({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; testId?: string }) {
  return <label className="fb-check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} data-testid={testId} />{label}</label>
}
export function SearchBox({ value, onChange, placeholder, large, autoFocus, label, style, onKeyDown, inputRef, hint }: { value: string; onChange: (v: string) => void; placeholder?: string; large?: boolean; autoFocus?: boolean; label: string; style?: React.CSSProperties; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; inputRef?: React.Ref<HTMLInputElement>; hint?: React.ReactNode }) {
  return (
    <label className={['fb-search', large && 'fb-search--lg'].filter(Boolean).join(' ')} style={style}>
      <Icon name="search" size={14} />
      <input ref={inputRef} aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} />
      {hint}
    </label>
  )
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({ children, flat, small, style, className, ...rest }: Div & { flat?: boolean; small?: boolean }) {
  return <div className={['fb-card', flat && 'fb-card--flat', small && 'fb-card--sm', className].filter(Boolean).join(' ')} style={style} {...rest}>{children}</div>
}

/** `wrap` lets a wide action drop under the text on a narrow screen instead of squeezing it. */
export function Banner({ tone = 'gold', icon, children, action, inline, wrap, role = 'status', style }: { tone?: 'gold' | 'coral' | 'lime' | 'neutral'; icon?: string; children: React.ReactNode; action?: React.ReactNode; inline?: boolean; wrap?: boolean; role?: 'status' | 'alert'; style?: React.CSSProperties }) {
  return (
    <div role={role} className={['fb-banner', tone !== 'neutral' && `fb-banner--${tone}`, inline && 'fb-banner--inline'].filter(Boolean).join(' ')} style={wrap ? { flexWrap: 'wrap', ...style } : style}>
      {icon && <Icon name={icon} size={15} />}
      <span style={{ flex: wrap ? '1 1 220px' : 1, minWidth: 0 }}>{children}</span>
      {action}
    </div>
  )
}

export function EmptyState({ title, body, action, style, testId }: { title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; style?: React.CSSProperties; testId?: string }) {
  return (
    <div className="fb-empty" style={style} data-testid={testId}>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      {body && <span style={{ fontSize: 13.5, color: 'var(--tx2)', maxWidth: 520 }}>{body}</span>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

export function Skeleton({ width, height = 14, style }: { width?: number | string; height?: number; style?: React.CSSProperties }) {
  return <span className="fb-skeleton" style={{ display: 'block', width: width ?? '100%', height, ...style }} aria-hidden="true" />
}

export type SaveStateValue = 'idle' | 'saving' | 'saved' | 'error' | 'offline'
/** `onBand` draws it in the surrounding text colour (the builder's band is a
 *  solid fill, where the panel greys and the coral text would vanish); the
 *  icon and the words carry the state there, not the colour. */
export function SaveState({ state, onRetry, onBand }: { state: SaveStateValue; onRetry?: () => void; onBand?: boolean }) {
  const color = onBand ? 'inherit' : state === 'error' ? 'var(--coral-tx)' : state === 'saving' || state === 'idle' ? 'var(--mut2)' : 'var(--tx2)'
  const dim = onBand && (state === 'saving' || state === 'idle')
  return (
    <span role="status" aria-live="polite" data-testid="save-state" data-state={state} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: onBand ? 13 : 12, fontWeight: onBand ? 700 : 600, color, opacity: dim ? .8 : 1, minWidth: 70 }}>
      {state === 'saving' && 'Saving…'}
      {state === 'saved' && <><span className="fb-pop" style={{ display: 'grid' }}><Icon name="check" size={13} /></span>Saved</>}
      {state === 'offline' && <><Icon name="wifi-off" size={13} />Offline</>}
      {state === 'error' && <><Icon name="alert" size={13} />Couldn’t save · <button type="button" onClick={onRetry} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: onBand ? 'inherit' : 'var(--coral-tx)', textDecoration: 'underline 2px', cursor: 'pointer' }}>Retry</button></>}
    </span>
  )
}

// ── Menus (context + dropdown) ───────────────────────────────────────────────

export type MenuItem = { sep: true } | { label: string; icon?: string; /** In place of the icon (a folder in its color). */ lead?: React.ReactNode; /** The current choice, ticked. */ checked?: boolean; shortcut?: string; danger?: boolean; disabled?: boolean; run: () => void; testId?: string }
/** `top` (optional) is the anchor's top edge: when the menu can't fit below, it opens above the anchor instead of sliding up over it. */
export interface MenuAt { x: number; y: number; top?: number }

export function Menu({ at, items, onClose, label = 'Menu', returnFocusTo }: { at: MenuAt; items: MenuItem[]; onClose: () => void; label?: string; returnFocusTo?: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  const [active, setActive] = useState(0)
  const enabled = useMemo(() => items.map((it, i) => ({ it, i })).filter(x => !('sep' in x.it) && !(x.it as { disabled?: boolean }).disabled), [items])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(at.x, window.innerWidth - r.width - 8)
    // Not enough room below: open above the anchor rather than covering it, so the
    // button that opened the menu stays clickable (QA 2026-10-15, the toolbar type chip).
    const y = at.y + r.height > window.innerHeight - 8 && at.top !== undefined && at.top - 6 - r.height >= 8 ? at.top - 6 - r.height : Math.min(at.y, window.innerHeight - r.height - 8)
    setPos({ x: Math.max(8, x), y: Math.max(8, y) })
  }, [at])
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
    first?.focus()
    return () => { returnFocusTo?.focus?.() }
  }, [returnFocusTo])
  // On a phone a menu is an action sheet (phone rule 3): separators drop out,
  // the ticked choice is the current one, and the sheet's dismissal is onClose.
  const phone = usePhone()
  useEffect(() => {
    if (!phone) return
    const real = items.filter((it): it is Exclude<MenuItem, { sep: true }> => !('sep' in it))
    openActionSheet(label === 'Menu' ? '' : label, real.map(it => ({ label: it.label, current: it.checked, danger: it.danger, disabled: it.disabled, onPick: () => it.run() })), onClose)
    // Opened once per mount; the sheet reports its own dismissal through onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])
  const onKey = (e: React.KeyboardEvent) => {
    // Escape closes only the menu; it must not also reach the page's own Escape (which deselects).
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = enabled.length; if (!n) return
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
      setActive(next)
      const btn = ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')[next]
      btn?.focus()
    }
    if (e.key === 'Tab') { e.preventDefault(); onClose() }
  }
  if (phone) return null
  return createPortal(
    <>
      <div className="fb-scrim" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={ref} role="menu" aria-label={label} className="fb-menu" data-forms-root="" style={{ left: pos.x, top: pos.y }} onKeyDown={onKey}>
        {items.map((it, i) => 'sep' in it ? <hr key={i} className="fb-menu__sep" /> : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} data-testid={it.testId} className={['fb-menu__item', it.danger && 'fb-menu__item--danger'].filter(Boolean).join(' ')} onClick={e => { e.stopPropagation(); onClose(); it.run() }} onMouseEnter={() => setActive(enabled.findIndex(x => x.i === i))}>
            <span style={{ width: 16, display: 'grid', placeItems: 'center' }}>{it.lead ?? (it.icon && <Icon name={it.icon} size={14} />)}</span>
            <span style={{ flex: 1 }}>{it.label}{it.checked && <span className="fb-sr">, current</span>}</span>
            {it.checked && <Icon name="check" size={14} />}
            {it.shortcut && <span className="fb-menu__shortcut">{it.shortcut}</span>}
          </button>
        ))}
      </div>
    </>, document.body)
}

/** Anchor a menu below/right of an element. */
export function menuAnchor(el: HTMLElement | null): MenuAt {
  if (!el) return { x: 16, y: 16 }
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 6, top: r.top }
}

// ── Toasts ───────────────────────────────────────────────────────────────────

export interface ToastInput { msg: React.ReactNode; action?: string; onAction?: () => void; stamp?: string; tone?: 'neutral' | 'lime' | 'coral'; duration?: number; testId?: string }
interface ToastRecord extends ToastInput { id: number }
const ToastCtx = createContext<{ toast: (t: ToastInput) => void; dismiss: () => void }>({ toast: () => undefined, dismiss: () => undefined })
export const useToast = () => useContext(ToastCtx)

export function Toaster({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastRecord | null>(null)
  const timer = useRef<number | null>(null)
  const remaining = useRef(0)
  const startedAt = useRef(0)
  const clear = useCallback(() => { if (timer.current) window.clearTimeout(timer.current); timer.current = null }, [])
  const dismiss = useCallback(() => { clear(); setCurrent(null) }, [clear])
  const arm = useCallback((ms: number) => { clear(); remaining.current = ms; startedAt.current = Date.now(); timer.current = window.setTimeout(() => setCurrent(null), ms) }, [clear])
  const toast = useCallback((t: ToastInput) => {
    const rec: ToastRecord = { ...t, id: Date.now() + Math.random() }
    setCurrent(rec)
    arm(t.duration ?? (t.action ? 8000 : 5000))
  }, [arm])
  const pause = () => { if (!timer.current) return; clear(); remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt.current)) }
  const resume = () => { if (current && !timer.current) arm(remaining.current) }
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" data-fb-toaster="" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 210, pointerEvents: current ? 'auto' : 'none' }}>
        {current && (
          <div role="status" key={current.id} className={['fb-toast', current.tone === 'lime' && 'fb-toast--lime', current.tone === 'coral' && 'fb-toast--coral'].filter(Boolean).join(' ')} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume} data-testid={current.testId ?? 'toast'}>
            {current.stamp && <Stamp style={{ position: 'absolute', left: -10, top: -12 }}>{current.stamp}</Stamp>}
            <span style={{ flex: 1 }}>{current.msg}</span>
            {current.action && <Btn size="sm" onClick={() => { current.onAction?.(); dismiss() }} data-testid="toast-action">{current.action}</Btn>}
            <IconBtn icon="x" label="Dismiss" size="xs" onClick={dismiss} />
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// ── Sheet, Confirm ───────────────────────────────────────────────────────────

function useFocusTrap(open: boolean, ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  // The close callback lives in a ref: re-subscribing the document listener on
  // every parent render would leave a gap in which an Escape press is lost.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const focusable = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(x => !x.hasAttribute('disabled'))
    const first = focusable()[0]
    ;(el?.querySelector<HTMLElement>('[data-autofocus]') ?? first)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return }
      if (e.key !== 'Tab' || !el) return
      const list = focusable(); if (!list.length) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus() }
      else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [open, ref])
}

export function Sheet({ open, onClose, children, label, style }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(open, ref, onClose)
  if (!open) return null
  return createPortal(
    <>
      <div className="fb-scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="fb-sheet" style={style} data-forms-root="" data-testid="sheet">{children}</div>
    </>, document.body)
}

export function Confirm({ open, title, body, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel, busy }: { open: boolean; title: string; body?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(open, ref, onCancel)
  if (!open) return null
  return createPortal(
    <>
      <div className="fb-scrim fb-scrim--dark" onClick={onCancel} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="fb-confirm-title" className="fb-modal" data-forms-root="" data-testid="confirm">
        <strong id="fb-confirm-title" style={{ fontSize: 16 }}>{title}</strong>
        {body && <div style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.5 }}>{body}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onCancel} data-autofocus="" disabled={busy}>{cancelLabel}</Btn>
          <Btn danger={danger} solid={!danger} onClick={onConfirm} disabled={busy} data-testid="confirm-yes">{confirmLabel}</Btn>
        </div>
      </div>
    </>, document.body)
}

/** A small modal with its own body and actions (move to folder, save as template…). */
export function Dialog({ open, title, children, actions, onClose, testId, width }: { open: boolean; title: string; children: React.ReactNode; actions?: React.ReactNode; onClose: () => void; testId?: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(open, ref, onClose)
  if (!open) return null
  return createPortal(
    <>
      <div className="fb-scrim fb-scrim--dark" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="fb-dialog-title" className="fb-modal" data-forms-root="" data-testid={testId ?? 'dialog'} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        <strong id="fb-dialog-title" style={{ fontSize: 16 }}>{title}</strong>
        {children}
        {actions && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </>, document.body)
}

// ── Live region (announcements for screen readers) ───────────────────────────

const LiveCtx = createContext<(msg: string) => void>(() => undefined)
export const useAnnounce = () => useContext(LiveCtx)
export function LiveRegion({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('')
  const announce = useCallback((m: string) => { setMsg(''); window.setTimeout(() => setMsg(m), 30) }, [])
  return <LiveCtx.Provider value={announce}>{children}<div className="fb-live" aria-live="polite" aria-atomic="true">{msg}</div></LiveCtx.Provider>
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function Kbd({ children }: { children: React.ReactNode }) { return <span className="fb-kbd">{children}</span> }

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7); if (w < 5) return `${w}w ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  if (m < 60) return `${m}m ${r}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso); if (Number.isNaN(t.getTime())) return '—'
  const today = new Date()
  const sameDay = t.toDateString() === today.toDateString()
  const time = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return `${time} today`
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (t.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  const days = (today.getTime() - t.getTime()) / 86_400_000
  if (days < 6) return `${t.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + time
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync(); mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return match
}
