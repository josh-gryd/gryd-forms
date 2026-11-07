'use client'

// A form's page on the phone (handoff §6: Forms reads responses on the phone;
// the form builder stays on desktop). Everything the builder's band answers
// without editing is here: where the form stands, its responses (and how many
// are new), its public link to copy or open, and Preview. Building, logic,
// design, publishing and the form's settings are desktop work, said plainly,
// with the form's pages and questions read-only underneath.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { componentDef, isInputBlock, type FormDefinition } from '@/lib/forms-core/index'
import { publicFormUrl, type FormDetail } from '@/lib/forms/api'
import OnDesktop from '@/app/components/phone/OnDesktop'
import PhoneSheet from '@/app/components/phone/Sheet'
import { PhoneIcon } from '@/app/components/phone/icons'
import { setJumpSub } from '@/lib/phone/place'
import { FormRunner } from '../render/FormRunner'
import { useToast } from '../ui'
import { formStatusTag } from '../status'

const TONE: Record<string, string> = { neutral: 'none', plain: 'none', lime: 'ok', 'lime-bg': 'ok', gold: 'today', 'gold-bg': 'today', coral: 'fail' }

/** The Share tab's one line on whether the link takes responses. */
function availability(d: FormDetail): string {
  const live = d.live !== null
  if (!live) return 'Nothing is public until you publish.'
  if (d.status === 'closed') return 'Closed to new responses — visitors see the closed message.'
  if (d.availability === 'scheduled') return 'Published, and opens at the time set in Settings.'
  if (d.availability === 'closed') return d.closedReason === 'limit' ? 'Closed: the response limit is reached.' : 'Closed: the closing time has passed.'
  return `Taking responses${d.ops.access === 'restricted' ? ' from signed-in people' : ''}${d.ops.hasPassword ? ', behind a password' : ''}.`
}

export default function PhoneFormDesk({ detail: d, def, initialPreview = false }: { detail: FormDetail; def: FormDefinition; initialPreview?: boolean }) {
  const { toast } = useToast()
  // ?preview=1 (the list menu's Preview) opens on the preview, as on desktop.
  const [preview, setPreview] = useState(initialPreview)
  const [shut, setShut] = useState(false)
  const live = d.live !== null
  const url = publicFormUrl(d.slug)
  const st = formStatusTag({ publishState: d.publishState, availability: d.availability, closedReason: d.closedReason })
  const closePreview = () => { setShut(true); setTimeout(() => setPreview(false), 300) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast({ msg: 'Link copied.', stamp: 'COPIED' }) }
    catch { toast({ msg: 'Couldn’t copy — select the text and copy it yourself.', tone: 'coral' }) }
  }
  const previewTransport = { submit: async () => ({ submissionId: 'preview', endingId: def.endings[0]?.id ?? '' }), uploads: null }
  const pages = def.pages.filter(p => p.blocks.length > 0)
  const title = def.title || 'Untitled form'
  useEffect(() => {
    const path = `/forms/${d.id}`
    setJumpSub(path, `${title}${d.unreadCount ? ` · ${d.unreadCount} new` : ''}`)
    return () => setJumpSub(path, null)
  }, [d.id, title, d.unreadCount])

  return (
    <div className="ph-page" data-testid="ph-form">
      <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', alignItems: 'center', gap: 6, padding: 'calc(var(--ph-safe-top) + 8px) 16px 12px 6px', background: 'var(--lime-bg)', color: 'var(--tx)', borderBottom: '2px solid var(--ink)' }} data-testid="builder-band">
        <Link href="/forms" aria-label="Back to Forms" data-testid="back" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'var(--tx)' }}><PhoneIcon name="chevron-left" size={26} /></Link>
        <h1 style={{ margin: 0, font: '800 26px/1.15 var(--font-band)', letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="form-title">{def.title || 'Untitled form'}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
        <span className="ph-tag" data-tone={TONE[st.tone]} title={st.title} data-testid="publish-state">{st.label}</span>
        <span style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.45 }}>{availability(d)}</span>
      </div>

      <Link href={`/forms/responses?form=${encodeURIComponent(d.id)}`} className="ph-row" data-lead="none" data-testid="band-responses">
        <span className="ph-row-main">
          <span className="ph-row-title" data-strong="" style={{ display: 'block' }}>Responses</span>
          <span className="ph-row-sub" style={{ display: 'block' }}>{d.completedCount} response{d.completedCount === 1 ? '' : 's'}{d.unreadCount ? ` · ${d.unreadCount} new` : ''}</span>
        </span>
        <span className="ph-row-side" style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
          {d.unreadCount > 0 ? <span className="ph-tag" data-tone="over" data-testid="responses-unread">{d.unreadCount} new</span> : null}
          <PhoneIcon name="chevron-right" size={18} />
        </span>
      </Link>

      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'grid', gap: 10 }} data-testid="share-url">
        <span className="ph-label">Public link</span>
        <span style={{ font: '400 13.5px var(--font-mono)', color: live ? 'var(--tx)' : 'var(--mut)', overflowWrap: 'anywhere' }}>{url}</span>
        {live ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="ph-btn" onClick={() => void copy()} data-testid="share-copy"><PhoneIcon name="copy" size={16} />Copy link</button>
            <a className="ph-btn" href={url} target="_blank" rel="noreferrer" data-testid="share-open"><PhoneIcon name="external-link" size={16} />Open</a>
          </div>
        ) : <span style={{ fontSize: 13.5, color: 'var(--mut)' }}>Publish to get a link. Publishing is on desktop, in the builder.</span>}
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <button type="button" className="ph-btn" onClick={() => { setShut(false); setPreview(true) }} style={{ width: '100%' }} data-testid="preview">See it as respondents do</button>
      </div>

      <OnDesktop what="The form builder" here={[['Read responses', `/forms/responses?form=${encodeURIComponent(d.id)}`]]}>
        <p style={{ margin: '0 20px 4px', fontSize: 13.5, color: 'var(--mut)', lineHeight: 1.5 }}>Questions, logic, design, publishing, the share options (QR code, embed, link name) and the form’s settings are changed on a computer.</p>
        <div className="ph-label" style={{ padding: '18px 20px 6px' }}>Questions · read only</div>
        {pages.length === 0 ? <div style={{ padding: '6px 20px 16px', fontSize: 14, color: 'var(--mut)' }}>No questions yet.</div> : pages.map((p, pi) => (
          <section key={p.id} aria-label={p.name || `Page ${pi + 1}`}>
            {pages.length > 1 ? <div className="ph-group-head" style={{ position: 'static' }}>{p.name || `Page ${pi + 1}`}<span className="n">{p.blocks.filter(isInputBlock).length}</span></div> : null}
            {p.blocks.map(b => {
              const label = b.label || componentDef(b.type).label
              return (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 14.5, fontWeight: isInputBlock(b) ? 700 : 500, color: isInputBlock(b) ? 'var(--tx)' : 'var(--tx2)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{label}{b.required ? <span aria-label="required" style={{ color: 'var(--coral-tx)' }}> *</span> : null}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{componentDef(b.type).label}</span>
                </div>
              )
            })}
          </section>
        ))}
      </OnDesktop>

      {preview ? (
        <PhoneSheet open={!shut} onClose={closePreview} label={`Preview of ${def.title}`} detents={['large']} initial="large" flush
          header={
            <div className="ph-sheet-head" style={{ gridTemplateColumns: 'minmax(0,1fr) 44px' }}>
              <span style={{ minWidth: 0 }}>
                <span className="ph-sheet-title" style={{ display: 'block' }}>Preview</span>
                <span className="ph-sheet-sub" style={{ display: 'block' }}>Exactly what respondents see. Answers here aren’t saved.</span>
              </span>
              <button type="button" className="ph-close" aria-label="Exit preview" onClick={closePreview} data-testid="preview-exit"><PhoneIcon name="x" size={18} /></button>
            </div>
          }>
          <div data-testid="preview-mode" style={{ background: def.theme.bg }}>
            <FormRunner def={def} mode="preview" device="phone" transport={previewTransport} />
          </div>
        </PhoneSheet>
      ) : null}
    </div>
  )
}
