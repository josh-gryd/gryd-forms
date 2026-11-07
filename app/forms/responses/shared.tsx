'use client'

// What the Responses page's list and detail share: who a response is from,
// when it came in, its status, and how an answer is shown.

import React, { useEffect, useState } from 'react'
import { type ColumnDef, type ResponseSummary } from '@/lib/forms/api'
import { componentDef, SIGNATURE_W, SIGNATURE_H, type Block, type FormDefinition, type SignatureValue } from '@/lib/forms-core/index'
import { Input, Select, Tag } from '../ui'
import { SignatureStrokes, SIGNATURE_FONT } from '../render/registry'

export type StatusFilter = 'all' | 'completed' | 'partial'
export type Range = 'all' | '7' | '30' | '90'
export interface AnswerFilter { blockId: string; value: string }
export const PAGE = 50

/** A name question: first + last, or one "name" question that isn't a company's. */
const NAME = /\bname\b/i
const NOT_A_PERSON = /company|business|organi[sz]ation|team|brand|project|pet|product|event|file|user ?name/i
const FIRST = /\bfirst\b|\bgiven\b/i
const LAST = /\blast\b|\bfamily\b|\bsurname\b/i

export function nameFrom(pairs: Array<{ label: string; type?: string; text: string }>): string {
  const text = (p?: { text: string }) => (p?.text ?? '').trim()
  const first = pairs.find(p => (!p.type || p.type === 'short') && FIRST.test(p.label) && text(p))
  const last = pairs.find(p => (!p.type || p.type === 'short') && LAST.test(p.label) && text(p))
  if (first || last) return [text(first), text(last)].filter(Boolean).join(' ')
  const name = pairs.find(p => (!p.type || p.type === 'short') && NAME.test(p.label) && !NOT_A_PERSON.test(p.label) && text(p))
  return text(name)
}

export function emailFrom(pairs: Array<{ label: string; type?: string; text: string }>): string {
  const byType = pairs.find(p => p.type === 'email' && p.text.trim())
  if (byType) return byType.text.trim()
  const byText = pairs.find(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.text.trim()))
  return byText?.text.trim() ?? ''
}

/** A list row's two lines: who (name, else email) over their email — or, when
 *  there is no name and email to pair, over their first other answer, so rows
 *  from an anonymous form still tell apart. */
export function rowLines(pairs: Array<{ label: string; type?: string; text: string }>): { title: string; sub: string; subMono: boolean } {
  const name = nameFrom(pairs), email = emailFrom(pairs)
  if (name && email) return { title: name, sub: email, subMono: true }
  const title = name || email
  // Not a piece of the name again (a first name under "First Last").
  const other = pairs.map(p => p.text.trim()).find(t => t && !title.includes(t))
  return { title: title || 'Anonymous response', sub: other ?? '', subMono: false }
}

export function pairsOf(r: ResponseSummary, columns: ColumnDef[]): Array<{ label: string; type: string; text: string }> {
  return columns.map(c => ({ label: c.label, type: c.type, text: r.cells[c.id] ?? '' }))
}

/** "16h ago" today and yesterday, then "Sep 24" (with the year once it isn't this one). */
export function whenShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  const d = new Date(t)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

/** "Sep 25, 5:41 PM". */
export function whenLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

export function StatusTag({ status, testId }: { status: ResponseSummary['status']; testId?: string }) {
  if (status === 'completed') return <Tag tone="lime-bg" testId={testId}>Completed</Tag>
  if (status === 'spam') return <Tag tone="coral" testId={testId}>Spam</Tag>
  return <Tag tone="gold-bg" testId={testId}>Partial</Tag>
}

export function buildQuery(o: { filter: StatusFilter; q: string; range: Range; filters: AnswerFilter[]; sort: 'submitted_desc' | 'submitted_asc'; offset: number }): string {
  const p = new URLSearchParams()
  p.set('status', o.filter); if (o.q.trim()) p.set('q', o.q.trim())
  if (o.range !== 'all') { const d = new Date(Date.now() - Number(o.range) * 86400000); p.set('since', d.toISOString()) }
  if (o.filters.length) p.set('filters', JSON.stringify(o.filters))
  p.set('sort', o.sort); p.set('offset', String(o.offset)); p.set('limit', String(PAGE))
  return p.toString()
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** Ignore list keys while someone is typing or a dialog is up. */
export function typingOrDialog(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return true
  return !!document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')
}

export function FilterValue({ def, blockId, value, onChange }: { def: FormDefinition; blockId: string; value: string; onChange: (v: string) => void }) {
  const block = def.pages.flatMap(p => p.blocks).find(b => b.id === blockId)
  if (block && block.options.length) return <Select value={value} onChange={e => onChange(e.target.value)} aria-label="Value"><option value="">Choose…</option>{block.options.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}</Select>
  if (block && (block.type === 'yesno' || block.type === 'switch')) return <Select value={value} onChange={e => onChange(e.target.value)} aria-label="Value"><option value="">Choose…</option><option value="Yes">Yes</option><option value="No">No</option></Select>
  return <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Contains…" aria-label="Value" autoFocus />
}

export function answerText(block: Block, value: unknown): string {
  try { return componentDef(block.type).display(block, value as never) } catch { return '' }
}

/** A very long answer is shown in part until asked for, so one essay can't push
 *  every later answer screens down (QA 2026-09-24). Short answers are untouched. */
const LONG_ANSWER = 600

export function AnswerText({ text, mono }: { text: string; mono: boolean }) {
  const [open, setOpen] = React.useState(false)
  const long = text.length > LONG_ANSWER
  const shown = long && !open ? `${text.slice(0, LONG_ANSWER).replace(/\s+\S*$/, '')}…` : text
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
      <span className={mono ? 'fb-mono' : undefined} style={{ fontSize: mono ? 14 : 15.5, fontWeight: 600, lineHeight: 1.5, color: text ? 'var(--tx)' : 'var(--mut2)', textWrap: 'pretty', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } as React.CSSProperties}>{shown || '—'}</span>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="answer-expand"
          style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 800, color: 'var(--tx)', textDecoration: 'underline', textDecorationThickness: 2, cursor: 'pointer' }}>
          {open ? 'Show less' : `Show all · ${text.length.toLocaleString('en-US')} characters`}
        </button>
      )}
    </span>
  )
}

/** A signature as the respondent left it: the drawing itself, or the typed name. */
export function SignatureView({ value }: { value: SignatureValue }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="answer-signature" data-kind={value.kind}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mut2)' }}>{value.kind === 'typed' ? 'Typed signature' : 'Drawn signature'}</span>
      {value.kind === 'typed'
        ? <span style={{ fontFamily: SIGNATURE_FONT, fontStyle: 'italic', fontSize: 26, lineHeight: 1.25, color: 'var(--tx)', overflowWrap: 'anywhere' }}>{value.name}</span>
        : <svg viewBox={`0 0 ${SIGNATURE_W} ${SIGNATURE_H}`} role="img" aria-label="Drawn signature" style={{ display: 'block', width: '100%', maxWidth: 340, aspectRatio: `${SIGNATURE_W} / ${SIGNATURE_H}`, border: '1.5px solid var(--line2)', borderRadius: 8, background: 'var(--card)' }}>
            <SignatureStrokes strokes={value.strokes} color="var(--tx)" />
          </svg>}
    </div>
  )
}
