'use client'

// The section switcher: one pill on a paper strip across the top of the canvas —
// Build · Logic · Design · Share · Settings. Responses left it on 09-26 for the
// Forms app's Responses page (the band's Responses button opens this form's);
// for a while Build's parts sat in a second pill beside it, and one pill was preferred
// the one bar. Content scrolls under the strip (it used to fade the bare
// pill over the fields, QA 2026-10-16); Left/Right move between sections
// (Seg). data-scrolling still marks an active scroll. Narrower than 1280
// it keeps the words only on the active section.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Seg } from '../ui'
import type { Tab } from './context'

const ICONS: Record<Tab, string> = { build: 'layout', logic: 'branch', theme: 'sparkles', share: 'link', settings: 'settings' }
const LABELS: Record<Tab, string> = { build: 'Build', logic: 'Logic', theme: 'Design', share: 'Share', settings: 'Settings' }

export default function SectionBar({ tab, onChange, rules, broken }: { tab: Tab; onChange: (t: Tab) => void; rules: number; broken: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolling, setScrolling] = useState(false)
  // Scroll events don't bubble, but they do capture: one listener on the
  // region behind the bar hears every scroll container inside it.
  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    let timer = 0
    const on = () => { setScrolling(true); window.clearTimeout(timer); timer = window.setTimeout(() => setScrolling(false), 300) }
    host.addEventListener('scroll', on, true)
    return () => { host.removeEventListener('scroll', on, true); window.clearTimeout(timer) }
  }, [])
  const opt = (t: Tab, extra?: ReactNode) => ({ value: t, icon: ICONS[t], ariaLabel: LABELS[t], testId: `tab-${t}`, label: <><span className="fb-seg__txt">{LABELS[t]}</span>{extra}</> })
  return (
    <div ref={ref} className="fb-sectionbar" data-scrolling={scrolling ? 'true' : 'false'} data-testid="section-bar">
      <Seg<Tab> value={tab} onChange={onChange} label="Builder sections" role="tablist" className="fb-seg--float" options={[
        opt('build'),
        opt('logic', rules > 0 ? <span className={`fb-badge${broken ? ' fb-badge--coral' : ''}`} data-testid="logic-badge-count">{rules}</span> : null),
        opt('theme'), opt('share'), opt('settings'),
      ]} />
    </div>
  )
}
