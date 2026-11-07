'use client'

// One horizontally scrolling row of chips or tabs (QA 2026-10-16: on a phone
// the last chip was cut mid-word with nothing saying the row scrolls). The
// outer box keeps the caller's class — `.ph-filters` stays sticky, on paper,
// with its rule — and an inner track does the scrolling. When there is more
// to one side, that edge gets a drawn cap: a paper strip with a small framed
// chevron that scrolls the row (no fade: the system draws, it doesn't blur).
// The selected chip is kept in view without moving the page.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

/** Style keys that belong to the scrolling track rather than the frame. */
const TRACK_KEYS = new Set(['alignItems', 'gap', 'columnGap', 'justifyContent', 'flexWrap', 'padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'])

export function splitRowStyle(style: React.CSSProperties | undefined): { frame: React.CSSProperties; track: React.CSSProperties } {
  const frame: Record<string, unknown> = {}, track: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(style ?? {})) (TRACK_KEYS.has(k) ? track : frame)[k] = v
  return { frame: frame as React.CSSProperties, track: track as React.CSSProperties }
}

/** Which edges have more content past them (2px slack for sub-pixel widths). */
export function rowEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): { start: boolean; end: boolean } {
  const max = scrollWidth - clientWidth
  return { start: max > 2 && scrollLeft > 2, end: max > 2 && scrollLeft < max - 2 }
}

/** The scrollLeft that brings [left, left+width) fully into view with `pad` clear
 *  of each edge (the caps), or null when it already is. */
export function revealLeft(left: number, width: number, scrollLeft: number, clientWidth: number, pad = 40): number | null {
  if (left - pad < scrollLeft) return Math.max(0, left - pad)
  if (left + width + pad > scrollLeft + clientWidth) return left + width + pad - clientWidth
  return null
}

const SELECTED = '[aria-pressed="true"], [aria-selected="true"], [data-on="1"]'

type Props = Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> & { style?: React.CSSProperties; trackStyle?: React.CSSProperties }

export const ScrollRow = forwardRef<HTMLDivElement, Props>(function ScrollRow({ className, style, trackStyle, children, ...rest }, ref) {
  const track = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => track.current as HTMLDivElement)
  const [edge, setEdge] = useState({ start: false, end: false })
  const lastSel = useRef<Element | null>(null)

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const next = rowEdges(el.scrollLeft, el.scrollWidth, el.clientWidth)
    setEdge(p => (p.start === next.start && p.end === next.end ? p : next))
  }, [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    for (const c of Array.from(el.children)) ro?.observe(c)
    return () => { el.removeEventListener('scroll', measure); ro?.disconnect() }
  }, [measure])

  // After every render: re-measure (chips and counts change) and, when the
  // selection moved, scroll the track — never the page — to show it.
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    measure()
    const sel = el.querySelector(SELECTED) as HTMLElement | null
    if (!sel || sel === lastSel.current) return
    lastSel.current = sel
    const to = revealLeft(sel.offsetLeft - el.offsetLeft, sel.offsetWidth, el.scrollLeft, el.clientWidth)
    if (to != null) el.scrollLeft = to
  })

  const nudge = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const { frame, track: fromStyle } = splitRowStyle(style)
  // Callers pass `position: static` to turn off `.ph-filters`' stickiness; the
  // frame still has to anchor the edge caps.
  if (frame.position === 'static') frame.position = 'relative'
  return (
    <div className={`gx-srow${className ? ` ${className}` : ''}`} data-more-start={edge.start ? '' : undefined} data-more-end={edge.end ? '' : undefined} style={frame}>
      <div ref={track} className="gx-srow-track" style={{ ...fromStyle, ...trackStyle }} {...rest}>{children}</div>
      {edge.start && (
        <button type="button" className="gx-srow-more" data-side="start" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      )}
      {edge.end && (
        <button type="button" className="gx-srow-more" data-side="end" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      )}
    </div>
  )
})
