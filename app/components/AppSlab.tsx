'use client'

// The app band — the one page header every app in the portal wears.
//
// Title, the page's own toolbar, and a single primary action, on ONE 64px row
//. The subtitle is not gone, it is one hover
// away on the ⓘ beside the title — it explains the page once, and then costs
// vertical space forever.
//
// It is drawn in the app's identity hue (PERAPPIDENTITY.md §6) and sits above
// the scroll container rather than inside it, so it is structurally pinned —
// a full-height page (Docs, the LinkedIn two-pane, the Flows 2.0 frame) keeps
// its `height: 100%` against what is left, and nothing scrolls under the band.
//
// Title and subtitle come from the app registry, so the band can never
// disagree with the sidebar row or the breadcrumb that name the same page.
// A page needing live text, its own controls, or a stateful button fills a
// slot instead — SlabTools / SlabAction / SlabSub below.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { activePage, appForPath, extraPageFor } from '@/lib/apps'
import { v2FrameFor } from '@/lib/apps-v2'
import { openActionSheet } from '@/lib/phone/ui-store'
import { PhoneIcon } from './phone/icons'
import { isFormBuilderPath } from '@/lib/forms/slot'
import { FONT_DISPLAY } from './ui'
import { usePhone } from '@/lib/phone/use-phone'


// Surfaces that are not the portal: sign-in, the access wall, and the OAuth
// return hop. Each is a full-page state, not a tab inside an app.
const BARE = ['/auth', '/no-access', '/plaid-oauth', '/floor']

// Docs draws its own sidebar INSIDE the page, so the shell's left column is
// empty there. The band has to start to the right of that sidebar rather than
// above it — the shape every other app has — which only the page can do. So
// the page renders this same component itself and the shell stands down.
const OWN_SLAB = ['/docs']
// The form builder draws its own 60px band (back · name · publish state · save
// state · Preview · Publish) in the form's own colours, with the section
// switcher floating over the canvas — a second masthead above it would only
// repeat the form's name. The Forms app's own pages (Responses, Templates…)
// keep theirs.
const isFormBuilder = isFormBuilderPath

/** On the phone the band's title is Syne 30; a long one steps down to fit the
 *  band, as far as 20, rather than cutting with an ellipsis. */
function useFitTitle(on: boolean, key: string) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const h = ref.current
    if (!on || !h) return
    const fit = () => {
      h.style.removeProperty('--ph-title-size')
      const t = h.querySelector<HTMLElement>('[data-ph-picker] > span') ?? h
      for (let px = 28; px >= 20 && t.scrollWidth > t.clientWidth; px -= 2) h.style.setProperty('--ph-title-size', `${px}px`)
    }
    // Again once the band's font lands (it may not have started loading yet),
    // when the title changes (the picker's chevron arrives with access), and
    // whenever the room changes (the summary arriving takes some of the line).
    fit()
    void document.fonts?.ready.then(fit)
    document.fonts?.addEventListener('loadingdone', fit)
    const mo = new MutationObserver(fit)
    mo.observe(h, { childList: true, subtree: true, characterData: true })
    const ro = new ResizeObserver(() => fit())
    if (h.parentElement) ro.observe(h.parentElement)
    const info = h.parentElement?.querySelector('[data-slab-info]')
    if (info) ro.observe(info)
    return () => { ro.disconnect(); mo.disconnect(); document.fonts?.removeEventListener('loadingdone', fit) }
  }, [on, key])
  return ref
}

export default function AppSlab() {
  const pathname = usePathname()
  const inShell = useContext(SlabHost)
  const phone = usePhone()
  const router = useRouter()
  const titleRef = useFitTitle(phone, pathname)
  if (BARE.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  // The phone's Home is the card stack, with its own header.
  if (phone && pathname === '/') return null
  if (inShell && OWN_SLAB.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  // Code draws its own header (the chat pill) inside the page.
  if (pathname === '/code' || pathname.startsWith('/code/')) return null
  if (isFormBuilder(pathname)) return null

  const extra = extraPageFor(pathname)
  const app = appForPath(pathname)
  const page = activePage(app.pages, pathname)
  const title = extra?.title ?? page?.title ?? page?.label ?? app.label
  const sub = extra?.sub ?? page?.description ?? app.blurb
  const action = page?.action

  // On the phone the title is a picker for this app's pages (handoff "Stack +
  // Bar": the only way between an app's pages, so it lists every one).
  const frame = v2FrameFor(pathname, app)
  const pages = phone && !extra ? frame.pages : []
  const picker = pages.length > 1
    ? () => openActionSheet(frame.name, pages.map(p => ({
        label: p.emoji ? `${p.emoji}  ${p.label}` : p.label,
        current: p.href === page?.href,
        onPick: () => { if (p.href !== pathname) router.push(p.href) },
      })))
    : null

  return (
    <div data-app-slab="">
      <div data-slab-text="">
        <span id={TITLE_SLOT} data-slab-slot="" style={{ display: 'contents' }} />
        <h1 ref={titleRef} data-page-title="" data-slab-default="" style={{ fontFamily: FONT_DISPLAY }}>
          {picker ? (
            <button type="button" data-ph-picker="" onClick={picker} aria-haspopup="menu" aria-label={`${title}. Switch page`}>
              <span>{title}</span><PhoneIcon name="chevron-down" size={20} />
            </button>
          ) : title}
        </h1>
        {/* On the phone the slot is the band's summary, so it's there even
            for a page with no description to explain. */}
        {sub || phone ? (
          <span data-slab-info="" tabIndex={0} role="note" aria-label={typeof sub === 'string' ? sub : 'About this page'}>
            <span aria-hidden="true">i</span>
            <span data-slab-subpop="">
              <span id={SUB_SLOT} data-slab-slot="" />
              <span data-page-sub="" data-slab-default="">{sub}</span>
            </span>
          </span>
        ) : null}
      </div>

      {/* The page's own toolbar, in the band rather than in a strip below it. */}
      <span id={TOOLS_SLOT} data-slab-tools="" />


      <div data-slab-actions="">
        <span id={ACTION_SLOT} data-slab-slot="" />
        {action ? (
          <Link href={action.href} data-primary-action="" data-slab-default="" className="hv-btn">
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

/** Renders into the slot the band keeps open for it, from anywhere in the page
 *  below. Mounting one hides the registry default it replaces (CSS, on
 *  `[data-slab-slot]:not(:empty)`), so the two can never both draw. */
function Slot({ id, children }: { id: string; children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  // The slot lives in a sibling subtree, so it exists by the time a page's
  // effects run — but not during its first render.
  useEffect(() => { setHost(document.getElementById(id)) }, [id])
  return host ? createPortal(children, host) : null
}

/** The page's toolbar — tabs, counts, filters, search — inside the band. */
export function SlabTools({ children }: { children: React.ReactNode }) {
  return <Slot id={TOOLS_SLOT}>{children}</Slot>
}

/** The one button on the right of the band, when it needs page state. */
export function SlabAction({ children }: { children: React.ReactNode }) {
  return <Slot id={ACTION_SLOT}>{children}</Slot>
}

/** The title, when the page is one record (a link) rather than a tab: its name
 *  replaces the tab's, with an optional back control before it and the
 *  record's own controls (a ⋯ menu) after it. */
export function SlabTitle({ children, back, after }: { children: React.ReactNode; back?: React.ReactNode; after?: React.ReactNode }) {
  return <Slot id={TITLE_SLOT}>{back}<h1 data-page-title="" style={{ fontFamily: FONT_DISPLAY, maxWidth: 'min(56vw, 760px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</h1>{after}</Slot>
}

/** The subtitle, when it counts something the page is holding. Reached from
 *  the ⓘ, so it costs no height. */
export function SlabSub({ children }: { children: React.ReactNode }) {
  return <Slot id={SUB_SLOT}><span data-page-sub="">{children}</span></Slot>
}

/** True for the shell's own instance, false for one a page renders itself —
 *  the two must never both draw, and only the shell knows which it is. */
const SlabHost = createContext(false)

export function ShellSlab() {
  return <SlabHost.Provider value={true}><AppSlab /></SlabHost.Provider>
}

/** Square controls in the band size themselves inline (IconBtn is 36px and is
 *  used all over the app), so the band hands them its own height at the call
 *  site rather than fighting the inline style from CSS. */
export const SLAB_ICON = { width: 'var(--slab-ctl-h)', height: 'var(--slab-ctl-h)' } as const

const TITLE_SLOT = 'gryd-slab-title'
const ACTION_SLOT = 'gryd-slab-action'
const TOOLS_SLOT = 'gryd-slab-tools'
const SUB_SLOT = 'gryd-slab-sub'
