'use client'

/**
 * Shared primitives for the "2b" portal design language.
 * Source of truth: the design prototype (GRYD Portal.dc.html) — parchment
 * surfaces, 2px ink borders, hard offset shadows (no blur), Bricolage
 * Grotesque display / Public Sans body / Space Mono numbers, green primary.
 * Every redesigned page composes these instead of restating the styles.
 */

import Link from 'next/link'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { BRAND_DOMAIN, BRAND_SVG_MARKUP, FULL_BLEED_MARKS, MARK_TILE_BG, usesRemoteMark } from './brand-marks'
import { clampPopoverDx } from './popover-clamp'
import { enterPopover, isPopoverCloseKey } from './popover-focus'
import { useDS } from './v2/ds-context'
import { holdOverlay } from '@/lib/phone/ui-store'
import { usePhone } from '@/lib/phone/use-phone'
import { createPortal } from 'react-dom'

// ── fonts ──
// Read through the design system's tokens so the v1/v2 switch (globals-v2.css)
// can re-face every page; the fallbacks are the v1 values, unchanged.
export const FONT_DISPLAY = "var(--font-display, 'Bricolage Grotesque', sans-serif)"
export const FONT_BODY = "var(--font-body, 'Public Sans', system-ui, sans-serif)"
export const FONT_MONO = "'Space Mono', ui-monospace, monospace"

// ── agent identity ──
export const AGENT_COLORS: Record<string, string> = {
  alf: 'var(--ava-alf)', alfred: 'var(--ava-alf)',
  claw: 'var(--ava-claw)', main: 'var(--ava-claw)',
  penny: 'var(--ava-penny)',
  scout: 'var(--ava-scout)',
  flux: 'var(--ava-flux)',
}
export function agentColor(idOrName?: string | null, fallback?: string | null): string {
  const key = (idOrName || '').trim().toLowerCase()
  return AGENT_COLORS[key] || fallback || 'var(--ava-none)'
}

// The agents' portraits, keyed by engine id. `public/agents/` holds the
// icon-sized (128px: tiles draw at most 40px, so 3x screens included) cuts;
// the Floor uses its own full-size originals.
// Display names differ from ids ("Alf" is `alfred`), so normalize first.
const AVATAR_IDS: Record<string, string> = {
  alf: 'alfred', alfred: 'alfred',
  claw: 'claw', main: 'claw',
  penny: 'penny',
  scout: 'scout',
}
/** Portrait URL for an agent, or null when it hasn't got one yet. */
export function agentAvatar(idOrName?: string | null): string | null {
  const id = AVATAR_IDS[(idOrName || '').trim().toLowerCase()]
  return id ? `/agents/${id}.png` : null
}

/** The agent's portrait in a rounded square with an ink border — the one place
 *  every surface gets its agent icon from, so a portrait added here shows up in
 *  the rail, Home, Flows, Memory, the palette and the rest at once. Falls back
 *  to the colored initial for an agent with no portrait (and if the image
 *  itself fails to load, so a missing file degrades instead of showing a gap). */
export function AgentTile({ name, color, size = 28, radius, border = 2, borderColor = 'var(--ink)', title, dim, presence, presenceTitle, onClick, style }: {
  name: string; color?: string; size?: number; radius?: number; border?: number
  /** Border colour — defaults to the ink outline; the Agents roster passes a
   *  lighter token for inactive rows so only the current agent reads as dark. */
  borderColor?: string
  title?: string; dim?: boolean
  /** Presence sits on the avatar's corner in the prototype, not beside the
   *  name: a 10px dot ringed 2px in --side so it reads as a cutout of the rail. */
  presence?: 'live' | 'idle' | 'off'
  presenceTitle?: string
  onClick?: (e: React.MouseEvent) => void; style?: React.CSSProperties
}) {
  const [broken, setBroken] = useState(false)
  const src = broken ? null : agentAvatar(name)
  const tile = (
    <span title={presence ? undefined : (title || name)} onClick={presence ? undefined : onClick} style={{
      width: size, height: size, borderRadius: radius ?? Math.round(size * 0.32),
      background: color || agentColor(name), color: 'var(--on-fill)', fontWeight: 800,
      fontSize: Math.round(size * 0.43), display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `${border}px solid ${borderColor}`, flex: 'none', cursor: onClick ? 'pointer' : undefined,
      opacity: dim ? 0.5 : 1, boxSizing: 'border-box', overflow: 'hidden', ...(presence ? {} : style),
    }}>
      {src
        ? <img
            src={src}
            alt=""
            width={size}
            height={size}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              // Pixel art: keep the pixels crisp instead of letting the browser
              // smear them when it scales a 256px portrait down to 20-28px.
              imageRendering: 'pixelated',
            }}
            onError={() => setBroken(true)}
          />
        : (name || '?').charAt(0).toUpperCase()}
    </span>
  )
  if (!presence) return tile
  return (
    <span title={title || name} onClick={onClick} style={{
      position: 'relative', display: 'inline-flex', flex: 'none',
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}>
      {tile}
      <span title={presenceTitle} style={{
        position: 'absolute', right: -2, bottom: -2, width: 10, height: 10,
        borderRadius: '50%', boxSizing: 'border-box',
        border: '2px solid var(--side)',
        background: presence === 'live' ? 'var(--grn)' : presence === 'idle' ? 'var(--amb)' : 'var(--mut3)',
      }} />
    </span>
  )
}

// ── integration monogram tiles (app pastels, always ink-bordered) ──
export const INTEG_TILES: Record<string, [string, string, string]> = {
  // name → [monogram, tint bg token, text-on-tint token]. Tints resolve through
  // the semantic families so a pale tile darkens with the theme instead of
  // glaring on a dark card (HANDOFF: pale tiles are accent pops, not neutrals).
  Claude: ['A\\', 'var(--pur-bg)', 'var(--pur)'],
  // GRYD Code's two engines, as the design draws them: CL and CO monograms.
  'Claude Code': ['CL', 'var(--card)', 'var(--tx)'],
  Codex: ['CO', 'var(--card)', 'var(--tx)'],
  Slack: ['#', 'var(--blu-bg)', 'var(--blu)'],
  Gmail: ['M', 'var(--red-bg)', 'var(--red-tx)'],
  Google: ['G', 'var(--grn-bg)', 'var(--grn-tx)'],
  'Google Drive': ['D', 'var(--grn-bg)', 'var(--grn-tx)'],
  'Google Calendar': ['C', 'var(--amb-bg)', 'var(--amb-tx)'],
  'Google Docs': ['Do', 'var(--blu-bg)', 'var(--blu-tx)'],
  'Google Sheets': ['Sh', 'var(--grn-bg)', 'var(--grn-tx)'],
  Calendar: ['◷', 'var(--grn-bg)', 'var(--grn-tx)'],
  HubSpot: ['H', 'var(--red-bg)', 'var(--red-tx)'],
  Fillout: ['Fi', 'var(--pur-bg)', 'var(--pur)'],
  Jira: ['J', 'var(--blu-bg)', 'var(--pur)'],
  Tempo: ['T', 'var(--amb-bg)', 'var(--amb-tx)'],
  Confluence: ['C', 'var(--grn-bg)', 'var(--grn-tx)'],
  QuickBooks: ['Q', 'var(--grn-bg)', 'var(--grn-tx)'],
  Apify: ['Ap', 'var(--amb-bg)', 'var(--amb-tx)'],
  Brave: ['B', 'var(--amb-bg)', 'var(--amb-tx)'],
  Duffel: ['Du', 'var(--blu-bg)', 'var(--blu)'],
  FlightAware: ['Fa', 'var(--blu-bg)', 'var(--blu)'],
  Tweek: ['Tw', 'var(--pur-bg)', 'var(--pur)'],
  LinkedIn: ['in', 'var(--blu-bg)', 'var(--blu)'],
  YouTube: ['Yt', 'var(--red-bg)', 'var(--red-tx)'],
  Sendblue: ['Sb', 'var(--blu-bg)', 'var(--blu)'],
  iMessage: ['◍', 'var(--grn-bg)', 'var(--grn-tx)'],
  Superhuman: ['Su', 'var(--red-bg)', 'var(--red-tx)'],
  'Atlassian Rovo': ['R', 'var(--pur-bg)', 'var(--pur)'],
  GitHub: ['Gh', 'var(--neu-bg)', 'var(--tx)'],
  Photos: ['Ph', 'var(--grn-bg)', 'var(--grn-tx)'],
  'Apple Home': ['⌂', 'var(--amb-bg)', 'var(--amb-tx)'],
  AI: ['✦', 'var(--amb-bg)', 'var(--amb-tx)'],
  Code: ['‹›', 'var(--pur-bg)', 'var(--pur)'],
  Web: ['⌕', 'var(--neu-bg)', 'var(--mut)'],
  Webhook: ['↗', 'var(--neu-bg)', 'var(--mut)'],
}
export function integTile(name: string): [string, string, string] {
  if (INTEG_TILES[name]) return INTEG_TILES[name]
  // deterministic pastel for unknown apps
  const pastels: [string, string][] = [['var(--blu-bg)', 'var(--blu)'], ['var(--grn-bg)', 'var(--grn-tx)'], ['var(--amb-bg)', 'var(--amb-tx)'], ['var(--red-bg)', 'var(--red-tx)'], ['var(--pur-bg)', 'var(--pur)'], ['var(--blu-bg)', 'var(--blu-tx)']]
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0
  const [bg, fg] = pastels[Math.abs(h) % pastels.length]
  return [name.slice(0, 2).replace(/^./, c => c.toUpperCase()), bg, fg]
}
// ── real app icons ──
// real brand marks, not invented monograms. Two tiers —
// (1) canonical brand SVG paths for the apps we show everywhere (kept
// crisp at any size, no network dependency), (2) Google's S2 favicon
// CDN (a live, well-cached, no-asset-shipping source already used
// elsewhere in this codebase) for everything else by real domain. Never
// fabricate a mark — an app with no entry here falls back to the plain
// monogram tile, which is an honest "we don't have a logo for this one"
// state, not a pretend brand.

/** Real icon content for an app name — an existing brand SVG, a live favicon
 *  fetch, or null if we genuinely have no source (caller should fall back to
 *  a plain monogram rather than invent a logo). Sized to fill its box. */
export function AppIconGlyph({ name, size = 20, onImgError, onImgLoad }: { name: string; size?: number; onImgError?: () => void; onImgLoad?: () => void }): React.ReactNode | null {
  const key = name.trim().toLowerCase()
  // The bundled marks live in brand-marks.ts as MARKUP, so the rich-text
  // editor's token chip — an HTML string — draws the same icon this does.
  const bundled = BRAND_SVG_MARKUP[key]
  if (bundled) return <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: bundled(size) }} />
  if (key === 'plan') return <img src="/app-icon.png" alt="Plan" width={size} height={size} style={{ borderRadius: Math.round(size * 0.2), display: 'block' }} />
  const domain = BRAND_DOMAIN[key]
  if (domain) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={name} width={size} height={size}
        style={{ borderRadius: Math.round(size * 0.2), display: 'block' }}
        onError={e => { e.currentTarget.style.display = 'none'; onImgError?.() }}
        onLoad={() => onImgLoad?.()}
      />
    )
  }
  return null
}

/** True when this app's icon is a network fetch rather than a bundled mark —
 *  i.e. the only case that can hang. */
const usesRemoteIcon = usesRemoteMark

/** Small app tile (default 20px, as in flow steps / skill footers / integration
 *  cards): a real brand icon when we have one, else the honest monogram
 *  fallback — never an invented logo. */
export function MonoTile({ app, size = 20, title }: { app: string; size?: number; title?: string }) {
  const [mono, bg, fg] = integTile(app)
  // Favicon-CDN images can fail (offline, blocked, 404) — fall back to the
  // honest monogram tile instead of a blank white square (DS §2 companyIcon).
  const [imgFailed, setImgFailed] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  // A blocked network HANGS the request rather than failing it, so `onError`
  // never fires and the tile stays blank for good — which is what a firewalled
  // or offline browser sees. Give the fetch a moment, then draw the monogram we
  // already have. Only remote icons get the timer: a bundled SVG never loads,
  // and timing one out would replace a perfectly good mark with a letter.
  const remote = usesRemoteIcon(app)
  React.useEffect(() => {
    if (!remote || loaded || imgFailed) return
    const t = setTimeout(() => setImgFailed(true), 2500)
    return () => clearTimeout(t)
  }, [remote, loaded, imgFailed])
  const bleed = FULL_BLEED_MARKS.has(app.trim().toLowerCase())
  const real = imgFailed ? null : AppIconGlyph({
    name: app, size: bleed ? size : Math.round(size * 0.72),
    onImgError: () => setImgFailed(true), onImgLoad: () => setLoaded(true),
  })
  // A remote favicon paints nothing until it arrives, so the monogram stays
  // UNDER it rather than being swapped for it — DS §2's "first letter, then the
  // favicon layered on top". Swapping left the tile an empty white square for
  // the whole flight (forever on a network that hangs instead of erroring).
  const markPainted = real != null && (!remote || loaded)
  return (
    <span title={title || app} data-tile={app} style={{
      width: size, height: size, borderRadius: Math.max(5, Math.round(size * 0.3)), background: markPainted ? MARK_TILE_BG : bg,
      border: '1.3px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45), fontWeight: 800, color: fg, flex: 'none', boxSizing: 'border-box', overflow: 'hidden',
      position: 'relative',
    }}>
      {!markPainted && mono}
      {real && (
        <span style={{
          position: markPainted ? 'static' : 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{real}</span>
      )}
    </span>
  )
}

// ── icons (stroke path set from the prototype) ──
const IC: Record<string, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.7V21h14V9.7', 'M9.5 21v-6h5v6'],
  bolt: ['M13 2 3 14h9l-1 8 10-12h-9l1-8'],
  rocket: ['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2', 'M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2Z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'],
  mail: ['M3 6.5h18v11H3z', 'm3 7 9 6.5L21 7'],
  ban: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'm5.6 5.6 12.8 12.8'],
  alert: ['M12 3.8 2.6 20h18.8L12 3.8Z', 'M12 10v4.2', 'M12 17.3h.01'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M21 21l-4.35-4.35'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
  layers: ['M12 2 2 7l10 5 10-5-10-5', 'M2 12l10 5 10-5', 'M2 17l10 5 10-5'],
  database: ['M12 2C7 2 3 3.3 3 5s4 3 9 3 9-1.3 9-3-4-3-9-3Z', 'M3 5v7c0 1.7 4 3 9 3s9-1.3 9-3V5', 'M3 12v7c0 1.7 4 3 9 3s9-1.3 9-3v-7'],
  plug: ['M9 2v6', 'M15 2v6', 'M6 8h12v3a6 6 0 0 1-12 0V8Z', 'M12 17v5'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  play: ['M7 4l13 8-13 8V4Z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z'],
  branch: ['M6 15V3', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 9a9 9 0 0 1-9 9'],
  reply: ['M9 14 4 9l5-5', 'M20 20v-7a4 4 0 0 0-4-4H4'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z'],
  clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z'],
  code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
  grid: ['M3 3h7v7H3Z', 'M14 3h7v7h-7Z', 'M14 14h7v7h-7Z', 'M3 14h7v7H3Z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  help: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  thumb: ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  check: ['M22 11.1V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  shuffle: ['M16 3h5v5', 'M4 20 21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  sparkle: ['M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z', 'M19 15l.6 2 .4 2 2 .4-2 .6-.4 2-.6-2-2-.6 2-.4z'],
  filter: ['M3 5h18l-7 8.2V20l-4-2.3v-4.5z'],
  filterX: ['M3 5h18l-7 8.2V20l-4-2.3v-4.5z', 'm16.5 15.5 5 5', 'm21.5 15.5-5 5'],
  // Department-rail marks. Outreach is a target (Scout aims), Finance a
  // currency column, Reports a bar chart — the three the icon set was missing.
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z', 'M12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z'],
  finance: ['M12 2.8v18.4', 'M16.4 6.6H9.8a2.9 2.9 0 0 0 0 5.8h4.4a2.9 2.9 0 0 1 0 5.8H7.2'],
  chart: ['M4 20h16', 'M7 20v-7', 'M12 20V6', 'M17 20v-4'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  // Flow action marks. These six shipped as raw emoji through Gly's fallback,
  // so they sat at a different weight and baseline than the stroke icons beside
  // them in the same row (re-run next to a status glyph, delete next to a gear).
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.55-6.06', 'M20.5 3.6v5.2h-5.2'],
  importTray: ['M12 3.2v9.6', 'm8.2 9.4 3.8 3.8 3.8-3.8', 'M4.4 15v3.4A1.6 1.6 0 0 0 6 20h12a1.6 1.6 0 0 0 1.6-1.6V15'],
  trash: ['M4 6.6h16', 'M9.6 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.7', 'M6.6 6.6 7.5 19a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-12.4', 'M10.5 10.4v6', 'M13.5 10.4v6'],
  flask: ['M9.4 3.2h5.2', 'M10.6 3.2v6.1L5.7 17.6a2 2 0 0 0 1.7 3h9.2a2 2 0 0 0 1.7-3l-4.9-8.3V3.2', 'M8.1 14.6h7.8'],
  power: ['M12 3.6v8', 'M7.4 6.4a7.6 7.6 0 1 0 9.2 0'],
  stop: ['M6.6 6.6h10.8v10.8H6.6z'],
  copy: ['M9.2 9.2h10.6v10.6H9.2z', 'M15 5.9H5.7A1.5 1.5 0 0 0 4.2 7.4v9.3'],
  // Lucide image and git-pull-request (the Bot log's proof links).
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'],
  pullRequest: ['M15 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M13 6h3a2 2 0 0 1 2 2v7', 'M6 9v12'],
}
export function Icon({ name, size = 18, color = 'currentColor', sw = 2.2, style }: {
  name: keyof typeof IC | string; size?: number; color?: string; sw?: number; style?: React.CSSProperties
}) {
  const paths = IC[name] || IC.help
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block', ...style }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
/** Functional-glyph mapper: renders known emoji as line icons (no decorative emoji). */
const GLY: Record<string, string> = { '🚀': 'rocket', '⚡': 'bolt', '▷': 'play', '▶': 'play', '◈': 'branch', '⛔': 'shield', '↩': 'reply', '↻': 'refresh', '👍': 'thumb', '💬': 'message', '📅': 'calendar', '❓': 'help', '🛡': 'shield', '📋': 'clipboard', '▦': 'grid', '🔗': 'link', '{ }': 'code', '🧩': 'layers', '🧠': 'database', '🔀': 'branch', '🩹': 'edit', '🪪': 'user', '✅': 'check', '⚙': 'gear', '⚙️': 'gear', '📥': 'importTray', '🗑': 'trash', '🗑️': 'trash', '🧪': 'flask', '■': 'stop', '✎': 'edit' }
export function Gly({ g, size = 13, color = 'var(--tx)' }: { g: string; size?: number; color?: string }) {
  return GLY[g] ? <Icon name={GLY[g]} size={size} color={color} /> : <>{g}</>
}

/** A button label written as "▶ Test" or "↻ Re-run": the leading glyph drawn
 *  from the icon set, the rest as words. Labels are authored as plain strings
 *  in a dozen places; this keeps that convenience without shipping a raw emoji
 *  next to the stroke icons it sits beside, at whatever weight and baseline the
 *  system emoji font decides. An unmapped glyph falls through unchanged. */
export function GlyphLabel({ label, size = 12 }: { label: string; size?: number }) {
  const m = /^(\S+)\s+(.+)$/.exec(label)
  if (!m || !GLY[m[1]]) return <>{label}</>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon name={GLY[m[1]]} size={size} color="currentColor" />
      {m[2]}
    </span>
  )
}

/** Per-glyph optical nudge, in ems, for emoji drawn inside a tile.
 *
 *  Emoji carry their own padding inside the font's em box, and it is not
 *  symmetric — a flex `center` centres that box, not the mark someone sees. The
 *  tray sits high and left in its box, the handshake low; both read as
 *  mis-centred against neighbours that happen to be drawn centred. Correcting
 *  by eye is what icon sets do for asymmetric marks; there is no metric to
 *  compute it from. Only glyphs that visibly need it appear here. */
const EMOJI_NUDGE: Record<string, [number, number]> = {
  '📥': [0.045, 0.03], '📤': [0.045, 0.03], '🤝': [0, -0.035], '🎬': [0.02, 0], '📎': [0, -0.02],
}
/** An emoji sized and optically centred inside a tile. Use anywhere an emoji is
 *  a picture rather than text — folder tiles, flow marks, section heads. */
export function EmojiMark({ glyph, size = 15, style }: { glyph: string; size?: number; style?: React.CSSProperties }) {
  const [dx, dy] = EMOJI_NUDGE[glyph] ?? [0, 0]
  return (
    <span aria-hidden style={{
      fontSize: size, lineHeight: 1, display: 'block',
      transform: dx || dy ? `translate(${dx}em, ${dy}em)` : undefined,
      ...style,
    }}>{glyph}</span>
  )
}

// ── core style objects ──
export const cardS: React.CSSProperties = {
  background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: 18,
  boxShadow: '4px 5px 0 var(--ink), var(--glow-extra)', padding: '18px 20px',
}
export const inputS: React.CSSProperties = {
  background: 'var(--input)', border: '2px solid var(--ink)', borderRadius: 10,
  padding: '10px 13px', fontSize: 14, color: 'var(--tx)', fontFamily: FONT_BODY,
  outline: 'none', width: '100%', boxSizing: 'border-box',
}
/** Spread onto an input holding a credential (API key, token, secret).
 *  Deliberately NOT type="password": password-type fields make Chrome/Safari
 *  offer to save the "login" on every keyring save. A
 *  plain text input masked via CSS (`secretMaskS`) looks identical but is
 *  invisible to browser credential capture; the data-* attrs opt out of
 *  1Password/LastPass/Bitwarden/Dashlane as well. */
export const secretInputProps = {
  type: 'text',
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': '',
  'data-form-type': 'other',
} as const
export const secretMaskS = { WebkitTextSecurity: 'disc' } as React.CSSProperties

export const monoChipS: React.CSSProperties = {
  fontFamily: FONT_MONO, background: 'var(--line)', border: '1px solid var(--line2)',
  borderRadius: 5, padding: '1px 6px', fontSize: '0.85em', color: 'var(--tx)', whiteSpace: 'nowrap',
}

// ── text/heading primitives ──
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 800, color: 'var(--mut)', margin: '0 0 12px', ...style }}>{children}</div>
}
export function H1({ children, size = 32, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  return <h1 style={{ margin: 0, fontSize: size, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)', fontFamily: FONT_DISPLAY, ...style }}>{children}</h1>
}
/** Sits in the app masthead when the viewer holds `view` but not `edit` in that
 *  area, so the missing Save/Add buttons read as a permission rather than as a
 *  page that failed to load. Permissions themselves are enforced server-side. */
export function ViewOnlyPill({ title = 'You have view-only access to this section' }: { title?: string }) {
  return (
    <span title={title} style={{
      padding: '3px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 800,
      border: '1.5px solid var(--ink)', background: 'var(--paper)', color: 'var(--mut)',
      whiteSpace: 'nowrap', flex: 'none', letterSpacing: '.02em',
    }}>View only</span>
  )
}

// ── controls ──
export function Btn({ children, solid, danger, onClick, disabled, title, style, testId }: {
  children: React.ReactNode; solid?: boolean; danger?: boolean; onClick?: (e: React.MouseEvent) => void
  disabled?: boolean; title?: string; style?: React.CSSProperties
  /** `data-testid` on the button itself (the harnesses read `aria-disabled` off it). */
  testId?: string
}) {
  return (
    // Dropping `onClick` makes a disabled button genuinely inert, but on its
    // own that is invisible: with no `aria-disabled` a screen reader announces
    // it as live and a test harness reads it as enabled. And with no tabIndex
    // the whole control was mouse-only — the same gap the Seg strip had, in the
    // component that draws most of the portal's buttons.
    <span
      role="button"
      data-testid={testId}
      data-ui-btn=""
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      title={title}
      className={disabled ? undefined : 'hv-btn'}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick?.(e as unknown as React.MouseEvent)
      }}
      style={{
      padding: '8px 16px',
      background: danger ? 'var(--red-bg)' : solid ? 'var(--grn)' : 'var(--card)',
      color: danger ? 'var(--red-tx)' : solid ? 'var(--ongo)' : 'var(--tx)',
      border: '2px solid var(--ink)', borderRadius: 10, fontSize: 13, fontWeight: 800,
      boxShadow: '2px 2px 0 var(--ink), var(--glow-extra)', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.55 : 1, display: 'inline-flex', alignItems: 'center',
      // The prototype's buttons carry no flex gap — their glyph is part of the
      // label string. Ours added 7px, making every button wider than the design
      // (measured: + New flow 118px vs 106px). Callers passing separate icon +
      // text children set their own gap via style.

      whiteSpace: 'nowrap', userSelect: 'none', ...style,
    }}>{children}</span>
  )
}
/** Square icon button — the toolbar sibling of `Btn`.
 *
 *  Same 2px ink border, same hard offset shadow and the SAME 36px box height, so
 *  an icon control, a search box and a labelled button sitting in one toolbar row
 *  line up instead of each being a pixel or two off. `tone="danger"` is the pale
 *  red destructive variant (clear filters). `badge` prints a count in the corner
 *  — a filter icon that hides four active filters has to say four. */
export function IconBtn({ children, title, onClick, active, tone = 'plain', badge, style }: {
  children: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void
  active?: boolean; tone?: 'plain' | 'danger'; badge?: number; style?: React.CSSProperties
}) {
  const danger = tone === 'danger'
  return (
    <span
      role="button" tabIndex={0} title={title} aria-label={title} className="hv-btn"
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent) } }}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, boxSizing: 'border-box', borderRadius: 10, flex: 'none',
        border: '2px solid var(--ink)',
        boxShadow: active ? 'none' : '2px 2px 0 var(--ink), var(--glow-extra)',
        background: active ? 'var(--inkbg)' : danger ? 'var(--red-bg)' : 'var(--card)',
        color: active ? 'var(--oninkbg)' : danger ? 'var(--red-tx)' : 'var(--tx)',
        transform: active ? 'translate(2px, 2px)' : undefined,
        transition: 'transform var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out), box-shadow var(--dur-hover) var(--ease-out)',
        cursor: 'pointer', userSelect: 'none', ...style,
      }}>
      {children}
      {badge ? (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 17, height: 17, padding: '0 4px',
          borderRadius: 9, boxSizing: 'border-box', border: '1.5px solid var(--ink)',
          background: 'var(--grn)', color: 'var(--ongo)', fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO,
        }}>{badge}</span>
      ) : null}
    </span>
  )
}

/** Anchored dropdown panel with a click-anywhere-else scrim. The caller wraps it
 *  in a `position: relative` box; `align` picks which edge it hangs from. */
export function Popover({ open, onClose, children, width = 320, align = 'right', top = 44 }: {
  open: boolean; onClose: () => void; children: React.ReactNode
  width?: number; align?: 'left' | 'right'; top?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // The panel is anchored to its toolbar button, which on a narrow (phone)
  // viewport can sit far enough from the screen edge that a right-anchored
  // panel overflows off-screen. Measure the natural position with layout
  // metrics (offsetParent/offsetWidth — transform-independent, so the scale-in
  // animation doesn't skew them) and clamp it inside an 8px gutter. The shift
  // rides a CSS var that the keyframe multiplies in, so it survives the
  // animation's `both` fill instead of being overwritten by it.
  const [dx, setDx] = useState(0)
  useLayoutEffect(() => {
    if (!open) { setDx(0); return }
    const clamp = () => {
      const el = panelRef.current
      const parent = el?.offsetParent as HTMLElement | null
      if (!el || !parent || typeof window === 'undefined') return
      const naturalLeft = parent.getBoundingClientRect().left + el.offsetLeft
      setDx(clampPopoverDx(naturalLeft, el.offsetWidth, window.innerWidth))
    }
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [open, width, align, top])
  // Focus goes into the panel on open and back to the opener on close;
  // Escape closes (popover-focus.ts).
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = panelRef.current
    if (!open || !el) return
    const restore = enterPopover(el, document.activeElement as HTMLElement | null, document)
    const onKey = (e: KeyboardEvent) => { if (isPopoverCloseKey(e)) { e.preventDefault(); closeRef.current() } }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); restore() }
  }, [open])
  if (!open) return null
  return (
    <>
      {/* stopPropagation: a click-to-open parent (a table row) must not reopen it */}
      <div onClick={e => { e.stopPropagation(); onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()} className="popover-panel" style={{
        outline: 'none',
        position: 'absolute', top, zIndex: 41, width, maxWidth: '90vw',
        ...(align === 'right' ? { right: 0 } : { left: 0 }),
        ['--pop-dx' as string]: `${dx}px`,
        transformOrigin: align === 'right' ? 'top right' : 'top left',
        background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: 14,
        boxShadow: '4px 5px 0 var(--ink), var(--glow-extra)', padding: '14px 15px',
        display: 'flex', flexDirection: 'column', gap: 13,
      } as React.CSSProperties}>{children}</div>
    </>
  )
}

/** One labelled control inside a filter popover. */
export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.08em', fontWeight: 800, color: 'var(--mut)' }}>{label.toUpperCase()}</span>
      {children}
    </label>
  )
}

/** Select / number input inside a filter popover — one shape for both tabs. */
export const filterFieldS: React.CSSProperties = {
  ...inputS, padding: '7px 10px', fontSize: 12.5, borderRadius: 9, borderWidth: 1.5,
}

/** Small bordered tag/pill (prototype `tg`). */
export function Tag({ children, bg = 'var(--card)', fg = 'var(--tx)', round, small, style, onClick, title }: {
  children: React.ReactNode; bg?: string; fg?: string; round?: boolean
  /** The prototype has two chip scales: 8px radius at 4px/10px (Flows' status
   *  pills) and a tighter 7px at 3px/9px on the Alf pages. */
  small?: boolean
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void; title?: string
}) {
  return (
    <span title={title} className={onClick ? 'hv-chip' : undefined} onClick={onClick} style={{
      padding: small ? '3px 9px' : '4px 10px', background: bg, color: fg, border: '1.5px solid var(--ink)',
      borderRadius: round ? 20 : small ? 7 : 8, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : undefined, display: 'inline-flex', alignItems: 'center', ...style,
    }}>{children}</span>
  )
}
/** Status pill shorthands (green/amber/red/neutral count pills). */
export const pillGreen = { bg: 'var(--grn-bg)', fg: 'var(--grn-tx)' }
export const pillAmber = { bg: 'var(--amb-bg)', fg: 'var(--amb-tx)' }
export const pillRed = { bg: 'var(--red-bg)', fg: 'var(--red-tx)' }
/** For something listed but not active — an offline device, a paused row. It has
 *  to read as clearly NOT green: the whole point is that it is not participating. */
export const pillMuted = { bg: 'var(--neu-bg)', fg: 'var(--mut)' }

/** Segmented control. v2 draws the design system's Seg: a card with the
 *  current option on a gold thumb and one cut corner. v1 keeps the prototype's
 *  2px ink strip with an ink-filled active option, in two scales: `sm`
 *  (default) = the compact caps switch (BUILD|RUNS lens, 10.5px letterspaced,
 *  paper inactive); `md` = the page-tab `paneBtn` (12.5px, card inactive, ink
 *  text) used for section tabs like Contacts|Companies. */
export function Seg<T extends string>(props: SegProps<T>) {
  return useDS() === 'v2' ? <SegV2 {...props} /> : <SegV1 {...props} />
}

interface SegProps<T extends string> {
  value: T; onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; activeBg?: string }[]
  width?: number | string; shadow?: boolean; size?: 'sm' | 'md'
  /** Horizontal option padding. The prototype runs 14px on most strips and 13px
   *  on Memory's segment filter — a real 1px difference, not a rounding one. */
  padX?: number
  /** Per-instance option overrides. The prototype's segmented controls are not
   *  one component: Penny's period control is 7px/16px at 13px where Memory's
   *  filter is 6px/13px at 12.5px. Rather than grow a prop per dimension, a
   *  call site that has measured its counterpart passes it here. */
  optionStyle?: React.CSSProperties
  style?: React.CSSProperties
}

/** The design system's Seg (control variant), as the LinkedIn inbox already
 *  draws it: the thumb is the current option's own fill rather than a sliding
 *  layer, so it can never be measured wrong after a resize or a font swap. */
function SegV2<T extends string>({ value, onChange, options, width, shadow = true, size = 'sm', padX = 14, optionStyle, style }: SegProps<T>) {
  const sm = size === 'sm'
  return (
    <div role="group" data-ui-seg="" style={{
      display: 'inline-flex', alignItems: 'stretch', padding: 3, flex: 'none', boxSizing: 'border-box',
      background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: '10px 10px 10px var(--r-cut, 2px)',
      boxShadow: shadow ? 'var(--el-1)' : 'none', width, ...style,
    }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} data-on={on ? '1' : undefined}
            onClick={e => { e.stopPropagation(); onChange(o.value) }}
            style={{
              flex: width ? 1 : 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: sm ? `4px ${padX - 3}px` : `6px ${padX}px`, boxSizing: 'border-box', borderRadius: 7,
              fontFamily: 'var(--font-body)', fontSize: sm ? 11.5 : 12.5, fontWeight: on ? 800 : sm ? 600 : 700,
              whiteSpace: 'nowrap', cursor: 'pointer',
              color: on ? 'var(--on-accent)' : sm ? 'var(--mut)' : 'var(--tx)',
              background: on ? (o.activeBg || 'var(--gold)') : 'transparent',
              border: `1.5px solid ${on ? 'var(--ink)' : 'transparent'}`,
              boxShadow: on ? '1px 1px 0 var(--ink)' : 'none',
              transition: 'background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
              ...optionStyle,
            }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function SegV1<T extends string>({ value, onChange, options, width, shadow = true, size = 'sm', padX = 14, optionStyle, style }: SegProps<T>) {
  const md = size === 'md'
  return (
    <div className="seg-wrap" style={{ display: 'flex', border: '2px solid var(--ink)', borderRadius: 10, overflow: 'hidden', boxShadow: shadow ? '2px 2px 0 var(--ink), var(--glow-extra)' : 'none', width, flex: 'none', ...style }}>
      {options.map(o => {
        const on = o.value === value
        return (
          // A tab strip is a control, so it answers to a keyboard. These were
          // bare `span`s with an onClick: reachable by mouse only, invisible to
          // a screen reader, and the pattern is copied across every page in the
          // portal — so fixing it here fixes all of them.
          <span key={o.value} data-on={on ? '1' : undefined}
            role="button" tabIndex={0} aria-pressed={on}
            onClick={e => { e.stopPropagation(); onChange(o.value) }}
            onKeyDown={e => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault(); e.stopPropagation(); onChange(o.value)
            }}
            style={{
            // The prototype's segments are 12.5px at 6px/14px with no tracking,
            // and carry weight — 800 selected, 700 not. Ours ran 10.5px/800 with
            // .06em on every unselected option, which read as a caption strip
            // rather than a control.
            flex: 1, textAlign: 'center', padding: `6px ${padX}px`, fontSize: 12.5, fontWeight: on ? 800 : 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
            background: on ? (o.activeBg || 'var(--inkbg)') : 'var(--card)',
            color: on ? (o.activeBg ? 'var(--on-fill)' : 'var(--oninkbg)') : md ? 'var(--tx)' : 'var(--mut)',
            transition: 'background var(--dur-control) var(--ease-out), color var(--dur-control) var(--ease-out)',
            // The prototype's segment options carry no flex gap — a glyph is
            // part of the label. Ours added 6px to every option on every page.
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...optionStyle,
          }}>{o.label}</span>
        )
      })}
    </div>
  )
}

/** Underlined tab strip — the prototype's *other* segmented pattern, distinct
 *  from Seg. The strip itself carries no border, radius, fill or shadow; only
 *  the selected tab is drawn, as a --sel pill with a 2px ink underline. Used
 *  where tabs sit directly on a card (Home's personality editor) rather than
 *  reading as a control. */
export function Tabs<T extends string>({ value, onChange, options, style }: {
  value: T; onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', ...style }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <span key={o.value} data-on={on ? '1' : undefined}
            onClick={e => { e.stopPropagation(); onChange(o.value) }}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: on ? 800 : 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              color: on ? 'var(--tx)' : 'var(--mut)',
              background: on ? 'var(--sel)' : 'transparent',
              borderRadius: 9,
              border: on ? '2px solid var(--ink)' : '2px solid transparent',
              boxShadow: on ? '2px 2px 0 var(--ink), var(--glow-extra)' : 'none',
              transition: 'background var(--dur-control) var(--ease-out), color var(--dur-control) var(--ease-out), border-color var(--dur-control) var(--ease-out), box-shadow var(--dur-control) var(--ease-out)',
            }}>{o.label}</span>
        )
      })}
    </div>
  )
}

/** On/off switch for a setting that applies the moment it is flipped. v2
 *  draws the design system's Toggle — a lime pill with a solid ink knob that
 *  squashes as it travels; v1 keeps the prototype's white knob. */
export function Toggle(props: ToggleProps) {
  return useDS() === 'v2' ? <ToggleV2 {...props} /> : <ToggleV1 {...props} />
}

interface ToggleProps {
  on: boolean
  /** Makes it a real switch. Leave it off when a parent row owns the click: it
   *  is then drawn only, since a button inside a button is invalid and one
   *  control should be one tab stop. */
  onClick?: (e: React.MouseEvent) => void
  size?: 'md' | 'sm'
  /** The accessible name, when no visible label names it. */
  title?: string
  disabled?: boolean
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  if (document.documentElement.getAttribute('data-motion') === 'reduced') return true
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function ToggleV2({ on, onClick, size = 'md', title, disabled }: ToggleProps) {
  const [w, h] = size === 'sm' ? [28, 16] : [36, 20]
  const k = h - 6
  const knob = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  // The squash plays on top of a state that has already changed, and never on
  // the first paint — a page full of switches must not wobble as it loads.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (prefersReducedMotion()) return
    knob.current?.animate?.(
      [{ scale: '1 1' }, { scale: '1.5 .7' }, { scale: '.9 1.1' }, { scale: '1 1' }],
      { duration: 300, easing: 'ease-out' },
    )
  }, [on])
  const track: React.CSSProperties = {
    position: 'relative', display: 'inline-block', width: w, height: h, minWidth: w, padding: 0, flex: 'none',
    boxSizing: 'border-box', border: '1.5px solid var(--ink)', borderRadius: 20,
    background: on ? 'var(--lime)' : 'var(--track)', verticalAlign: 'middle',
    transition: 'background-color var(--dur-fast) var(--ease-out)',
  }
  const dot = (
    <span ref={knob} style={{
      position: 'absolute', top: 2, left: 2, width: k, height: k, borderRadius: '50%',
      background: on ? 'var(--on-accent)' : 'var(--ink)',
      transform: on ? `translateX(${w - k - 7}px)` : 'translateX(0)',
      transition: 'transform var(--dur-base) var(--ease-pop)',
    }} />
  )
  if (!onClick) return <span aria-hidden="true" style={track}>{dot}</span>
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={title} title={title}
      disabled={disabled} onClick={onClick}
      style={{ ...track, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      {dot}
    </button>
  )
}

function ToggleV1({ on, onClick, size = 'md' }: ToggleProps) {
  // Measured off the prototype: 34×19 border-box, 11px radius, a 1px ink
  // border and a 13px white knob. Ours was 42×24 content-box with a 2px
  // border — and content-box plus a nominal width let flex squash it to 25px
  // wide in Scout Today's rail, so it rendered as a stub.
  const [w, h, knob, radius] = size === 'sm' ? [26, 15, 10, 8] : [34, 19, 13, 11]
  // The knob slides via transform (GPU, animatable) rather than flipping
  // justifyContent — flex-start/flex-end isn't an interpolable value, so the
  // old version teleported instead of sliding. Travel is the inner width the
  // knob has to move through: both 1px borders and both 1.5px paddings come
  // off, or the knob lands on the far border when on (09-06, "wonky").
  const travel = w - knob - 2 - 3
  return (
    <span className={onClick ? 'hv-chip' : undefined} onClick={onClick}
      {...(onClick ? {
        role: 'switch', 'aria-checked': on, tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault(); onClick(e as unknown as React.MouseEvent)
        },
      } : {})}
      style={{
      width: w, height: h, minWidth: w, borderRadius: radius,
      background: on ? 'var(--grn)' : 'var(--track)',
      border: '1px solid var(--ink)', boxSizing: 'border-box',
      display: 'inline-flex', alignItems: 'center', padding: 1.5,
      flex: 'none', cursor: onClick ? 'pointer' : undefined,
      transition: 'background var(--dur-control) var(--ease-out)',
    }}>
      <span style={{
        width: knob, height: knob, borderRadius: '50%', background: 'var(--on-fill)',
        border: '1px solid var(--ink)', boxSizing: 'border-box', flex: 'none',
        transform: on ? `translateX(${travel}px)` : 'translateX(0)',
        transition: 'transform var(--dur-control) var(--ease-out)',
      }} />
    </span>
  )
}

/** A checkbox, for a choice saved with a form or for picking rows — a setting
 *  that applies the moment it is flipped is a Toggle. v2 draws the design
 *  system's box (2px ink, lime with an ink tick) over a real input, which is
 *  what the keyboard, a screen reader and a wrapping <label> talk to. v1 keeps
 *  the native box, styled as its call site always styled it. */
export function Checkbox({ checked, indeterminate, onChange, title, disabled, size = 18, style }: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  /** The accessible name, when no wrapping <label> names it (table rows). */
  title?: string
  disabled?: boolean
  size?: number
  /** v1 only: the native input's own style, exactly as before v2. */
  style?: React.CSSProperties
}) {
  const v2 = useDS() === 'v2'
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate }, [indeterminate])
  const input = (s: React.CSSProperties, className?: string) => (
    <input ref={ref} type="checkbox" checked={checked} disabled={disabled} title={title} aria-label={title}
      className={className} onChange={e => onChange(e.target.checked)} style={s} />
  )
  if (!v2) return input(style ?? {})
  const on = checked || !!indeterminate
  return (
    <span style={{ position: 'relative', display: 'inline-grid', width: size, height: size, flex: 'none', verticalAlign: 'middle' }}>
      {input({ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }, 'gx-check-input')}
      <span aria-hidden="true" className="gx-check" style={{
        width: size, height: size, boxSizing: 'border-box', border: '2px solid var(--ink)', borderRadius: 5,
        display: 'grid', placeItems: 'center', pointerEvents: 'none', opacity: disabled ? 0.5 : 1,
        background: on ? 'var(--lime)' : 'var(--input)', color: 'var(--on-accent)',
        transition: 'background-color var(--dur-fast) var(--ease-out)',
      }}>
        {indeterminate
          ? <span style={{ width: size * 0.5, height: 2.5, background: 'var(--on-accent)', borderRadius: 2 }} />
          : checked ? <Icon name="check" size={size - 5} sw={3.2} /> : null}
      </span>
    </span>
  )
}

/** Small spinning ring for "showing cached data, quietly revalidating in the
 *  background" — pairs with the page-cache pattern (lib/page-cache.ts): a
 *  page shows this next to its title instead of a full loading skeleton
 *  when it already has cached data to display while the refetch is in
 *  flight. Uses the shared `spin` keyframe (globals.css). */
export function RevalidateDot({ size = 13, title = 'Refreshing…' }: { size?: number; title?: string }) {
  return (
    <span title={title} style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block', flex: 'none',
      border: '2px solid var(--line2)', borderTopColor: 'var(--grn)',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

/** Search box (display style matches prototype; controlled input). */
export function SearchBox({ value, onChange, placeholder, width, grow, style }: {
  value: string; onChange: (v: string) => void; placeholder: string
  width?: number; grow?: boolean; style?: React.CSSProperties
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)',
      border: '2px solid var(--ink)', borderRadius: 10, padding: '8px 13px',
      width, flex: grow ? '1 1 220px' : undefined, minWidth: grow ? 220 : undefined,
      boxShadow: '2px 2px 0 var(--ink), var(--glow-extra)', ...style,
    }}>
      <Icon name="search" size={15} color="var(--mut2)" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0,
        fontSize: 13.5, color: 'var(--tx)', fontFamily: FONT_BODY,
      }} />
    </div>
  )
}

/** Subtle cross-app doc link: ❏ label ↗ with dotted underline → /docs?doc=path */
export function DocRef({ label, doc, style }: { label: string; doc?: string; style?: React.CSSProperties }) {
  return (
    <Link href={`/docs${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`} title="Open in Docs" data-docref="" className="hv-link" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
      color: 'var(--mut2)', cursor: 'pointer', borderBottom: '1px dotted var(--mut3)',
      whiteSpace: 'nowrap', textDecoration: 'none', ...style,
    }}>
      {'❏ ' + label}<span style={{ fontSize: 10 }}>↗</span>
    </Link>
  )
}

// ── modal (centered card, ink overlay, hard shadow; bottom-sheet on mobile) ──
export function Modal({ title, mono, icon, sub, onClose, footer, children, width = 520 }: {
  title: React.ReactNode; mono?: boolean; icon?: React.ReactNode; sub?: React.ReactNode
  onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; width?: number
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  // On the phone the Jump bar steps aside while a dialog is up, and the dialog
  // renders into <body>: opened from inside a sheet it would otherwise ride the
  // sheet's transform off the screen. Desktop keeps it in place, inside its
  // app's frame, so the app's ink still tints it.
  useEffect(() => holdOverlay(), [])
  const phone = usePhone()
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    if (dialog && !dialog.open) dialog.showModal()
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus() }
  }, [phone])

  const dialog = (
    <dialog ref={dialogRef} aria-labelledby={titleId} onKeyDown={e => {
      if (e.key !== 'Tab') return
      const dialog = e.currentTarget
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { e.preventDefault(); dialog.focus(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }} onCancel={e => { e.preventDefault(); onClose() }} onClick={onClose} data-movl="1" className="modal-scrim" style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'var(--scrim)', margin: 0, border: 0, width: '100vw', maxWidth: 'none', height: '100dvh', maxHeight: 'none', boxSizing: 'border-box', color: 'var(--tx)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '64px 20px', overflowY: 'auto',
    }}>
      <div data-mpanel="1" onClick={e => e.stopPropagation()} className="modal-panel" style={{
        width, maxWidth: '100%', background: 'var(--paper)', border: '2px solid var(--ink)',
        borderRadius: 18, boxShadow: '8px 10px 0 var(--ink)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '20px 22px', borderBottom: '2px solid var(--ink)' }}>
          {icon != null && (
            <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--card)', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flex: 'none', fontWeight: 800, color: 'var(--tx)' }}>{icon}</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id={titleId} style={{ fontSize: 21, fontWeight: 800, color: 'var(--tx)', fontFamily: mono ? FONT_MONO : FONT_DISPLAY }}>{title}</div>
            {sub ? <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 2 }}>{sub}</div> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} data-ui-close="" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--card)', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer', flex: 'none', color: 'var(--tx)' }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        {footer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderTop: '2px solid var(--ink)' }}>{footer}</div>
        ) : null}
      </div>
    </dialog>
  )
  return phone && typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog
}

/** Floating confirmation toast — bottom-center, optional Undo. Entrance only,
 *  same constraint as Modal (the caller conditionally renders it, so there's
 *  no node left to run an exit transition on). */
export function Toast({ msg, onUndo }: { msg: string; onUndo?: (() => void) | null }) {
  return (
    <div className="toast-pop" style={{
      position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 80,
      display: 'flex', alignItems: 'center', gap: 13, padding: '11px 17px',
      background: 'var(--inkbg)', color: 'var(--oninkbg)', border: '2px solid var(--ink)',
      borderRadius: 'var(--r-pill)', boxShadow: 'var(--el-4)',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{msg}</span>
      {onUndo && (
        <span role="button" tabIndex={0} onClick={onUndo}
              style={{ fontSize: 12, fontWeight: 800, color: 'var(--blu)', cursor: 'pointer', textDecoration: 'underline' }}>
          Undo
        </span>
      )}
    </div>
  )
}

/** Labeled form field (modal bodies). */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, letterSpacing: '.06em', fontWeight: 800, color: 'var(--mut)' }}>{label.toUpperCase()}</span>
      {children}
    </label>
  )
}

/** Row of agent-access mini chips (colored = has access, muted = not). */
export function AccessRow({ agents, size = 20 }: {
  agents: { name: string; color?: string; on: boolean }[]; size?: number
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {agents.map(a => (
        <span key={a.name} title={a.name} style={{
          width: size, height: size, borderRadius: 6, fontSize: size * 0.48, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: a.on ? (a.color || agentColor(a.name)) : 'var(--paper)',
          color: a.on ? 'var(--on-fill)' : 'var(--mut3)',
          border: a.on ? '1.5px solid var(--ink)' : '1.5px solid var(--line2)',
          boxSizing: 'border-box',
        }}>{a.name.charAt(0).toUpperCase()}</span>
      ))}
    </div>
  )
}

/** Time-ago helper shared by redesigned pages. */
export function timeAgo(iso: string | number | null | undefined): string {
  if (!iso) return 'never'
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (!isFinite(t)) return 'never'
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
