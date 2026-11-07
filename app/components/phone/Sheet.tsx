'use client'

// A record on the phone: a bottom sheet with a medium and a large detent
// (phone rule 3). Drag the grabber or header: it follows the finger, rubber-
// bands past the top, and on release lands where the flick was heading. A tap
// on the header swaps detents. The body scrolls only at the large detent, so
// at medium a drag anywhere on the sheet moves the sheet.
//
// `actionBar` is pinned to the bottom of the SCREEN while the sheet is open, so
// it stays in reach at the medium detent too.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { holdOverlay } from '@/lib/phone/ui-store'
import { project, rubberband, spring, velocityTracker, type SpringHandle } from '@/lib/phone/motion'

export type Detent = 'medium' | 'large'

interface Props {
  open: boolean
  onClose: () => void
  /** The grab region under the grabber: monogram, name, close button. */
  header?: React.ReactNode
  children: React.ReactNode
  actionBar?: React.ReactNode
  /** Detents this sheet may rest at. A picker or form is large only. */
  detents?: Detent[]
  initial?: Detent
  label: string
  /** Background of the sheet surface. */
  surface?: string
  /** Notified when the resting detent changes (a parent may restyle). */
  onDetent?: (d: Detent) => void
  /** The body draws its own side padding (lists run full-bleed). */
  flush?: boolean
  /** Move to a detent from outside (a button that needs the room); a new `seq` asks again. */
  want?: { detent: Detent; seq: number }
}

// Geometry from the prototype's 844px screen: medium top 372, large top 56,
// releasing above 230 goes large, below 600 closes.
const MED = 372 / 844
const LARGE_PAD = 9
const GO_LARGE = 230 / 844
const GO_CLOSE = 600 / 844

function safeTop(): number {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden'
  document.body.appendChild(probe)
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return v
}

export default function Sheet({ open, onClose, header, children, actionBar, detents = ['medium', 'large'], initial = 'medium', label, surface, onDetent, flush, want }: Props) {
  const [mounted, setMounted] = useState(false)
  const [rendered, setRendered] = useState(open)
  const [detent, setDetent] = useState<Detent>(initial)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const y = useRef(0)
  const anim = useRef<SpringHandle | null>(null)
  const geo = useRef({ H: 844, large: 56, medium: 372 })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (open) setRendered(true) }, [open])

  const measure = useCallback(() => {
    const H = window.innerHeight
    geo.current = { H, large: Math.max(12, safeTop() + LARGE_PAD), medium: Math.round(H * MED) }
  }, [])

  const paint = useCallback((v: number) => {
    y.current = v
    const { H, large, medium } = geo.current
    const shown = v < large ? large - rubberband(large - v, H, 0.3) : v
    const el = sheetRef.current
    if (el) el.style.transform = `translateY(${shown}px)`
    // Scrim: 0.6 at medium, 1 at large, fading to 0 as it leaves.
    let o = 0
    if (shown <= medium) o = 0.6 + 0.4 * (medium - shown) / Math.max(1, medium - large)
    else o = 0.6 * Math.max(0, 1 - (shown - medium) / Math.max(1, H - medium))
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.min(1, Math.max(0, o)))
  }, [])

  const restAt = useCallback((d: Detent | 'closed', velocity = 0) => {
    const { H, large, medium } = geo.current
    const to = d === 'closed' ? H + 24 : d === 'large' ? large : medium
    anim.current?.stop()
    anim.current = spring({
      from: y.current, to, velocity, response: 0.36, damping: d === 'closed' ? 1 : 0.92,
      onUpdate: paint,
      onDone: () => {
        anim.current = null
        if (d === 'closed') setRendered(false)
      },
    })
    if (d !== 'closed') { setDetent(d); onDetent?.(d) }
  }, [paint, onDetent])

  // Open / close.
  useLayoutEffect(() => {
    if (!rendered) return
    if (open) {
      measure()
      if (!anim.current && (y.current === 0 || y.current >= geo.current.H)) paint(geo.current.H + 24)
      restAt(detents.includes(initial) ? initial : detents[0])
    } else {
      restAt('closed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rendered])

  useEffect(() => {
    if (want && open && detents.includes(want.detent)) restAt(want.detent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want?.seq])

  // The command bar and the toast make room while a sheet is up.
  useEffect(() => {
    if (!open) return
    return holdOverlay()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    const onResize = () => { measure(); paint(detent === 'large' ? geo.current.large : geo.current.medium) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [open, detent, measure, paint])

  useEffect(() => { if (open) sheetRef.current?.focus({ preventScroll: true }) }, [open])

  // Dragging.
  const drag = useRef<{ y0: number; from: number; id: number; moved: boolean; onBody: boolean; onControl: boolean } | null>(null)
  const tracker = useRef(velocityTracker())

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 0 || !open) return
    const onBody = !!bodyRef.current?.contains(e.target as Node)
    // At large the body scrolls, so only the header drags.
    if (onBody && detent === 'large') return
    const onControl = !!(e.target as HTMLElement).closest('button,a,input,textarea,select,[role="button"]')
    const from = anim.current ? anim.current.stop().x : y.current
    anim.current = null
    drag.current = { y0: e.clientY, from, id: e.pointerId, moved: false, onBody, onControl }
    tracker.current = velocityTracker()
    tracker.current.add(from)
    // The header claims the finger at once: a fast flick would otherwise leave
    // the sheet before the first move registers. Not on a control, whose own
    // click needs the pointer.
    if (!onBody && !onControl) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (!d.moved) {
      if (Math.abs(dy) < 6) return
      d.moved = true
      if (d.onBody || d.onControl) (e.currentTarget as HTMLElement).setPointerCapture(d.id)
    }
    const next = d.from + dy
    paint(next)
    tracker.current.add(next)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const { H, large } = geo.current
    if (!d.moved) {
      // A tap in the body, or on a control, is theirs.
      if (d.onBody || d.onControl) {
        if (anim.current === null) restAt(detent)
        return
      }
      // A tap on the header swaps detents.
      if (detents.length > 1) restAt(detent === 'medium' ? 'large' : 'medium')
      else restAt(detent)
      return
    }
    const v = tracker.current.velocity()
    const proj = y.current + project(v)
    if (detents.length === 1) {
      if (y.current - large > 140 || proj - large > 240) { onCloseRef.current(); return }
      restAt(detents[0], v)
      return
    }
    if (proj > H * GO_CLOSE) { anim.current?.stop(); anim.current = null; onCloseRef.current(); return }
    restAt(proj < H * GO_LARGE ? 'large' : 'medium', v)
  }

  if (!mounted || !rendered) return null

  return createPortal(
    <>
      <div ref={scrimRef} className="ph-sheet-scrim" onClick={() => onCloseRef.current()} style={{ opacity: 0 }} />
      <div
        ref={sheetRef}
        className="ph-sheet"
        data-detent={detent}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ transform: 'translateY(110vh)', background: surface }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ph-sheet-grab">
          <div className="ph-sheet-grabber"><span /></div>
          {header}
        </div>
        <div ref={bodyRef} className="ph-sheet-body" data-has-bar={actionBar ? '' : undefined} data-flush={flush ? '' : undefined}>{children}</div>
      </div>
      {actionBar ? <div className="ph-sheet-bar" data-open={open ? '' : undefined}>{actionBar}</div> : null}
    </>,
    document.body,
  )
}
