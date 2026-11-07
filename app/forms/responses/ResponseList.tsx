'use client'

// The list beside the open response: newest first (or oldest), how many of
// how many, then one row a response — who, their email (or the form, on All
// forms), when, and its status. The open one is highlighted; an unread one
// has a dot until it is opened.

import React, { useEffect, useRef } from 'react'
import type { ResponseSummary } from '@/lib/forms/api'
import { Btn, Skeleton } from '../ui'
import { StatusTag, whenShort } from './shared'

export interface ListItem {
  id: string; title: string; sub: string; subMono: boolean; when: string | null
  status?: ResponseSummary['status']; tag?: React.ReactNode; unread: boolean; edited: boolean
}

export default function ResponseList({ items, activeId, onSelect, head, shown, total, loading, onMore, loadingMore, empty, rowTestId }: {
  items: ListItem[]; activeId: string | null; onSelect: (id: string, e: React.MouseEvent) => void
  head: React.ReactNode; shown: number; total: number; loading: boolean
  onMore: (() => void) | null; loadingMore: boolean; empty: React.ReactNode; rowTestId: string
}) {
  const rows = useRef<HTMLDivElement>(null)
  // Up/down move the selection from the keyboard; keep it in view.
  useEffect(() => { rows.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [activeId])
  return (
    <section className="fb-rsp-card fb-rsp-list" aria-label="Responses list">
      <div className="fb-rsp-list__head">
        {head}
        <span className="fb-rsp-list__count" data-testid="results-showing">{loading && !items.length ? '' : `${shown} of ${total}`}</span>
      </div>
      <div ref={rows} className="fb-rsp-list__rows fb-scroll" role="listbox" aria-label="Responses" aria-busy={loading || undefined}>
        {items.map(it => (
          <button key={it.id} type="button" role="option" aria-selected={it.id === activeId} className="fb-rsp-row" onClick={e => onSelect(it.id, e)}
            data-testid={rowTestId} data-response-id={it.id} data-unread={it.unread ? 'true' : undefined}>
            <span className="fb-rsp-row__dot">{it.unread && <span role="img" aria-label="Unread" className="fb-rsp-dot" data-testid="row-unread" />}</span>
            <span className="fb-rsp-row__title" style={{ fontWeight: it.unread ? 800 : 700 }}>{it.title}</span>
            <span className="fb-rsp-row__when">{it.edited && <em title="Changed by the respondent after sending">edited · </em>}{whenShort(it.when)}</span>
            <span />
            <span className={it.subMono ? 'fb-rsp-row__sub fb-mono' : 'fb-rsp-row__sub'}>{it.sub || ' '}</span>
            <span className="fb-rsp-row__status">{it.status ? <StatusTag status={it.status} testId="row-status" /> : it.tag}</span>
          </button>
        ))}
        {loading && !items.length && [0, 1, 2, 3, 4].map(i => (
          <div key={i} className="fb-rsp-row" aria-hidden="true" style={{ cursor: 'default' }}><span /><Skeleton width="55%" /><Skeleton width={48} /><span /><Skeleton width="70%" /><Skeleton width={72} /></div>
        ))}
        {!loading && !items.length && <div style={{ padding: 18 }}>{empty}</div>}
        {onMore && <div style={{ padding: 14, display: 'flex', justifyContent: 'center' }}><Btn size="sm" onClick={onMore} disabled={loadingMore} testId="list-more">{loadingMore ? 'Loading…' : `Show more (${total - shown} left)`}</Btn></div>}
      </div>
    </section>
  )
}
