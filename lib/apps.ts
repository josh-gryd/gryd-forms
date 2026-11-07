// The app registry. GRYD Forms is one app; the shell, sidebar and band read
// its pages from here.

export type AppId = 'forms'
  | 'linkedin' | 'flows' | 'forms' | 'webinars' | 'links' | 'docs' | 'settings' | 'alf'

export interface AppPage {
  href: string
  label: string
  /** Emoji glyph for the sidebar page-row icon tile — the democup's system.
   *  Falls back to the app's emoji when a page doesn't set its own. */
  emoji?: string
  description?: string
  /** Active for any path under this prefix (tabs that are sibling routes). */
  activePrefix?: string
  /** Other routes this one row stands for, each with the paths under it: one
   *  page that lives in two places (Content's Analytics, videos and webinars). */
  alsoActive?: string[]
  /** Active ONLY on an exact match — needed when this href is a prefix of a
   *  sibling (e.g. '/Alf' is a prefix of '/Alf/health'). */
  exact?: boolean
  /** Live count pill; rendered only when > 0. */
  badge?: number
  /** Opens a named group above this page in the sidebar. Pages sharing a
   *  section must be adjacent — the header renders on the first of each run. */
  section?: string
  /** The band's title, when it says more than the sidebar row can ("Video
   *  library" for the row "Videos"). Defaults to `label`. */
  title?: string
  /** The one thing this tab does, drawn on the right of the app masthead.
   *  Declarative form, for pages whose action is a plain navigation. A page
   *  needing its own state renders <SlabAction> instead, which wins. */
  action?: { label: string; href: string }
}

export interface AppDef {
  id: AppId
  label: string
  /** Icon name in ui.tsx's IC set. */
  icon: string
  /** The emoji glyph the department rail draws — the democup's icon system.
   *  The prototype (GRYD-Workspace-v2.html) uses emoji marks, not SVGs. */
  emoji: string
  /** Whether this app gets a mark on the department rail. `false` buries it:
   *  still routable and rendered in its own sidebar, just off the rail — Alf
   *  (reached as an agent) and Settings (reached from the account menu). */
  rail?: boolean
  /** Rail tint — agent identity where the app belongs to an agent. */
  color: string
  /** Caps label above the app sidebar's page list. */
  kind: string
  /** g-then-letter jump key, taught in the rail tooltip. */
  gkey: string
  /** The agent that owns this app, if any (drives presence + health pill). */
  agent?: string
  /** Shown in the app sidebar when the app has no sub-pages of its own. */
  blurb?: string
  /** The app's landing route. */
  href: string
  /** Pages inside the app. Empty means the app is a single screen. */
  pages: AppPage[]
  /** Optional standing note pinned above the app sidebar's Apps footer — a
   *  small titled card. Used by LinkedIn for the account-safe assurance. */
  note?: { title: string; body: string }
  /** The page list stands alone, without the app's name as its heading
   *  (Content: four plain rows). Pages must not open sections. */
  plainNav?: boolean
}

export const APPS: AppDef[] = [
  {
    id: 'forms', label: 'Forms', icon: 'doc', emoji: '📝', color: 'var(--ava-indigo)', kind: 'APP',
    gkey: 'm', href: '/forms',
    pages: [
      { href: '/forms', label: 'All forms', emoji: '📝', description: 'Every form: search, filter by status or folder.', exact: true },
      { href: '/forms/responses', label: 'Responses', emoji: '📥', description: 'New responses across every form, unread first.' },
      { href: '/forms/templates', label: 'Templates', emoji: '🧩', description: 'Starting points: contact, intake, feedback, registration, and your own.' },
      { href: '/forms/archived', label: 'Archived', emoji: '🗄️', description: 'Forms kept but out of the list.' },
      { href: '/forms/settings', label: 'Settings', emoji: '⚙️', description: 'Branding, notifications and defaults for new forms.' },
    ],
  },
]

const APP_BY_ID: Record<string, AppDef> = Object.fromEntries(APPS.map(a => [a.id, a]))

export function appById(id: string): AppDef | undefined {
  return APP_BY_ID[id]
}

/** True when `pathname` is inside this page (honouring exact / activePrefix / alsoActive). */
export function pageIsActive(page: AppPage, pathname: string): boolean {
  return pageMatchLength(page, pathname) >= 0
}

/** How much of `pathname` this page's longest matching route covers, or -1. */
function pageMatchLength(page: AppPage, pathname: string): number {
  const under = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const own = page.activePrefix || page.href
  let best = (page.exact && !page.activePrefix ? pathname === own : under(own)) ? own.length : -1
  for (const p of page.alsoActive ?? []) if (p.length > best && under(p)) best = p.length
  return best
}

// Routes with no registry entry of their own. Each is reached from inside an
// app but is not one of its tabs, so it has nothing to inherit a name from.
export const EXTRA_PAGES: Record<string, { title: string; sub?: string }> = {
  '/new-agent': { title: 'New agent', sub: 'Name it, give it a role, and pick what it may reach.' },
  '/schedules': { title: 'Schedules', sub: 'Every cron the engine runs, and when it last fired.' },
  '/sourcing': { title: 'Sourcing', sub: 'Where new prospects come from.' },
  '/artifacts': { title: 'Artifacts', sub: 'Charts, widgets and mockups your agents made.' },
  '/whats-new': { title: 'What\'s new', sub: 'What shipped in the latest release, by lane, with a switch to turn a feature off.' },
}

/** The extra page a path is on: an exact entry, or the one it sits under (/artifacts/<id>, and its 404, is Artifacts
 *  rather than falling through to Home). */
export function extraPageFor(pathname: string): { title: string; sub?: string } | undefined {
  if (EXTRA_PAGES[pathname]) return EXTRA_PAGES[pathname]
  let best: string | undefined
  for (const k of Object.keys(EXTRA_PAGES)) if (pathname.startsWith(k + '/') && (!best || k.length > best.length)) best = k
  return best ? EXTRA_PAGES[best] : undefined
}

/** The ONE page a path is on. `pageIsActive` answers per page, so when a section
 *  root and one of its children both match — /agents and /agents/runs —
 *  every caller that took the first or highlighted each match got two answers.
 *  Longest match wins, the same rule `appForPath` already uses one level up. */
export function activePage(pages: AppPage[], pathname: string): AppPage | undefined {
  let best: AppPage | undefined
  let bestLen = -1
  for (const page of pages) {
    const len = pageMatchLength(page, pathname)
    if (len > bestLen) { bestLen = len; best = page }
  }
  return best
}

// Longest match wins.
function matchLength(href: string, pathname: string): number {
  if (href === '/') return pathname === '/' ? 1 : -1
  if (pathname === href || pathname.startsWith(href + '/')) return href.length
  return -1
}

/** Which app owns this route. Falls back to Home so the shell always renders. */
export function appForPath(pathname: string): AppDef {
  let best: AppDef | undefined
  let bestLen = 0

  for (const app of APPS) {
    for (const page of app.pages) {
      const len = pageMatchLength(page, pathname)
      if (len > bestLen) { bestLen = len; best = app }
    }
    const len = matchLength(app.href, pathname)
    if (len > bestLen) { bestLen = len; best = app }
  }

  return best || APPS[0]
}

