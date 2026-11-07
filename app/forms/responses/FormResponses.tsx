'use client'

// One form's responses, on the Responses page (?form=<id>)
// 09-26: a toolbar (search · Responses / Summary · All / Completed / Partial ·
// when · Mark all read) over the list and the open response side by side, and
// Export CSV and Edit form in the band. ↑/↓ (or J/K) move through the list;
// opening a response marks it read. Summary is basic reporting over the form.
// Narrower than 1100 px the list takes the width and a response opens in a sheet.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SlabAction } from '@/app/components/AppSlab'
import { formsApi, formsChanged, publicFormUrl, type FormDetail, type ResponseList as List } from '@/lib/forms/api'
import { Btn, Seg, SearchBox, Select, EmptyState, Sheet, Confirm, Dialog, useToast, useMediaQuery } from '../ui'
import { Icon } from '../ui/icons'
import SummaryView from './SummaryView'
import ResponseList, { type ListItem } from './ResponseList'
import ResponseDetail, { type DetailNav } from './ResponseDetail'
import { FilterValue, buildQuery, pairsOf, rowLines, typingOrDialog, useDebounced, type AnswerFilter, type Range, type StatusFilter } from './shared'
import { usePhone } from '@/lib/phone/use-phone'
import { openActionSheet } from '@/lib/phone/ui-store'
import { formStatusTag, formLabel as formLabelOf } from '../status'
import { MoreButton, PhoneResponseRows, RangeChip, SearchRow } from './PhoneResponses'
import { ScrollRow } from '@/app/components/ScrollRow'

type Sort = 'submitted_desc' | 'submitted_asc'

/** `onChanged` runs after something the page's counts depend on changes (a response read or deleted).
 *  `initial` is the page URL's response and view, read by the page rather than from the window mid-navigation. */
export default function FormResponses({ form, onChanged, initial }: { form: FormDetail; onChanged: () => void; initial: { response: string | null; view: 'table' | 'summary' } }) {
  const { toast } = useToast()
  const formId = form.id
  const narrow = useMediaQuery('(max-width: 1100px)')
  const narrowRef = useRef(narrow); narrowRef.current = narrow
  const [view, setView] = useState<'table' | 'summary'>(initial.view)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [range, setRange] = useState<Range>('all')
  const [filters, setFilters] = useState<AnswerFilter[]>([])
  const [sort, setSort] = useState<Sort>('submitted_desc')
  const [data, setData] = useState<List | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(initial.response)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addFilter, setAddFilter] = useState<AnswerFilter | null>(null)
  const [summaryKey, setSummaryKey] = useState(0)
  const firstLoad = useRef(true)
  const loads = useRef(0)
  const activeRef = useRef(active); activeRef.current = active
  // The response the page opened by itself (the newest, or the next after a delete). It stays
  // unread until someone picks it — arriving on the page is not reading anything.
  const auto = useRef<string | null>(null)
  const [opened, setOpened] = useState(0)
  const query = useMemo(() => buildQuery({ filter, q: dq, range, filters, sort, offset: 0 }), [filter, dq, range, filters, sort])

  const load = useCallback(async (keep?: string | null) => {
    // Only the latest load lands: a quick run of filter changes can't finish out of order.
    const mine = ++loads.current
    setLoading(true)
    try {
      const r = await formsApi.responses(formId, query)
      if (mine !== loads.current) return
      setData(r); setError(null)
      const want = keep !== undefined ? keep : activeRef.current
      const first = firstLoad.current
      firstLoad.current = false
      // The first load opens the linked response (someone asked for it); after that, keep what is open.
      if (first && want) { auto.current = null; setActive(want); return }
      if (!first && want && r.rows.some(x => x.id === want)) { setActive(want); return }
      // Else the newest — not on a narrow screen, where opening one means a sheet over the list.
      const newest = narrowRef.current ? null : r.rows[0]?.id ?? null
      auto.current = newest
      setActive(newest)
    } catch (err) { if (mine === loads.current) setError((err as Error).message) }
    finally { if (mine === loads.current) setLoading(false) }
  }, [formId, query])
  useEffect(() => { void load() }, [load])

  const more = useCallback(async (): Promise<string[]> => {
    if (!data) return []
    setLoadingMore(true)
    try {
      const r = await formsApi.responses(formId, buildQuery({ filter, q: dq, range, filters, sort, offset: data.rows.length }))
      const seen = new Set(data.rows.map(x => x.id))
      const added = r.rows.filter(x => !seen.has(x.id))
      setData(d => d && { ...d, rows: [...d.rows, ...added], total: r.total, counts: r.counts })
      return added.map(x => x.id)
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }); return [] }
    finally { setLoadingMore(false) }
  }, [data, formId, filter, dq, range, filters, sort, toast])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (active && active !== auto.current) url.searchParams.set('r', active); else url.searchParams.delete('r')
    if (view === 'summary') url.searchParams.set('view', 'summary'); else url.searchParams.delete('view')
    window.history.replaceState(null, '', url.toString())
  }, [active, view, opened])

  // Opening a response reads it: the list, the sidebar and the picker lose one unread.
  useEffect(() => {
    if (!active || active === auto.current) return
    const row = data?.rows.find(r => r.id === active)
    if (row && (row.readAt || row.status !== 'completed')) return
    formsApi.markRead({ ids: [active], read: true }).then(res => {
      if (!res.changed) return
      setData(d => d && { ...d, rows: d.rows.map(r => (r.id === active ? { ...r, readAt: new Date().toISOString() } : r)) })
      formsChanged(); onChanged()
    }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, opened])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const idx = active ? rows.findIndex(r => r.id === active) : -1
  const total = data?.total ?? 0
  const go = useCallback(async (step: 1 | -1) => {
    let to: string | undefined
    if (step === -1) to = idx > 0 ? rows[idx - 1].id : undefined
    else if (idx === -1) to = rows[0]?.id
    else if (idx + 1 < rows.length) to = rows[idx + 1].id
    else if (rows.length < total) to = (await more())[0]
    if (to) { auto.current = null; setActive(to) }
  }, [idx, rows, total, more])
  const nav: DetailNav = { index: idx, total, prev: idx > 0 ? () => void go(-1) : undefined, next: idx + 1 < rows.length || rows.length < total ? () => void go(1) : undefined }
  useEffect(() => {
    if (view !== 'table') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingOrDialog(e)) return
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') { e.preventDefault(); void go(-1) }
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') { e.preventDefault(); void go(1) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, view])

  const items: ListItem[] = useMemo(() => rows.map(r => ({
    id: r.id, ...rowLines(pairsOf(r, data?.columns ?? [])), when: r.submittedAt ?? r.lastActivityAt, status: r.status, unread: r.status === 'completed' && !r.readAt, edited: !!r.editedAt,
  })), [rows, data])

  const hasFilters = filter !== 'all' || !!dq.trim() || range !== 'all' || filters.length > 0
  const clearFilters = () => { setFilter('all'); setQ(''); setRange('all'); setFilters([]) }
  const counts = data?.counts
  const columns = data?.columns ?? []

  const doDelete = async (id: string) => {
    setBusy(true)
    try {
      await formsApi.deleteResponse(formId, id)
      toast({ msg: 'Response deleted.' })
      const next = rows[idx + 1]?.id ?? rows[idx - 1]?.id ?? null
      setConfirm(null)
      auto.current = next
      await load(next); formsChanged(); onChanged(); setSummaryKey(k => k + 1)
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) } finally { setBusy(false) }
  }
  const markUnread = async (id: string) => {
    try {
      await formsApi.markRead({ ids: [id], read: false })
      setData(d => d && { ...d, rows: d.rows.map(r => (r.id === id ? { ...r, readAt: null } : r)) })
      formsChanged(); onChanged(); toast({ msg: 'Marked as unread.' })
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const markAll = async () => {
    try {
      await formsApi.markRead({ formId })
      setData(d => d && { ...d, rows: d.rows.map(r => (r.readAt || r.status !== 'completed' ? r : { ...r, readAt: new Date().toISOString() })) })
      formsChanged(); onChanged(); toast({ msg: 'Every response marked as read.' })
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const exportCsv = () => { window.location.assign(formsApi.csvUrl(formId, query)) }
  const select = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) { window.open(`/forms/responses?form=${encodeURIComponent(formId)}&r=${encodeURIComponent(id)}`, '_blank', 'noopener'); return }
    auto.current = null
    setActive(id); setOpened(n => n + 1)
  }

  const detail = active ? <ResponseDetail key={active} formId={formId} rid={active} nav={nav} onDelete={setConfirm} onMarkUnread={id => void markUnread(id)} onClose={narrow ? () => setActive(null) : undefined} /> : null
  const noneYet = !!data && data.counts.total === 0 && !hasFilters
  const live = form.live !== null

  const confirmNode = <Confirm open={!!confirm} title="Delete this response?" body="This can’t be undone. Uploaded files are removed too." busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && void doDelete(confirm)} />

  // The phone: where the form stands, then Responses / Summary; the list's
  // filters in one row (the answer filter is a dialog rather than a popover);
  // Export CSV, Edit form and Mark all read under ⋯. A response is a sheet.
  const phone = usePhone()
  const router = useRouter()
  if (phone) {
    const st = formStatusTag(form)
    const tone = st.tone === 'lime' ? 'ok' : st.tone === 'coral' ? 'fail' : st.tone === 'gold' ? 'today' : 'none'
    const moreMenu = () => openActionSheet(formLabelOf(form), [
      { label: 'Export CSV', disabled: !total, onPick: exportCsv },
      { label: 'Mark all read', disabled: !form.unreadCount, onPick: () => void markAll() },
      { label: 'Edit form', onPick: () => router.push(`/forms/${formId}`) },
    ])
    return (
      <div data-testid="results-tab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px 10px 20px', borderBottom: '1px solid var(--line)' }} data-testid="ph-form-state">
          <span className="ph-tag" data-tone={tone} title={st.title}>{st.label}</span>
          {form.archivedAt ? <span className="ph-tag" data-tone="none">Archived</span> : null}
          <span style={{ fontSize: 13, color: 'var(--mut)' }}>{form.completedCount} response{form.completedCount === 1 ? '' : 's'}{form.unreadCount ? ` · ${form.unreadCount} new` : ''}</span>
          <span style={{ marginLeft: 'auto' }}><MoreButton label="Export, edit form, mark all read" onClick={moreMenu} testId="ph-responses-more" /></span>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div className="ph-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} data-testid="view-table">Responses <span className="ph-n">{counts?.total ?? ''}</span></button>
            <button type="button" aria-pressed={view === 'summary'} onClick={() => setView('summary')} data-testid="view-summary">Summary</button>
          </div>
        </div>
        {error ? <div role="alert" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: 'var(--coral-tx)', borderBottom: '1px solid var(--line)' }}>{error} <Btn size="sm" onClick={() => void load()}>Retry</Btn></div> : null}
        {view === 'summary' ? <div style={{ padding: '4px 12px 16px' }}><SummaryView formId={formId} refreshKey={summaryKey} /></div> : (
          <>
            <SearchRow q={q} setQ={setQ} placeholder="Search any answer" />
            <ScrollRow className="ph-filters" role="toolbar" aria-label="Filter responses">
              {(['all', 'completed', 'partial'] as StatusFilter[]).map(k => (
                <button key={k} type="button" className="ph-chip" aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`filter-${k}`}>
                  {k === 'all' ? 'All' : k === 'completed' ? 'Completed' : 'Partial'}<span className="n">{counts ? (k === 'all' ? counts.total : counts[k]) : ''}</span>
                </button>
              ))}
              <RangeChip range={range} setRange={setRange} />
              <button type="button" className="ph-chip" disabled={!columns.length} onClick={() => setAddFilter({ blockId: columns[0]?.id ?? '', value: '' })} data-testid="add-filter">+ Filter</button>
              {filters.map((f, i) => {
                const col = columns.find(c => c.id === f.blockId)
                return <button key={i} type="button" className="ph-chip" aria-pressed="true" aria-label={`Remove filter ${col?.label ?? ''}`} onClick={() => setFilters(fs => fs.filter((_, j) => j !== i))} data-testid="filter-chip">{col?.label ?? 'Question'}: {f.value} ✕</button>
              })}
              {hasFilters ? <button type="button" className="ph-chip" onClick={clearFilters} data-testid="clear-filters" style={{ textDecoration: 'underline' }}>Clear filters</button> : null}
            </ScrollRow>
            <PhoneResponseRows items={items} loading={loading} shown={rows.length} total={total} onSelect={select} rowTestId="response-row"
              head={<button type="button" onClick={() => setSort(s => (s === 'submitted_desc' ? 'submitted_asc' : 'submitted_desc'))} data-testid="sort-submitted"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, border: 0, background: 'transparent', padding: 0, color: 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', cursor: 'pointer' }}>
                {sort === 'submitted_desc' ? 'Newest first' : 'Oldest first'}<Icon name={sort === 'submitted_desc' ? 'arrow-down' : 'arrow-up'} size={14} />
              </button>}
              onMore={rows.length < total ? () => void more() : null} loadingMore={loadingMore}
              empty={hasFilters
                ? <EmptyState title="No responses match." action={<Btn onClick={clearFilters}>Clear filters</Btn>} testId="results-empty-filtered" />
                : noneYet
                  ? <EmptyState title="No responses yet." body={live ? 'Share the link and responses show up here as they arrive.' : 'Publish the form to start collecting responses.'} action={live ? <Btn icon="copy" onClick={() => { void navigator.clipboard.writeText(publicFormUrl(form.slug)); toast({ msg: 'Link copied.', stamp: 'COPIED' }) }}>Copy link</Btn> : <Link href={`/forms/${formId}?tab=share`} className="fb-btn fb-btn--solid">Go to Share</Link>} testId="results-empty" />
                  : <span style={{ fontSize: 13, color: 'var(--mut2)' }}>Responses show up here as they arrive.</span>} />
          </>
        )}
        {view === 'table' && active ? <ResponseDetail formId={formId} rid={active} nav={nav} onDelete={setConfirm} onMarkUnread={id => void markUnread(id)} onClose={() => setActive(null)} /> : null}
        <Dialog open={!!addFilter} title="Filter by an answer" onClose={() => setAddFilter(null)} testId="filter-popover"
          actions={<><Btn onClick={() => setAddFilter(null)}>Cancel</Btn><Btn solid disabled={!addFilter?.blockId || !addFilter?.value.trim()} onClick={() => { if (addFilter && addFilter.blockId && addFilter.value.trim()) { setFilters(fs => [...fs, { blockId: addFilter.blockId, value: addFilter.value.trim() }]); setAddFilter(null) } }} testId="filter-apply">Add</Btn></>}>
          {addFilter ? (
            <>
              <Select value={addFilter.blockId} onChange={e => setAddFilter({ ...addFilter, blockId: e.target.value })} aria-label="Field">{columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
              <FilterValue def={form.draft} blockId={addFilter.blockId} value={addFilter.value} onChange={v => setAddFilter({ ...addFilter, value: v })} />
            </>
          ) : null}
        </Dialog>
        {confirmNode}
      </div>
    )
  }

  return (
    <div className="fb-rsp" data-testid="results-tab">
      <SlabAction>
        <Btn icon="download" onClick={exportCsv} disabled={!total} testId="export-csv" aria-label="Export CSV" title="Export CSV"><span className="fb-rsp-band-label">Export CSV</span></Btn>
        <Link href={`/forms/${formId}`} className="fb-btn" data-testid="responses-open-form" aria-label="Edit form" title="Edit form"><Icon name="pencil" size={15} /><span className="fb-rsp-band-label">Edit form</span></Link>
      </SlabAction>

      <div className="fb-rsp-toolbar">
        {view === 'table' && <SearchBox large value={q} onChange={setQ} placeholder="Search any answer" label="Search any answer" />}
        <Seg<'table' | 'summary'> size="lg" value={view} onChange={setView} label="View" options={[
          { value: 'table', label: <>Responses <span className="fb-rsp-n">{counts?.total ?? ''}</span></>, icon: 'table', testId: 'view-table' },
          { value: 'summary', label: 'Summary', icon: 'bar-chart', testId: 'view-summary' },
        ]} />
        {view === 'table' && <>
          <Seg<StatusFilter> size="lg" value={filter} onChange={setFilter} label="Response status" options={[
            { value: 'all', label: <>All <span className="fb-rsp-n">{counts?.total ?? ''}</span></>, testId: 'filter-all' },
            { value: 'completed', label: <>Completed <span className="fb-rsp-n">{counts?.completed ?? ''}</span></>, testId: 'filter-completed' },
            { value: 'partial', label: <>Partial <span className="fb-rsp-n">{counts?.partial ?? ''}</span></>, testId: 'filter-partial' },
          ]} />
          <label className="fb-rsp-range">
            <Icon name="calendar" size={16} />
            <Select value={range} onChange={e => setRange(e.target.value as Range)} aria-label="When" data-testid="range">
              <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
            </Select>
          </label>
          <div style={{ position: 'relative' }}>
            <Btn dashed icon="plus" onClick={() => setAddFilter(f => (f ? null : { blockId: columns[0]?.id ?? '', value: '' }))} disabled={!columns.length} testId="add-filter">Filter</Btn>
            {addFilter && (
              <form onSubmit={e => { e.preventDefault(); if (addFilter.blockId && addFilter.value.trim()) { setFilters(fs => [...fs, { blockId: addFilter.blockId, value: addFilter.value.trim() }]); setAddFilter(null) } }} className="fb-card fb-card--sm fb-rise" style={{ position: 'absolute', left: 0, top: 50, zIndex: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, width: 300 }} data-testid="filter-popover">
                <Select value={addFilter.blockId} onChange={e => setAddFilter({ ...addFilter, blockId: e.target.value })} aria-label="Field">{columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
                <FilterValue def={form.draft} blockId={addFilter.blockId} value={addFilter.value} onChange={v => setAddFilter({ ...addFilter, value: v })} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><Btn size="sm" ghost onClick={() => setAddFilter(null)}>Cancel</Btn><Btn size="sm" solid type="submit" testId="filter-apply">Add</Btn></div>
              </form>
            )}
          </div>
          {filters.map((f, i) => { const col = columns.find(c => c.id === f.blockId); return <span key={i} className="fb-tag fb-tag--gold-bg" style={{ height: 32, fontSize: 12.5, borderRadius: 8 }} data-testid="filter-chip">{col?.label ?? 'Question'}: {f.value}<button type="button" aria-label={`Remove filter ${col?.label ?? ''}`} onClick={() => setFilters(fs => fs.filter((_, j) => j !== i))} style={{ border: 0, background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'inherit' }}><Icon name="x" size={12} /></button></span> })}
          {hasFilters && <Btn ghost size="sm" onClick={clearFilters} testId="clear-filters">Clear filters</Btn>}
        </>}
        <Btn quiet icon="check" onClick={() => void markAll()} disabled={!form.unreadCount} testId="inbox-mark-all" aria-label="Mark all read" className="fb-rsp-push"><span className="fb-rsp-label">Mark all read</span></Btn>
      </div>

      {error && <div role="alert" className="fb-banner fb-banner--coral fb-banner--inline"><Icon name="alert" size={15} /> {error} <Btn size="sm" onClick={() => void load()}>Retry</Btn></div>}

      {view === 'summary' ? (
        <div className="fb-scroll" style={{ flex: 1, minHeight: 0 }}><SummaryView formId={formId} refreshKey={summaryKey} /></div>
      ) : (
        <div className="fb-rsp-panes">
          <ResponseList items={items} activeId={active} onSelect={select} rowTestId="response-row" loading={loading} shown={rows.length} total={total}
            head={<button type="button" className="fb-rsp-list__sort" onClick={() => setSort(s => (s === 'submitted_desc' ? 'submitted_asc' : 'submitted_desc'))} data-testid="sort-submitted">{sort === 'submitted_desc' ? 'Newest first' : 'Oldest first'}<Icon name={sort === 'submitted_desc' ? 'arrow-down' : 'arrow-up'} size={14} /></button>}
            onMore={rows.length < total ? () => void more() : null} loadingMore={loadingMore}
            empty={hasFilters
              ? <EmptyState title="No responses match." action={<Btn onClick={clearFilters}>Clear filters</Btn>} testId="results-empty-filtered" />
              : <span style={{ fontSize: 13, color: 'var(--mut2)' }}>Responses show up here as they arrive.</span>} />
          {!narrow && (detail ?? (
            <section className="fb-rsp-card fb-rsp-detail fb-rsp-detail--empty" aria-label="Response">
              {noneYet
                ? <EmptyState title="No responses yet." body={live ? 'Share the link and responses show up here as they arrive.' : 'Publish the form to start collecting responses.'} action={live ? <Btn icon="copy" onClick={() => { void navigator.clipboard.writeText(publicFormUrl(form.slug)); toast({ msg: 'Link copied.', stamp: 'COPIED' }) }}>Copy link</Btn> : <Link href={`/forms/${formId}?tab=share`} className="fb-btn fb-btn--solid">Go to Share</Link>} testId="results-empty" />
                : <span style={{ fontSize: 14, color: 'var(--mut2)', fontWeight: 600 }}>{loading || !rows.length ? '' : 'Pick a response to read it.'}</span>}
            </section>
          ))}
        </div>
      )}
      {narrow && view === 'table' && active && <Sheet open onClose={() => setActive(null)} label="Response" style={{ width: 'min(640px, 100vw)' }}>{detail}</Sheet>}
      {confirmNode}
    </div>
  )
}
