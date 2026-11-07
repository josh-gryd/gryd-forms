'use client'

// The four states every data surface owes the operator: empty · error ·
// loading · overflow. Loading and empty already existed as per-page markup;
// this module gives them one home and adds the two the portal never had —
// a failed LOAD (with Retry) and a failed SUBMIT (with a way back).
//
// Token rule, applied throughout: red ONLY for a genuine failure (a load or
// submit that did not happen). Amber for degraded, stale or outstanding.
// Neutral for empty and loading. A count is never red.
//
// Scale note: the drawn mocks in "GRYD Portal - States.dc.html" are laid out
// inside ~158px preview tiles, so their absolute px are panel-scale. These
// components keep the mocks' structure, copy and tokens but read their sizes
// from the DS type scale so they sit correctly on a real page.

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon, FONT_DISPLAY, FONT_MONO } from './ui'

/** Every state a data surface can be in. `error` is the one the portal lacked. */
export type DataState = 'ready' | 'loading' | 'empty' | 'error' | 'denied' | 'offline'

const centred: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  textAlign: 'center', gap: 9, padding: '28px 16px',
}

function IconTile({ glyph, bg, fg }: { glyph: ReactNode; bg: string; fg: string }) {
  return (
    <span style={{
      width: 38, height: 38, flex: 'none', borderRadius: 'var(--r-tile)',
      background: bg, color: fg, border: '1.5px solid var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, fontWeight: 800,
    }}>{glyph}</span>
  )
}

function Pill({ children, solid, onClick }: { children: ReactNode; solid?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      data-ui-btn=""
      className="hv-btn"
      style={{
        padding: '7px 13px', borderRadius: 'var(--r-control)',
        border: 'var(--bd) solid var(--ink)',
        fontSize: 'var(--type-chip)', fontWeight: 800, cursor: 'pointer',
        background: solid ? 'var(--inkbg)' : 'var(--card)',
        color: solid ? 'var(--oninkbg)' : 'var(--tx)',
        boxShadow: 'var(--el-1)', whiteSpace: 'nowrap', font: 'inherit',
      }}
    >{children}</button>
  )
}

/** Nothing here yet — neutral, never red. */
export function EmptyState({ glyph = '○', title, hint, action, onAction }: {
  glyph?: ReactNode; title: string; hint?: string; action?: string; onAction?: () => void
}) {
  return (
    <div style={centred}>
      <IconTile glyph={glyph} bg="var(--inset)" fg="var(--mut)" />
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 'var(--type-card-title)', fontWeight: 800, color: 'var(--tx)', letterSpacing: 'var(--track-display)' }}>{title}</div>
      {hint && <div style={{ fontSize: 'var(--type-dense)', lineHeight: 1.45, color: 'var(--mut)', maxWidth: 260 }}>{hint}</div>}
      {action && <div style={{ marginTop: 3 }}><Pill onClick={onAction}>{action}</Pill></div>}
    </div>
  )
}

/**
 * A load that failed. The one state the enum was missing, so no screen could
 * say "this didn't load" — it could only show an empty list, which reads as
 * "there is nothing here" and is a different claim entirely.
 */
export function ErrorState({ title, sub, cause, retryLabel = '↻ Retry', onRetry }: {
  title: string; sub?: string; cause?: string; retryLabel?: string; onRetry?: () => void
}) {
  return (
    <div role="alert" style={centred}>
      <IconTile glyph="⚠" bg="var(--red-bg)" fg="var(--red-tx)" />
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 'var(--type-card-title)', fontWeight: 800, color: 'var(--tx)', letterSpacing: 'var(--track-display)' }}>{title}</div>
      {sub && <div style={{ fontSize: 'var(--type-dense)', lineHeight: 1.45, color: 'var(--mut)', maxWidth: 280 }}>{sub}</div>}
      {onRetry && <div style={{ marginTop: 2 }}><Pill solid onClick={onRetry}>{retryLabel}</Pill></div>}
      {cause && <div style={{ fontFamily: FONT_MONO, fontSize: 'var(--type-nano)', color: 'var(--red-tx)', marginTop: 2 }}>{cause}</div>}
    </div>
  )
}

/**
 * A submit that failed — Today's "Couldn't send" after an approval, a failed
 * OAuth connect, a tile that wouldn't refresh. Always offers a way back, so a
 * failure never strands the thing the operator was doing.
 */
export function SubmitError({ text, cause, primary, onPrimary, secondary, onSecondary }: {
  text: string; cause?: string
  primary: string; onPrimary?: () => void
  secondary?: string; onSecondary?: () => void
}) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{
        display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--red-bg)',
        border: 'var(--bd) solid var(--ink)', borderRadius: 'var(--r-control)', padding: '10px 11px',
      }}>
        <span aria-hidden="true" style={{ color: 'var(--red-tx)', fontWeight: 800, flex: 'none', fontSize: 14, lineHeight: 1.3 }}>✕</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--type-seg)', fontWeight: 800, color: 'var(--red-tx)', lineHeight: 1.35 }}>{text}</div>
          {cause && <div style={{ fontFamily: FONT_MONO, fontSize: 'var(--type-nano)', color: 'var(--red-tx)', marginTop: 3, opacity: .85 }}>{cause}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <Pill solid onClick={onPrimary}>{primary}</Pill>
        {secondary && <Pill onClick={onSecondary}>{secondary}</Pill>}
      </div>
    </div>
  )
}

/**
 * Served from cache because the refresh failed. Amber, not red: the number on
 * screen is real, it is just old. Never blank a figure the operator was reading.
 */
export function StaleBadge({ asOf }: { asOf?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        padding: '2px 9px', borderRadius: 'var(--r-pill)', fontSize: 'var(--type-nano)',
        fontWeight: 800, background: 'var(--amb-bg)', color: 'var(--amb-tx)',
        border: '1.5px solid var(--ink)', whiteSpace: 'nowrap',
      }}>STALE</span>
      {asOf && <span style={{ fontFamily: FONT_MONO, fontSize: 'var(--type-chip)', color: 'var(--mut2)' }}>{asOf}</span>}
    </span>
  )
}

/** The global "you are offline" strip. Degraded, so amber. */
export function OfflineBanner({ text = 'Offline — showing the last data loaded. Approvals queue until you’re back.', onRetry }: {
  text?: string; onRetry?: () => void
}) {
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'center', background: 'var(--amb-bg)',
      border: 'var(--bd) solid var(--ink)', borderRadius: 'var(--r-control)', padding: '10px 11px',
    }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--r-round)', background: 'var(--amb)', border: '1.5px solid var(--ink)', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--type-chip)', fontWeight: 700, color: 'var(--amb-tx)', lineHeight: 1.4 }}>{text}</span>
      {onRetry && (
        <button onClick={onRetry} className="hv-btn" style={{
          flex: 'none', padding: '5px 10px', borderRadius: 'var(--r-chip)',
          border: '1.5px solid var(--ink)', background: 'var(--card)',
          fontSize: 'var(--type-micro)', fontWeight: 800, color: 'var(--tx)', cursor: 'pointer', font: 'inherit',
        }}>Retry</button>
      )}
    </div>
  )
}

// ── overflow ───────────────────────────────────────────────────────────────

/**
 * Large numbers. Past 7 digits the figure outgrows its tile, so abbreviate and
 * keep the exact value on hover — the operator can still audit it, but the
 * layout stops breaking. Always tabular so columns of figures line up.
 */
export function formatBig(n: number, currency?: string): { short: string; full: string } {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const cur = currency ?? ''
  const full = `${sign}${cur}${abs.toLocaleString('en-US')}`
  // 7 digits = 1,000,000. Below that the full value fits, so leave it alone.
  if (abs < 1_000_000) return { short: full, full }
  const [div, suffix] = abs >= 1_000_000_000 ? [1_000_000_000, 'B'] : [1_000_000, 'M']
  const scaled = abs / div
  // Keep three significant figures: 4.95M, 49.5M, 495M.
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return { short: `${sign}${cur}${scaled.toFixed(digits)}${suffix}`, full }
}

export const tabularNums: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

/** A figure that abbreviates past 7 digits and keeps the full value on hover. */
export function BigNumber({ value, currency, style }: { value: number; currency?: string; style?: CSSProperties }) {
  const { short, full } = formatBig(value, currency)
  return <span title={short === full ? undefined : full} style={{ ...tabularNums, minWidth: 0, ...style }}>{short}</span>
}

/**
 * The honest footer for a capped list. A count without its scope is the thing
 * the ledger rules forbid, so this always says how many of how many.
 */
export function ShowingCount({ shown, total, noun, onLoadMore }: {
  shown: number; total: number; noun: string; onLoadMore?: () => void
}) {
  const more = total > shown
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      fontSize: 'var(--type-micro)', color: 'var(--mut2)', fontFamily: FONT_MONO, padding: '8px 2px',
    }}>
      <span style={tabularNums}>
        Showing {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')} {noun}
      </span>
      {more && onLoadMore && (
        <button onClick={onLoadMore} className="hv-link" style={{
          color: 'var(--link)', fontWeight: 700, cursor: 'pointer',
          background: 'none', border: 'none', font: 'inherit', padding: 0,
        }}>Load more</button>
      )}
    </div>
  )
}

export const PAGE_SIZE = 50

/**
 * Page a filtered set without lying about it. Filtering and sorting run over
 * the WHOLE set upstream; this only decides which slice is in the DOM, so a
 * filter still means "everything that matches", never "everything on screen".
 * Resets to page 1 whenever the result count changes, so narrowing a filter
 * can't strand you on a page that no longer exists.
 */
export function usePaged<T>(items: T[], size: number = PAGE_SIZE) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const safe = Math.min(page, pages - 1)
  useEffect(() => { setPage(0) }, [items.length])
  const start = safe * size
  return {
    slice: items.slice(start, start + size),
    page: safe, pages, size,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + size, items.length),
    total: items.length,
    setPage,
  }
}

/** Page controls + an honest "showing x–y of n". */
export function Pager({ from, to, total, page, pages, noun, onPage }: {
  from: number; to: number; total: number; page: number; pages: number
  noun: string; onPage: (p: number) => void
}) {
  if (total === 0) return null
  const btn = (label: string, to_: number, disabled: boolean) => (
    <button
      onClick={() => onPage(to_)}
      disabled={disabled}
      className={disabled ? undefined : 'hv-btn'}
      style={{
        padding: '5px 10px', borderRadius: 'var(--r-chip)',
        border: '1.5px solid var(--ink)', background: 'var(--card)',
        fontSize: 'var(--type-micro)', fontWeight: 800,
        color: disabled ? 'var(--mut3)' : 'var(--tx)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1,
        font: 'inherit', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', padding: '10px 2px',
    }}>
      <span style={{
        fontFamily: FONT_MONO, fontSize: 'var(--type-micro)', color: 'var(--mut2)',
        ...tabularNums,
      }}>
        Showing {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')} {noun}
      </span>
      {pages > 1 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {btn('‹ Prev', page - 1, page === 0)}
          <span style={{
            fontFamily: FONT_MONO, fontSize: 'var(--type-micro)', fontWeight: 700,
            color: 'var(--mut2)', ...tabularNums,
          }}>{page + 1} / {pages}</span>
          {btn('Next ›', page + 1, page >= pages - 1)}
        </span>
      )}
    </div>
  )
}

/** Skeleton row set — the shimmer the whole workspace already uses. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <div className="skeleton" style={{ height: 28, width: 28, borderRadius: 'var(--r-chip)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="skeleton" style={{ height: 9, width: '72%' }} />
            <div className="skeleton" style={{ height: 8, width: '44%' }} />
          </div>
          <div className="skeleton" style={{ height: 16, width: 30, borderRadius: 'var(--r-chip)' }} />
        </div>
      ))}
    </div>
  )
}

/**
 * One switch a screen can hand its state to, so every surface answers for the
 * four states the same way instead of each inventing its own.
 */
export function StateView({ state, children, empty, error, loading }: {
  state: DataState
  children: ReactNode
  empty?: ReactNode
  error?: ReactNode
  loading?: ReactNode
}) {
  if (state === 'loading') return <>{loading ?? <SkeletonList />}</>
  if (state === 'error') return <>{error ?? <ErrorState title="Couldn’t load this" />}</>
  if (state === 'empty') return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  return <>{children}</>
}

export { Icon }
