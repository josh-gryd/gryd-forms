'use client'

// The phone layer's shell, mounted once in the root layout. Below 768px under
// the v2 system it draws the command bar, the app switcher, the action sheet
// and the toast ("Stack + Bar", engine/docs/design/phone-shell/), and it
// drives the two things every page shares:
//
//   • scrolling a list down shrinks the command bar to a pill (back on any
//     scroll up, and always near the top). It's an attribute on <html>, so
//     CSS does the work and no page re-renders on scroll;
//   • the screen's two edges. iOS 26 colours the strip under the status bar
//     from a fixed, full-width element at the top edge, and with none fades
//     the page colour over the band (the "feathering"). The edge strip is that
//     element, in whatever colour shows there: the band, or the sheet, scrim or
//     pushed page over it. At the bottom a solid dock holds the command bar, so
//     nothing scrolls under it and iOS has a colour there too.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { usePhoneShell } from '@/lib/phone/use-phone'
import { setPhoneLayer, usePhoneUI } from '@/lib/phone/ui-store'
import ActionSheet from './ActionSheet'
import PhoneToast from './PhoneToast'

/** Lists that shrink the bar: the shell's scroll container, and any list a
 *  page scrolls itself (a board column, a pane) marked data-ph-scroll. */
const FOLDS = '.mobile-main, [data-ph-scroll]'
const OVERLAY = '.ph-sheet, .ph-push, .modal-scrim, .popover-panel'

function setFlag(name: string, on: boolean) {
  const el = document.documentElement
  if (on) el.setAttribute(name, '')
  else el.removeAttribute(name)
}

let paint: CanvasRenderingContext2D | null = null

/** The colour the eye sees at a point: every background there, painted
 *  bottom-up the way the browser composites them. */
function seenColour(x: number, y: number): string | null {
  paint ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!paint) return null
  paint.clearRect(0, 0, 1, 1)
  for (const el of document.elementsFromPoint(x, y).reverse()) {
    const cs = getComputedStyle(el)
    paint.globalAlpha = Number(cs.opacity)
    paint.fillStyle = 'transparent'
    paint.fillStyle = cs.backgroundColor
    paint.fillRect(0, 0, 1, 1)
  }
  const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
  return a ? `rgb(${r}, ${g}, ${b})` : null
}

export default function PhoneChrome() {
  const phone = usePhoneShell()
  const pathname = usePathname()
  const overlays = usePhoneUI(s => s.overlays)
  const launcherOpen = usePhoneUI(s => s.launcherOpen)

  // No command bar in a one-app install: the band's title picker moves between pages.
  const bare = true

  useEffect(() => {
    setFlag('data-ph', phone)
    setPhoneLayer(phone)
    return () => { setFlag('data-ph', false); setPhoneLayer(false) }
  }, [phone])

  useEffect(() => {
    setFlag('data-ph-nobar', phone && bare)
    return () => setFlag('data-ph-nobar', false)
  }, [phone, bare])

  useEffect(() => {
    setFlag('data-ph-overlay', overlays > 0)
  }, [overlays])

  // A new page starts with the full bar.
  useEffect(() => {
    setFlag('data-ph-barhidden', false)
  }, [pathname])

  useEffect(() => {
    if (!phone) return
    const last = new WeakMap<Element, number>()
    const onScroll = (e: Event) => {
      const t = e.target
      if (!(t instanceof HTMLElement) || !t.matches(FOLDS) || t.closest(OVERLAY)) return
      const y = t.scrollTop
      const prev = last.get(t) ?? 0
      last.set(t, y)
      if (y === prev) return
      if (y < 20) setFlag('data-ph-barhidden', false)
      else if (y - prev > 6) setFlag('data-ph-barhidden', true)
      else if (prev - y > 6) setFlag('data-ph-barhidden', false)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [phone])

  // The edge strip follows what shows under the status bar. Sampled again
  // whenever the page, the theme or anything on screen changes, and when a
  // sheet or a pushed page finishes moving.
  const edgeRef = useRef<HTMLDivElement | null>(null)
  const [edge, setEdge] = useState<string | null>(null)
  const [floor, setFloor] = useState<string | null>(null)
  useEffect(() => {
    if (!phone) return
    const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]')) as HTMLMetaElement[]
    let t = 0
    let cap = 0
    const sample = () => {
      clearTimeout(t); clearTimeout(cap); cap = 0
      // Three points across, so one small thing (a grabber, an icon) can't
      // colour the whole edge.
      const y = Math.max(1, (edgeRef.current?.getBoundingClientRect().height ?? 0) / 2)
      const seen = [0.12, 0.5, 0.88].map(f => seenColour(window.innerWidth * f, y))
      const colour = seen.find((c, i) => c && seen.indexOf(c) !== i) ?? seen[1]
      if (!colour) return
      setEdge(colour)
      metas.forEach(m => { m.content = colour })
      // The dock is the page's own canvas (the Plan keeps its own).
      const main = document.querySelector('.mobile-main')
      setFloor(main ? getComputedStyle(main).backgroundColor : null)
    }
    // Once things settle; a sheet's drag and spring are inline styles, so a
    // run of changes waits for the last, and never more than half a second.
    const soon = () => {
      clearTimeout(t); t = window.setTimeout(sample, 120)
      if (!cap) cap = window.setTimeout(sample, 500)
    }
    sample()
    const watch = new MutationObserver(soon)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'data-ph-overlay'] })
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    document.addEventListener('transitionend', soon, true)
    document.addEventListener('animationend', soon, true)
    window.addEventListener('resize', soon)
    return () => {
      clearTimeout(t); clearTimeout(cap)
      watch.disconnect()
      document.removeEventListener('transitionend', soon, true)
      document.removeEventListener('animationend', soon, true)
      window.removeEventListener('resize', soon)
    }
  }, [phone, pathname, overlays, launcherOpen])

  if (!phone) return null
  return (
    <>
      {/* Keyed by colour: iOS reads the edge colour when the element arrives. */}
      <div ref={edgeRef} key={edge ?? ''} className="ph-edge-top" style={edge ? { background: edge } : undefined} aria-hidden="true" />
      <div key={`dock${floor}`} className="ph-dock" style={floor ? { background: floor } : undefined} aria-hidden="true" />
      <ActionSheet />
      <PhoneToast />
    </>
  )
}
