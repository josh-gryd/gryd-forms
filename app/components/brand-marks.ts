// The brand marks, as SVG MARKUP rather than React nodes.
//
// One source, two consumers: `MonoTile`/`AppIconGlyph` render it in React, and
// the rich-text editor's data-token chip — which is built as an HTML STRING so
// backspace treats it as one unit — drops the same markup inline. Before this
// the editor chip could only draw the two-letter monogram, so a Fillout token
// in a message read `Fi` while the step row beside it wore the real Fillout
// mark.
//
// Anything not listed here falls back to the Google favicon CDN by domain, and
// failing that to the honest monogram — never an invented logo.

export function appIconMarkup(name: string, size: number): string | null {
  const key = name.trim().toLowerCase()
  const mark = BRAND_SVG_MARKUP[key]
  if (mark) return mark(size)
  const domain = BRAND_DOMAIN[key]
  if (domain) {
    return `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64"`
      + ` alt="" width="${size}" height="${size}"`
      + ` style="width:100%;height:100%;object-fit:contain;display:block" />`
  }
  return null
}

/** The complete tile markup for an app — the mark, with the monogram beneath
 *  it when the mark is a network fetch that can fail or hang. `MonoTile` does
 *  exactly this in React; without it the editor's token chip showed an EMPTY
 *  box for every favicon-backed app (Fillout among them, 09-09), because an
 *  HTML string has no onError to fall back on.
 *
 *  `mono`, `bg` and `fg` come from the caller's own tile palette so this module
 *  stays free of the colour system. */
export function appIconTileMarkup(
  name: string, size: number, mono: string, bg: string, fg: string,
): string {
  const radius = Math.max(4, Math.round(size * 0.3))
  const box = (inner: string, background: string): string =>
    `<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;`
    + `width:${size}px;height:${size}px;flex:none;border-radius:${radius}px;overflow:hidden;`
    + `background:${background};color:${fg};font-size:${Math.round(size * 0.45)}px;font-weight:800;line-height:1;`
    + `box-sizing:border-box">${inner}</span>`

  const mark = appIconMarkup(name, size)
  if (!mark) return box(escapeText(mono), bg)
  if (!usesRemoteMark(name)) return box(mark, MARK_TILE_BG)
  // Remote: the monogram sits UNDER the image, so a blocked or slow favicon
  // shows the honest letters instead of a blank square.
  return box(
    `${escapeText(mono)}<span style="position:absolute;inset:0;display:flex">${mark}</span>`,
    bg,
  )
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** True when this app's mark is a network fetch rather than bundled markup —
 *  the only case that can hang, which is why the React tile times it out. */
export function usesRemoteMark(name: string): boolean {
  const key = name.trim().toLowerCase()
  return !BRAND_SVG_MARKUP[key] && (key === 'plan' || !!BRAND_DOMAIN[key])
}

const svg = (size: number, body: string, label: string, attrs = ''): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${label}" ${attrs}>${body}</svg>`

/** The tile every brand mark sits on. Brand marks are drawn for a white
 *  ground; `--on-fill` is near-black in the light theme, which turned HubSpot,
 *  Slack and Gmail dark. `--mark-tile` is white in every theme (globals.css). */
export const MARK_TILE_BG = 'var(--mark-tile)'

/** Marks that are a finished tile of their own (a coloured square with the
 *  glyph on it), so the tile that holds them draws them edge to edge instead of
 *  inset on its own dark fill. */
export const FULL_BLEED_MARKS = new Set(['jira'])

export const BRAND_SVG_MARKUP: Record<string, (size: number) => string> = {
  jira: size => svg(size,
    '<defs><linearGradient id="jira-tile" x1="12" y1="24" x2="12" y2="0" gradientUnits="userSpaceOnUse">'
    + '<stop offset="0" stop-color="#0052CC"/><stop offset="1" stop-color="#2684FF"/></linearGradient></defs>'
    + '<rect width="24" height="24" rx="5" fill="url(#jira-tile)"/>'
    + '<g transform="translate(4.2 4.2) scale(.65)" fill="#fff">'
    + '<path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005z"/>'
    + '<path opacity=".72" d="M17.357 5.726H5.79a5.215 5.215 0 0 0 5.215 5.215h2.129v2.058a5.218 5.218 0 0 0 5.232 5.215V6.731a1.005 1.005 0 0 0-1.009-1.005z"/>'
    + '<path opacity=".45" d="M23.143 0H11.575a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057a5.218 5.218 0 0 0 5.232 5.215V1.005A1.005 1.005 0 0 0 23.143 0z"/></g>',
    'Jira'),
  tempo: size => svg(size,
    '<circle cx="12" cy="12" r="10" fill="#0065FF"/>'
    + '<path d="M12 7v5l3.4 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    'Tempo', 'fill="none"'),
  quickbooks: size => svg(size,
    '<circle cx="12" cy="12" r="11" fill="#2CA01C"/>'
    + '<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" font-family="Helvetica, Arial, sans-serif" fill="#fff">qb</text>',
    'QuickBooks'),
  hubspot: size => svg(size,
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M18.164 7.93V5.084a2.198 2.198 0 0 0 1.265-1.977v-.058A2.2 2.2 0 0 0 17.231.85h-.058a2.2 2.2 0 0 0-2.198 2.2v.057a2.2 2.2 0 0 0 1.265 1.978v2.846a6.232 6.232 0 0 0-2.932 1.29L5.75 3.27a2.45 2.45 0 1 0-.898 1.196l7.378 5.131a6.231 6.231 0 0 0-1.227 3.737 6.231 6.231 0 0 0 1.553 4.12l-2.115 2.114a2.012 2.012 0 1 0 1.06 1.061l2.116-2.116a6.274 6.274 0 1 0 4.547-10.583zm-.27 9.418a3.222 3.222 0 1 1 0-6.444 3.222 3.222 0 0 1 0 6.444z"/>',
    'HubSpot', 'fill="#FF5C35"'),
  google: size => svg(size,
    '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>'
    + '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>'
    + '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>'
    + '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>',
    'Google'),
  // Bundled rather than fetched: it sits directly under the Google mark in the
  // sending-identity card, and a favicon that fails to load next to a crisp
  // vector reads as a broken row rather than a slow one.
  linkedin: size => svg(size,
    '<path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>',
    'LinkedIn'),
  // The white block fills the play triangle's cut-out so it reads on a dark tile too (the same mark Links draws for a youtube.com destination).
  youtube: size => svg(size,
    '<path fill="#fff" d="M9 8h7.5v8H9z"/><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
    'YouTube'),
  slack: size => svg(size,
    '<path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z"/>'
    + '<path fill="#E01E5A" d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>'
    + '<path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z"/>'
    + '<path fill="#36C5F0" d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>'
    + '<path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z"/>'
    + '<path fill="#2EB67D" d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>'
    + '<path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z"/>'
    + '<path fill="#ECB22E" d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>',
    'Slack'),
  // Google's favicon CDN returns the SAME image for mail., calendar. and
  // docs.google.com (verified 09-09 — identical bytes), so a per-product
  // domain does not work; these are bundled. "I'd like it to be more
  // accurate to actually pulling the exact thing that's happening like
  // emailing or calendar access or drive."
  gmail: size => svg(size,
    '<path d="M1.636 21.818h3.819V12.55L0 8.46v11.72c0 .904.732 1.636 1.636 1.636Z" fill="#4285F4"/>'
    + '<path d="M18.545 21.818h3.819A1.636 1.636 0 0 0 24 20.182V8.46l-5.455 4.09v9.268Z" fill="#34A853"/>'
    + '<path d="M18.545 3.818v8.732L24 8.46V4.636c0-2.024-2.31-3.178-3.927-1.964l-1.528 1.146Z" fill="#FBBC04"/>'
    + '<path d="M5.455 12.55V3.818L12 8.727l6.545-4.909v8.732L12 17.455l-6.545-4.905Z" fill="#EA4335"/>'
    + '<path d="M0 4.636V8.46l5.455 4.09V3.818L3.927 2.672C2.31 1.458 0 2.612 0 4.636Z" fill="#C5221F"/>',
    'Gmail'),
  'google drive': size => svg(size,
    '<path d="M8.4 2.6 1.2 15.1l3.6 6.2 7.2-12.5-3.6-6.2Z" fill="#3777E3"/>'
    + '<path d="M15.6 2.6H8.4l7.2 12.5h7.2L15.6 2.6Z" fill="#FFCF63"/>'
    + '<path d="M4.8 21.3h14.4l3.6-6.2H8.4l-3.6 6.2Z" fill="#11A861"/>',
    'Google Drive'),
  'google calendar': size => svg(size,
    '<rect x="3" y="4" width="18" height="17" rx="2.6" fill="#fff"/>'
    + '<path d="M3 6.6A2.6 2.6 0 0 1 5.6 4h12.8A2.6 2.6 0 0 1 21 6.6V8.2H3V6.6Z" fill="#4285F4"/>'
    + '<rect x="3.8" y="4.8" width="16.4" height="15.4" rx="2" fill="none" stroke="#4285F4" stroke-width="1.5"/>'
    + '<text x="12" y="18" text-anchor="middle" font-size="9.5" font-weight="700" fill="#4285F4" font-family="Helvetica, Arial, sans-serif">31</text>',
    'Google Calendar'),
  'google docs': size => svg(size,
    '<path d="M14 2H6.6A1.6 1.6 0 0 0 5 3.6v16.8A1.6 1.6 0 0 0 6.6 22h10.8a1.6 1.6 0 0 0 1.6-1.6V7l-5-5Z" fill="#4285F4"/>'
    + '<path d="M14 2v3.4A1.6 1.6 0 0 0 15.6 7H19L14 2Z" fill="#A1C2FA"/>'
    + '<path d="M8 11.2h8v1.3H8zM8 14h8v1.3H8zM8 16.8h5.4v1.3H8z" fill="#fff"/>',
    'Google Docs'),
  'google sheets': size => svg(size,
    '<path d="M14 2H6.6A1.6 1.6 0 0 0 5 3.6v16.8A1.6 1.6 0 0 0 6.6 22h10.8a1.6 1.6 0 0 0 1.6-1.6V7l-5-5Z" fill="#0F9D58"/>'
    + '<path d="M14 2v3.4A1.6 1.6 0 0 0 15.6 7H19L14 2Z" fill="#8CD3B0"/>'
    + '<path d="M8 11h8v7H8v-7Zm1.2 1.2v1.4h2.2v-1.4H9.2Zm3.4 0v1.4h2.2v-1.4h-2.2Zm-3.4 2.6v1.4h2.2v-1.4H9.2Zm3.4 0v1.4h2.2v-1.4h-2.2Z" fill="#fff"/>',
    'Google Sheets'),
  superhuman: size => svg(size,
    '<rect width="24" height="24" rx="5" fill="#0E172C"/>'
    + '<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">S</text>',
    'Superhuman'),
  imessage: size => svg(size,
    '<path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.81 1.5 5.3 3.82 6.9-.13.97-.55 2.5-1.5 3.45 0 0 2.5-.06 4.5-1.4.97.3 2.04.45 3.18.45 5.52 0 10-3.94 10-8.8S17.52 2 12 2z" fill="#32D74B"/>',
    'iMessage'),
  photos: size => svg(size,
    '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1.2-2h5.6L16 5"/>',
    'Photos', 'fill="none" stroke="#EC4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  'apple home': size => svg(size,
    '<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    'Apple Home', 'fill="none" stroke="#F5A623" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
}

// The short names a flow author writes as a step's tag (reference/flows.md's
// integration vocabulary) reach here unexpanded from some callers, so they
// answer to the same mark as the full product name.
for (const [short, product] of Object.entries({
  mail: 'gmail', drive: 'google drive', calendar: 'google calendar',
  docs: 'google docs', sheets: 'google sheets',
})) BRAND_SVG_MARKUP[short] = BRAND_SVG_MARKUP[product]

/** Domains for apps that only need the Google favicon-CDN fallback (a real,
 *  live source — no asset shipping, well-cached). Kept beside the bundled
 *  marks so one lookup answers "what does this app look like?". */
export const BRAND_DOMAIN: Record<string, string> = {
  claude: 'anthropic.com', ai: 'anthropic.com',
  apify: 'apify.com', brave: 'brave.com', duffel: 'duffel.com', flightaware: 'flightaware.com',
  fillout: 'fillout.com', plaid: 'plaid.com', resend: 'resend.com',
  'atlassian rovo': 'atlassian.com', rovo: 'atlassian.com', confluence: 'atlassian.com',
  'atlassian marketplace': 'marketplace.atlassian.com',
  theirstack: 'theirstack.com', fullenrich: 'fullenrich.com', serper: 'serper.dev',
  pdl: 'peopledatalabs.com', 'people data labs': 'peopledatalabs.com',
  clay: 'clay.com', kondo: 'trykondo.com', github: 'github.com',
  overseerr: 'overseerr.dev', radarr: 'radarr.video', sonarr: 'sonarr.tv',
  upwork: 'upwork.com',
  tweek: 'tweek.so', sendblue: 'sendblue.co', glockapps: 'glockapps.com',
  // No Google entry belongs here: the favicon CDN serves the SAME image for
  // mail., calendar. and docs.google.com (identical bytes, checked 09-09), so
  // every product would come back as the generic G. They are bundled above.
  linkedin: 'linkedin.com', 'linkedin proxy': 'linkedin.com', 'web search': 'brave.com', web: 'brave.com',
}
