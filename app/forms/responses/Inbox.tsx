'use client'

// Every form's sent responses, newest first — the Responses page with All
// forms picked. The same layout as one form's: the list beside the open
// response, ↑/↓ to move, and opening one marks it read (the sidebar's count is
// this list's unread total). A form's partial responses are on its own view.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formsApi, formsChanged, type InboxItem } from '@/lib/forms/api'
import { Btn, Seg, SearchBox, Select, EmptyState, Sheet, Confirm, Tag, useToast, useMediaQuery } from '../ui'
import { Icon } from '../ui/icons'
import ResponseList, { type ListItem } from './ResponseList'
import ResponseDetail, { type DetailNav } from './ResponseDetail'
import { PAGE, rowLines, typingOrDialog, useDebounced, type Range } from './shared'
import { usePhone } from '@/lib/phone/use-phone'
import { PhoneResponseRows, RangeChip, SearchRow } from './PhoneResponses'
import { ScrollRow } from '@/app/components/ScrollRow'

export default function Inbox({ initial }: { initial: string | null }) {
  const { toast } = useToast()
  const params = useSearchParams()
  const narrow = useMediaQuery('(max-width: 1100px)')
  const narrowRef = useRef(narrow); narrowRef.current = narrow
  const [unreadOnly, setUnreadOnly] = useState(params.get('unread') === '1')
  const [range, setRange] = useState<Range>('all')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [rows, setRows] = useState<InboxItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstLoad = useRef(true)
  const loads = useRef(0)
  const activeRef = useRef(active); activeRef.current = active
  const linked = useRef(initial)
  // The response the page opened by itself stays unread until someone picks it.
  const auto = useRef<string | null>(null)
  const [opened, setOpened] = useState(0)

  const query = useCallback((offset: number) => {
    const p = new URLSearchParams()
    if (unreadOnly) p.set('unread', '1')
    if (range !== 'all') p.set('since', new Date(Date.now() - Number(range) * 86400000).toISOString())
    if (dq.trim()) p.set('q', dq.trim())
    p.set('limit', String(PAGE)); p.set('offset', String(offset))
    return p.toString()
  }, [unreadOnly, range, dq])

  const load = useCallback(async (keep?: string | null) => {
    // Only the latest load lands: a quick run of filter changes can't finish out of order.
    const mine = ++loads.current
    setLoading(true)
    try {
      const r = await formsApi.inbox(query(0))
      if (mine !== loads.current) return
      setRows(r.rows); setTotal(r.total); setUnread(r.unread); setError(null)
      // The first load opens the linked response when it is listed; after that, keep what is open.
      const first = firstLoad.current
      firstLoad.current = false
      const want = first ? linked.current : keep !== undefined ? keep : activeRef.current
      if (want && r.rows.some(x => x.id === want)) { if (first) auto.current = null; setActive(want); return }
      const newest = narrowRef.current ? null : r.rows[0]?.id ?? null
      auto.current = newest
      setActive(newest)
    } catch (err) { if (mine === loads.current) setError((err as Error).message) }
    finally { if (mine === loads.current) setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])

  const more = useCallback(async (): Promise<string[]> => {
    if (!rows) return []
    setLoadingMore(true)
    try {
      const r = await formsApi.inbox(query(rows.length))
      const seen = new Set(rows.map(x => x.id))
      const added = r.rows.filter(x => !seen.has(x.id))
      setRows(rs => rs && [...rs, ...added]); setTotal(r.total)
      return added.map(x => x.id)
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }); return [] }
    finally { setLoadingMore(false) }
  }, [rows, query, toast])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (active && active !== auto.current) url.searchParams.set('r', active); else url.searchParams.delete('r')
    window.history.replaceState(null, '', url.toString())
  }, [active, opened])

  // Opening a response reads it; it stays in the list (even under Unread) until the list reloads.
  useEffect(() => {
    if (!active || active === auto.current) return
    const row = rows?.find(r => r.id === active)
    if (!row || row.readAt) return
    formsApi.markRead({ ids: [active], read: true }).then(res => {
      setUnread(res.unread)
      setRows(rs => rs && rs.map(r => (r.id === active ? { ...r, readAt: new Date().toISOString() } : r)))
      if (res.changed) formsChanged()
    }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, opened])

  const list = useMemo(() => rows ?? [], [rows])
  const idx = active ? list.findIndex(r => r.id === active) : -1
  const go = useCallback(async (step: 1 | -1) => {
    let to: string | undefined
    if (step === -1) to = idx > 0 ? list[idx - 1].id : undefined
    else if (idx === -1) to = list[0]?.id
    else if (idx + 1 < list.length) to = list[idx + 1].id
    else if (list.length < total) to = (await more())[0]
    if (to) { auto.current = null; setActive(to) }
  }, [idx, list, total, more])
  const nav: DetailNav = { index: idx, total, prev: idx > 0 ? () => void go(-1) : undefined, next: idx + 1 < list.length || list.length < total ? () => void go(1) : undefined }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingOrDialog(e)) return
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') { e.preventDefault(); void go(-1) }
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') { e.preventDefault(); void go(1) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go])

  const items: ListItem[] = useMemo(() => list.map(r => ({
    id: r.id, title: rowLines(r.preview).title, sub: r.formTitle, subMono: false, when: r.submittedAt,
    tag: r.formArchived ? <Tag tone="neutral">Archived form</Tag> : undefined, unread: !r.readAt, edited: !!r.editedAt,
  })), [list])

  const filtered = unreadOnly || range !== 'all' || !!dq.trim()
  const clearFilters = () => { setUnreadOnly(false); setRange('all'); setQ('') }

  const doDelete = async (id: string) => {
    const row = list.find(r => r.id === id)
    if (!row) return
    setBusy(true)
    try {
      await formsApi.deleteResponse(row.formId, id)
      toast({ msg: 'Response deleted.' })
      const next = list[idx + 1]?.id ?? list[idx - 1]?.id ?? null
      setConfirm(null)
      auto.current = next
      await load(next); formsChanged()
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) } finally { setBusy(false) }
  }
  const markUnread = async (id: string) => {
    try {
      const res = await formsApi.markRead({ ids: [id], read: false })
      setUnread(res.unread)
      setRows(rs => rs && rs.map(r => (r.id === id ? { ...r, readAt: null } : r)))
      formsChanged(); toast({ msg: 'Marked as unread.' })
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const markAll = async () => {
    try {
      await formsApi.markRead({ all: true })
      toast({ msg: 'Every response marked as read.' })
      formsChanged(); await load(active)
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const select = (id: string, e: React.MouseEvent) => {
    const row = list.find(r => r.id === id)
    if ((e.metaKey || e.ctrlKey) && row) { window.open(`/forms/responses?form=${encodeURIComponent(row.formId)}&r=${encodeURIComponent(id)}`, '_blank', 'noopener'); return }
    auto.current = null
    setActive(id); setOpened(n => n + 1)
  }

  const open = list.find(r => r.id === active) ?? null
  const detail = open ? (
    <ResponseDetail key={open.id} formId={open.formId} rid={open.id} nav={nav} onDelete={setConfirm} onMarkUnread={id => void markUnread(id)} onClose={narrow ? () => setActive(null) : undefined}
      formLink={{ title: open.formTitle, href: `/forms/responses?form=${encodeURIComponent(open.formId)}&r=${encodeURIComponent(open.id)}` }} />
  ) : null

  const confirmNode = <Confirm open={!!confirm} title="Delete this response?" body="This can’t be undone. Uploaded files are removed too." busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && void doDelete(confirm)} />
  const emptyNode = filtered
    ? <EmptyState title={unreadOnly && !dq.trim() && range === 'all' ? 'All caught up.' : 'No responses match.'} body={unreadOnly ? 'Nothing unread with these filters.' : 'Try a longer time range or a different search.'} action={<Btn onClick={clearFilters}>Clear filters</Btn>} testId="inbox-empty" />
    : <EmptyState title="No responses yet." body="Every form’s responses arrive here, newest first. Publish a form and share its link to get the first one." testId="inbox-empty" />

  // The phone: the list is the page; a response opens as a sheet over it
  // (ResponseDetail draws the sheet), with Previous / Next for ↑ / ↓.
  const phone = usePhone()
  if (phone) return (
    <div data-testid="forms-inbox">
      <SearchRow q={q} setQ={setQ} placeholder="Search any answer" />
      <ScrollRow className="ph-filters" role="toolbar" aria-label="Filter responses">
        <button type="button" className="ph-chip" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} data-testid="inbox-all">All</button>
        <button type="button" className="ph-chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} data-testid="inbox-unread">Unread<span className="n" data-testid="inbox-unread-count">{unread}</span></button>
        <RangeChip range={range} setRange={setRange} />
        <button type="button" className="ph-chip" disabled={!unread} onClick={() => void markAll()} data-testid="inbox-mark-all" style={{ opacity: unread ? 1 : 0.5 }}><Icon name="check" size={15} />Mark all read</button>
        {filtered ? <button type="button" className="ph-chip" onClick={clearFilters} data-testid="clear-filters" style={{ textDecoration: 'underline' }}>Clear filters</button> : null}
      </ScrollRow>
      {error ? <div role="alert" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: 'var(--coral-tx)', borderBottom: '1px solid var(--line)' }}>Couldn’t load responses: {error} <Btn size="sm" onClick={() => void load()}>Retry</Btn></div> : null}
      <PhoneResponseRows items={items} loading={loading} shown={list.length} total={total} onSelect={select} rowTestId="inbox-row"
        head={<span>Newest first</span>} onMore={list.length < total ? () => void more() : null} loadingMore={loadingMore} empty={emptyNode} />
      {open ? <ResponseDetail formId={open.formId} rid={open.id} nav={nav} onDelete={setConfirm} onMarkUnread={id => void markUnread(id)} onClose={() => setActive(null)}
        formLink={{ title: open.formTitle, href: `/forms/responses?form=${encodeURIComponent(open.formId)}&r=${encodeURIComponent(open.id)}` }} /> : null}
      {confirmNode}
    </div>
  )

  return (
    <div className="fb-rsp" data-testid="forms-inbox">
      <div className="fb-rsp-toolbar">
        <SearchBox large value={q} onChange={setQ} placeholder="Search any answer" label="Search any answer" />
        <Seg<'all' | 'unread'> size="lg" label="Read state" value={unreadOnly ? 'unread' : 'all'} onChange={v => setUnreadOnly(v === 'unread')} options={[
          { value: 'all', label: 'All', testId: 'inbox-all' },
          { value: 'unread', label: <>Unread <span className="fb-rsp-n" data-testid="inbox-unread-count">{unread}</span></>, testId: 'inbox-unread' },
        ]} />
        <label className="fb-rsp-range">
          <Icon name="calendar" size={16} />
          <Select value={range} onChange={e => setRange(e.target.value as Range)} aria-label="When" data-testid="range">
            <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
          </Select>
        </label>
        {filtered && <Btn ghost size="sm" onClick={clearFilters} testId="clear-filters">Clear filters</Btn>}
        <Btn quiet icon="check" onClick={() => void markAll()} disabled={!unread} testId="inbox-mark-all" aria-label="Mark all read" className="fb-rsp-push"><span className="fb-rsp-label">Mark all read</span></Btn>
      </div>

      {error && <div role="alert" className="fb-banner fb-banner--coral fb-banner--inline"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>Couldn’t load responses: {error}</span><Btn size="sm" onClick={() => void load()}>Retry</Btn></div>}

      <div className="fb-rsp-panes">
        <ResponseList items={items} activeId={active} onSelect={select} rowTestId="inbox-row" loading={loading} shown={list.length} total={total}
          head={<span className="fb-rsp-list__sort" style={{ cursor: 'default' }}>Newest first<Icon name="arrow-down" size={14} /></span>}
          onMore={list.length < total ? () => void more() : null} loadingMore={loadingMore}
          empty={emptyNode} />
        {!narrow && (detail ?? (
          <section className="fb-rsp-card fb-rsp-detail fb-rsp-detail--empty" aria-label="Response">
            <span style={{ fontSize: 14, color: 'var(--mut2)', fontWeight: 600 }}>{loading || !list.length ? '' : 'Pick a response to read it.'}</span>
          </section>
        ))}
      </div>
      {narrow && detail && <Sheet open onClose={() => setActive(null)} label="Response" style={{ width: 'min(640px, 100vw)' }}>{detail}</Sheet>}
      {confirmNode}
    </div>
  )
}
