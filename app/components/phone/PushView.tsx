'use client'

// A pushed full-screen page (phone rule 3: conversations), like iOS Messages.
// It slides in from the right while the page under it drifts 90px left and
// dims. A 20px strip on the left edge drags it back 1:1; past 110px it pops,
// short of that it springs home, and it can be caught mid-flight either way.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { holdOverlay } from '@/lib/phone/ui-store'
import { project, spring, velocityTracker, type SpringHandle } from '@/lib/phone/motion'

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  label: string
}

const UNDER_SHIFT = 90
const DIM = 0.16
const POP_AT = 110

/** The element the pushed page slides over: the shell's content column. */
function underlay(): HTMLElement | null {
  return document.querySelector('.shell-main') as HTMLElement | null
}

export default function PushView({ open, onClose, children, label }: Props) {
  const [mounted, setMounted] = useState(false)
  const [rendered, setRendered] = useState(open)
  const viewRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const x = useRef(0)
  const anim = useRef<SpringHandle | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (open) setRendered(true) }, [open])

  const paint = useCallback((v: number) => {
    x.current = v
    const W = window.innerWidth
    const p = Math.max(0, Math.min(1, 1 - v / W))
    if (viewRef.current) viewRef.current.style.transform = `translateX(${Math.max(0, v)}px)`
    // At rest, open or shut, the page underneath carries no transform: a
    // transform makes it the containing block for its own fixed overlays, so a
    // dialog the page opens over the conversation would land behind it.
    const u = underlay()
    if (u) u.style.transform = p > 0 && p < 1 ? `translateX(${-UNDER_SHIFT * p}px)` : ''
    if (dimRef.current) dimRef.current.style.opacity = String(DIM * p)
  }, [])

  const go = useCallback((to: 'open' | 'closed', velocity = 0) => {
    const W = window.innerWidth
    anim.current?.stop()
    anim.current = spring({
      from: x.current, to: to === 'open' ? 0 : W + 4, velocity, response: 0.36,
      onUpdate: paint,
      onDone: () => {
        anim.current = null
        if (to === 'closed') {
          const u = underlay()
          if (u) u.style.transform = ''
          setRendered(false)
        }
      },
    })
  }, [paint])

  useLayoutEffect(() => {
    if (!rendered) return
    if (open) {
      if (!anim.current) paint(window.innerWidth + 4)
      go('open')
    } else go('closed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rendered])

  useEffect(() => {
    if (!open) return
    return holdOverlay()
  }, [open])

  useEffect(() => () => { const u = underlay(); if (u) u.style.transform = '' }, [])

  // Edge-swipe back.
  const drag = useRef<{ x0: number; from: number } | null>(null)
  const tracker = useRef(velocityTracker())
  const onEdgeDown = (e: React.PointerEvent) => {
    if (e.button > 0) return
    const from = anim.current ? anim.current.stop().x : x.current
    anim.current = null
    drag.current = { x0: e.clientX, from }
    tracker.current = velocityTracker()
    tracker.current.add(from)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onEdgeMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const next = Math.max(0, d.from + e.clientX - d.x0)
    paint(next)
    tracker.current.add(next)
  }
  const onEdgeUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const v = tracker.current.velocity()
    if (x.current + project(v, 0.99) > POP_AT && x.current > 8) { go('closed', v); onCloseRef.current() }
    else go('open', v)
  }

  if (!mounted || !rendered) return null

  return createPortal(
    <>
      <div ref={dimRef} className="ph-push-dim" style={{ opacity: 0 }} />
      <div ref={viewRef} className="ph-push" role="dialog" aria-label={label} style={{ transform: 'translateX(100vw)' }}>
        {children}
        <div className="ph-push-edge" onPointerDown={onEdgeDown} onPointerMove={onEdgeMove} onPointerUp={onEdgeUp} onPointerCancel={onEdgeUp} />
      </div>
    </>,
    document.body,
  )
}
