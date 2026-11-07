'use client'

// Forms on the phone (handoff §6: read new responses here; the builder stays on
// desktop). All forms and Archived are full-bleed rows: the form, how many
// responses it has and how many are new, its folder and where it stands. A row
// opens its responses, the one thing a phone is for here; its ⋯ holds every
// action the desktop menu has (Open builder, Preview, Copy link, Rename,
// Duplicate, Move to folder, Save as template, Close, Archive, Delete) and the
// folder picker the desktop row's folder chip opens.

import React from 'react'
import Link from 'next/link'
import { SlabSub } from '@/app/components/AppSlab'
import { PhoneIcon } from '@/app/components/phone/icons'
import { openActionSheet, type ActionSheetOption } from '@/lib/phone/ui-store'
import type { Folder, FormSummary } from '@/lib/forms/api'
import type { MenuItem, TagTone } from './ui'
import { FolderGlyph } from './ui/FolderGlyph'
import { formLabel, formStatusTag } from './status'
import { ScrollRow } from '@/app/components/ScrollRow'

const TONE: Record<TagTone, string> = { neutral: 'none', plain: 'none', lime: 'ok', 'lime-bg': 'ok', gold: 'today', 'gold-bg': 'today', coral: 'fail' }

export function StatusTag({ f }: { f: FormSummary }) {
  const t = formStatusTag(f)
  return <span className="ph-tag" data-tone={TONE[t.tone]} title={t.title} data-testid="form-state">{t.label}</span>
}

/** A Forms menu, as the phone's action sheet. */
export function menuSheet(title: string, items: MenuItem[], extra: ActionSheetOption[] = []) {
  const real = items.filter((it): it is Exclude<MenuItem, { sep: true }> => !('sep' in it))
  openActionSheet(title, [...extra, ...real.map(it => ({ label: it.label, current: it.checked, danger: it.danger, disabled: it.disabled, onPick: it.run }))])
}

const TILE_TINTS = ['var(--lime-bg)', 'var(--gold-bg)', 'var(--blu-bg)', 'var(--pur-bg)', 'var(--neu-bg)']
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? 'F') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase()
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function FormRow({ f, i, folder, onMenu, menuLabel, sub }: {
  f: FormSummary; i: number; folder: Folder | null; onMenu: () => void; menuLabel: string; sub?: string
}) {
  const label = formLabel(f)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', borderBottom: '1px solid var(--line)' }} data-testid="form-row" data-form-id={f.id}>
      <Link href={`/forms/responses?form=${f.id}`} className="ph-row" data-lead="tile" style={{ borderBottom: 0, paddingRight: 4 }} aria-label={`${label}: ${plural(f.completedCount, 'response')}${f.unreadCount ? `, ${f.unreadCount} new` : ''}`} data-testid="form-responses-link">
        <span className="ph-mono" aria-hidden style={{ background: TILE_TINTS[i % TILE_TINTS.length], fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx)' }}>{initials(label)}</span>
        <span className="ph-row-main">
          <span className="ph-row-title" data-strong="" style={{ display: 'block' }} data-testid="form-title">{label}</span>
          {f.name && f.name !== f.title ? <span className="ph-row-sub" style={{ display: 'block' }}>“{f.title}”</span> : null}
          <span className="ph-row-sub" style={{ display: 'block' }}>{sub ?? `${plural(f.completedCount, 'response')} · ${plural(f.pages, 'page')} · ${plural(f.fields, 'field')}`}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginTop: 6 }}>
            <StatusTag f={f} />
            {folder ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }} data-testid="form-folder"><FolderGlyph color={folder.color} size={15} />{folder.name}</span> : null}
          </span>
        </span>
        <span className="ph-row-side">
          {f.unreadCount > 0 ? <span className="ph-tag" data-tone="over" data-testid="form-unread">{f.unreadCount} new</span> : null}
        </span>
      </Link>
      <button type="button" aria-label={menuLabel} onClick={onMenu} data-testid="form-menu"
        style={{ border: 0, background: 'transparent', color: 'var(--tx)', display: 'grid', placeItems: 'center', cursor: 'pointer', minHeight: 44 }}>
        <PhoneIcon name="more-horizontal" size={19} />
      </button>
    </div>
  )
}

type Filter = 'all' | 'live' | 'draft' | 'closed'

export function PhoneFormsList({ forms, inScope, counts, filter, setFilter, q, setQ, loading, error, onRetry, folder, folderId, folders, folderOf, onMenu, onPageMenu, onFolder, empty }: {
  forms: FormSummary[]; inScope: number
  counts: Record<Filter, number>; filter: Filter; setFilter: (f: Filter) => void
  q: string; setQ: (v: string) => void
  loading: boolean; error: string | null; onRetry: () => void
  folder: Folder | null; folderId: string | null; folders: Folder[]; folderOf: (id: string | null) => Folder | null
  onMenu: (f: FormSummary) => void; onPageMenu: () => void; onFolder: (id: string | null) => void
  empty: React.ReactNode
}) {
  const newN = forms.reduce((n, f) => n + f.unreadCount, 0)
  const pickFolder = () => openActionSheet('Show', [
    { label: 'All forms', current: !folderId, onPick: () => onFolder(null) },
    ...folders.map(fl => ({ label: `${fl.name} · ${fl.formCount}`, current: fl.id === folderId, onPick: () => onFolder(fl.id) })),
  ])
  const chips: { k: Filter; label: string }[] = [{ k: 'all', label: 'All' }, { k: 'live', label: 'Live' }, { k: 'draft', label: 'Draft' }, { k: 'closed', label: 'Closed' }]
  return (
    <div className="ph-page" data-testid="forms-home">
      <SlabSub>{loading ? 'Reading…' : `${plural(inScope, 'form')}${newN ? ` · ${newN} new` : ''}`}</SlabSub>
      <div className="ph-bar-row">
        <label className="ph-search">
          <PhoneIcon name="search" size={17} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={folder ? 'Search this folder' : 'Search forms'} aria-label={folder ? 'Search this folder' : 'Search forms'} />
          {q ? <button type="button" aria-label="Clear search" onClick={() => setQ('')} style={clearS}><PhoneIcon name="x" size={16} /></button> : null}
        </label>
        <button type="button" className="ph-btn" data-flat="" aria-label="New form" onClick={onPageMenu} style={{ width: 44, padding: 0, flex: 'none' }} data-testid="new-form-menu"><PhoneIcon name="plus" size={19} /></button>
      </div>
      <ScrollRow className="ph-filters" role="toolbar" aria-label="Filter forms" data-testid="forms-filter">
        {chips.map(c => (
          <button key={c.k} type="button" className="ph-chip" aria-pressed={filter === c.k} onClick={() => setFilter(c.k)}>{c.label}<span className="n">{counts[c.k]}</span></button>
        ))}
        {folders.length ? (
          <button type="button" className="ph-chip" aria-pressed={!!folderId} onClick={pickFolder} data-testid="folder-filter">
            {folder ? <FolderGlyph color={folder.color} size={15} /> : null}{folder ? folder.name : 'Folders'}<PhoneIcon name="chevron-down" size={15} />
          </button>
        ) : null}
      </ScrollRow>
      {error ? <div role="alert" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: 'var(--coral-tx)', borderBottom: '1px solid var(--line)' }}>Couldn’t load forms: {error} <button type="button" onClick={onRetry} style={linkS}>Retry</button></div> : null}
      {loading ? <div className="ph-empty">Reading your forms…</div> : forms.length === 0 ? empty : (
        <section aria-label="Forms">
          <div className="ph-group-head" data-under-filters="">Last edited first<span className="n">{forms.length}</span></div>
          {forms.map((f, i) => <FormRow key={f.id} f={f} i={i} folder={folderOf(f.folderId)} onMenu={() => onMenu(f)} menuLabel={`Actions for ${formLabel(f)}`} />)}
        </section>
      )}
      <p style={{ margin: 0, padding: '14px 20px', fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>Tap a form to read its responses. ⋯ holds the rest: preview, link, rename, folder, templates, archive. Building a form is on desktop.</p>
    </div>
  )
}

const clearS: React.CSSProperties = { border: 0, background: 'transparent', color: 'var(--mut)', display: 'grid', placeItems: 'center', width: 32, height: 32, cursor: 'pointer' }
export const linkS: React.CSSProperties = { border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: 'var(--tx)', textDecoration: 'underline', cursor: 'pointer', minHeight: 32 }
