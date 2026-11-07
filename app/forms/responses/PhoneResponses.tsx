'use client'

// Reading responses on the phone (handoff §6: "Forms · read new responses" is
// the phone job). The list is full-bleed rows, newest first: a gold dot and a
// heavier name while a response is unread, who it's from, the form or their
// email, when, and a tag only when it isn't a plain completed one. A response
// opens as a sheet (ResponseDetail draws it on a phone); its Previous and Next
// walk the list the way ↑/↓ do on desktop, and opening one reads it.
//
// The pieces here are presentational: Inbox.tsx and FormResponses.tsx keep the
// state, the loads and every action, and hand them in.

import React from 'react'
import { PhoneIcon } from '@/app/components/phone/icons'
import { openActionSheet } from '@/lib/phone/ui-store'
import type { ListItem } from './ResponseList'
import { whenShort, type Range } from './shared'

export const RANGE_LABEL: Record<Range, string> = { all: 'All time', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' }

/** The "When" select, as a chip that opens an action sheet. */
export function RangeChip({ range, setRange }: { range: Range; setRange: (r: Range) => void }) {
  const pick = () => openActionSheet('When', (Object.keys(RANGE_LABEL) as Range[]).map(r => ({ label: RANGE_LABEL[r], current: r === range, onPick: () => setRange(r) })))
  return (
    <button type="button" className="ph-chip" aria-pressed={range !== 'all'} onClick={pick} data-testid="range">
      {RANGE_LABEL[range]}<PhoneIcon name="chevron-down" size={15} />
    </button>
  )
}

export function SearchRow({ q, setQ, placeholder, after }: { q: string; setQ: (v: string) => void; placeholder: string; after?: React.ReactNode }) {
  return (
    <div className="ph-bar-row">
      <label className="ph-search">
        <PhoneIcon name="search" size={17} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {q ? <button type="button" aria-label="Clear search" onClick={() => setQ('')} style={{ border: 0, background: 'transparent', color: 'var(--mut)', display: 'grid', placeItems: 'center', width: 32, height: 32, cursor: 'pointer' }}><PhoneIcon name="x" size={16} /></button> : null}
      </label>
      {after}
    </div>
  )
}

export function MoreButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return <button type="button" className="ph-btn" data-flat="" aria-label={label} onClick={onClick} style={{ width: 44, padding: 0, flex: 'none' }} data-testid={testId}><PhoneIcon name="more-horizontal" size={19} /></button>
}

const STATUS_TAG: Record<string, { label: string; tone: string } | undefined> = {
  partial: { label: 'Partial', tone: 'today' },
  spam: { label: 'Spam', tone: 'fail' },
}

export function PhoneResponseRows({ items, loading, head, shown, total, onSelect, onMore, loadingMore, empty, rowTestId }: {
  items: ListItem[]; loading: boolean; head: React.ReactNode; shown: number; total: number
  onSelect: (id: string, e: React.MouseEvent) => void; onMore: (() => void) | null; loadingMore: boolean
  empty: React.ReactNode; rowTestId: string
}) {
  return (
    <section aria-label="Responses" data-testid="ph-responses">
      <div className="ph-group-head" data-under-filters="" style={{ minHeight: 44, padding: "0 20px" }}>
        {head}
        <span className="n" data-testid="results-showing">{loading && !items.length ? '' : `${shown} of ${total}`}</span>
      </div>
      {loading && !items.length ? <div className="ph-empty">Reading the responses…</div> : null}
      {!loading && !items.length ? <div style={{ padding: '18px 16px' }}>{empty}</div> : null}
      {items.map(it => {
        const tag = it.status ? STATUS_TAG[it.status] : undefined
        return (
          <button key={it.id} type="button" className="ph-row" data-lead="none" onClick={e => onSelect(it.id, e)} data-testid={rowTestId} data-response-id={it.id} data-unread={it.unread ? 'true' : undefined} style={{ position: 'relative' }}>
            {it.unread ? <span role="img" aria-label="Unread" data-testid="row-unread" style={{ position: 'absolute', left: 6, top: 19, width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', border: '1.5px solid var(--ink)' }} /> : null}
            <span className="ph-row-main">
              <span className="ph-row-title" data-strong={it.unread ? '' : undefined} style={{ display: 'block' }}>{it.title}</span>
              <span className="ph-row-sub" style={{ display: 'block', fontFamily: it.subMono ? 'var(--font-mono)' : undefined, fontSize: it.subMono ? 12.5 : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub || ' '}</span>
            </span>
            <span className="ph-row-side">
              <span className="ph-row-value">{it.edited ? 'edited · ' : ''}{whenShort(it.when)}</span>
              {tag ? <span className="ph-tag" data-tone={tag.tone}>{tag.label}</span> : it.tag ?? null}
            </span>
          </button>
        )
      })}
      {onMore ? (
        <button type="button" className="ph-btn" data-flat="" onClick={onMore} disabled={loadingMore} style={{ margin: '14px 16px', width: 'calc(100% - 32px)' }} data-testid="list-more">
          {loadingMore ? 'Loading…' : `Show more (${total - shown} left)`}
        </button>
      ) : null}
    </section>
  )
}
