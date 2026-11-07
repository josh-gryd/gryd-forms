'use client'

// One response, open beside the list: who sent it and
// its status, where it sits in the list with up/down to move, when it came in,
// how long it took and where it ended, then every answer on its own row with a
// copy button. Answers are labelled from the version the respondent saw.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formsApi, type ResponseDetail as Detail } from '@/lib/forms/api'
import { componentDef, isInputBlock, answerPages, blockSettings, asSignature, type Block, type FileAnswer } from '@/lib/forms-core/index'
import { IconBtn, Menu, Skeleton, Tag, useToast, formatDuration, formatBytes, menuAnchor, type MenuAt, type MenuItem } from '../ui'
import { Icon } from '../ui/icons'
import { AnswerText, SignatureView, StatusTag, answerText, emailFrom, nameFrom, whenLong } from './shared'
import { usePhone } from '@/lib/phone/use-phone'
import RecordView from '@/app/components/phone/RecordView'
import { PhoneIcon } from '@/app/components/phone/icons'

export interface DetailNav { index: number; total: number; prev?: () => void; next?: () => void }

export default function ResponseDetail({ formId, rid, nav, formLink, onDelete, onMarkUnread, onClose }: {
  formId: string; rid: string; nav: DetailNav | null
  /** All forms: which form this came from, and a way into it. */
  formLink?: { title: string; href: string }
  onDelete: (id: string) => void
  onMarkUnread?: (id: string) => void
  /** In a sheet (narrow screens): the way back to the list. */
  onClose?: () => void
}) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const menuBtn = useRef<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    setDetail(null); setError(null)
    formsApi.response(formId, rid, '').then(d => { if (!cancelled) setDetail(d) }).catch(err => { if (!cancelled) setError((err as Error).message) })
    body.current?.scrollTo({ top: 0 })
    return () => { cancelled = true }
  }, [formId, rid])

  const groups = useMemo(() => {
    if (!detail) return []
    // Pages the respondent never reached are left out: a page shows when they visited it or answered on it.
    const visited = new Set(detail.pagesVisited)
    return answerPages(detail.definition)
      .map(p => ({ page: p, blocks: p.blocks.filter(b => isInputBlock(b) && b.type !== 'hidden') }))
      .filter(({ page, blocks }) => blocks.length > 0 && (visited.has(page.id) || Object.keys(detail.answers).some(id => blocks.some(b => b.id === id))))
  }, [detail])
  const hiddenFields = useMemo(() => detail ? detail.definition.pages.flatMap(p => p.blocks).filter(b => b.type === 'hidden' && detail.answers[b.id] !== undefined) : [], [detail])
  const pairs = useMemo(() => groups.flatMap(g => g.blocks).map(b => ({ label: b.label, type: b.type, text: detail ? answerText(b, detail.answers[b.id]) : '' })), [groups, detail])
  const name = detail ? (nameFrom(pairs) || emailFrom(pairs) || 'Anonymous response') : ''

  const copy = async (text: string, what = 'Copied.') => {
    try { await navigator.clipboard.writeText(text); toast({ msg: what, stamp: 'COPIED' }) } catch { toast({ msg: 'Couldn’t copy.', tone: 'coral' }) }
  }
  const copyText = (b: Block): string => {
    if (!detail) return ''
    const v = detail.answers[b.id]
    if (b.type === 'upload' && Array.isArray(v)) return (v as FileAnswer[]).map(f => f.name).join('\n')
    const sig = b.type === 'signature' ? asSignature(v) : null
    if (sig) return sig.kind === 'typed' ? sig.name : 'Drawn signature'
    return answerText(b, v)
  }
  const copyAll = () => {
    const lines: string[] = []
    for (const g of groups) for (const b of g.blocks) lines.push(b.label || componentDef(b.type).label, copyText(b) || '—', '')
    void copy(lines.join('\n').trim(), 'Answers copied.')
  }
  const items: MenuItem[] = [
    { label: 'Copy all answers', icon: 'copy', run: copyAll, testId: 'copy-answers' },
    // Only a sent response is ever read or unread.
    ...(onMarkUnread && detail?.summary.status === 'completed' ? [{ label: 'Mark as unread', icon: 'mail', run: () => onMarkUnread(rid), testId: 'detail-mark-unread' }] : []),
    { label: 'Open in a new tab', icon: 'external', run: () => window.open(`/forms/responses?form=${encodeURIComponent(formId)}&r=${encodeURIComponent(rid)}`, '_blank', 'noopener') },
    { sep: true },
    { label: 'Delete response', icon: 'trash', danger: true, run: () => onDelete(rid), testId: 'sheet-delete' },
  ]

  const s = detail?.summary
  const many = groups.length > 1

  // The phone (a record pushes in full-screen). Who and the status in the
  // header; the chips, every answer with its copy button, the hidden
  // fields and the technical details in the body; Previous · Copy all · More ·
  // Next pinned under it. More is the desktop ⋯ menu as an action sheet.
  const phone = usePhone()
  const [shut, setShut] = useState(false)
  // Previous / Next swap the response inside the open page: back to its top.
  const phBody = useRef<HTMLDivElement>(null)
  useEffect(() => { phBody.current?.closest('.ph-rec-body')?.scrollTo({ top: 0 }) }, [rid])
  if (phone) {
    const close = () => { setShut(true); setTimeout(() => onClose?.(), 300) }
    const iconBtn = (label: string, icon: React.ReactNode, onClick: (() => void) | undefined, testId: string, tone?: 'primary') => (
      <button type="button" aria-label={label} disabled={!onClick} onClick={onClick} data-testid={testId} data-tone={tone}>{icon}<span>{label}</span></button>
    )
    return (
      <RecordView open={!shut} onClose={close} label={name || 'Response'} flush
        header={
          <div className="ph-sheet-head" style={{ gridTemplateColumns: 'minmax(0,1fr) 44px' }} data-testid="response-detail" data-response-id={rid}>
            <span style={{ minWidth: 0 }}>
              {s ? <span className="ph-sheet-title" style={{ display: 'block' }} data-testid="sheet-name">{name}</span> : error ? <span role="alert" style={{ color: 'var(--coral-tx)', fontWeight: 700 }}>{error}</span> : <Skeleton width="60%" height={22} />}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
                {s ? <StatusTag status={s.status} testId="detail-status" /> : null}
                {nav ? <span className="ph-n" style={{ color: 'var(--mut)' }} data-testid="sheet-position">{nav.index >= 0 ? `${nav.index + 1} of ${nav.total}` : `— of ${nav.total}`}</span> : null}
              </span>
            </span>
            <button type="button" className="ph-close" aria-label="Close" onClick={close} data-testid="sheet-close"><PhoneIcon name="x" size={18} /></button>
          </div>
        }
        actionBar={
          <div className="ph-action-bar">
            {iconBtn('Previous', <PhoneIcon name="chevron-down" size={18} style={{ transform: 'rotate(180deg)' }} />, nav?.prev, 'sheet-prev')}
            {iconBtn('Copy all', <PhoneIcon name="copy" size={18} />, detail ? copyAll : undefined, 'copy-answers')}
            {iconBtn('More', <PhoneIcon name="more-horizontal" size={18} />, () => setMenu({ x: 16, y: 16 }), 'detail-menu')}
            {iconBtn('Next', <PhoneIcon name="chevron-down" size={18} />, nav?.next, 'sheet-next', 'primary')}
          </div>
        }>
        <div ref={phBody} data-testid="response-detail-body">
          {s ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 16px 14px', borderBottom: '1px solid var(--line)' }}>
              <span className="fb-rsp-chip" title={s.submittedAt ? 'Submitted' : 'Last activity'}><Icon name="clock" size={15} />{whenLong(s.submittedAt ?? s.lastActivityAt)}</span>
              {s.durationMs ? <span className="fb-rsp-chip">Took {formatDuration(s.durationMs)}</span> : null}
              {s.endingName
                ? <span className="fb-rsp-chip" data-testid="sheet-ending" title={detail?.endingRuleSentence ?? undefined}>Ending: {s.endingName}</span>
                : s.status === 'partial' ? <span className="fb-rsp-chip">Left at page {s.furthestPageIndex + 1}{s.furthestPageName ? ` · ${s.furthestPageName}` : ''}</span> : null}
              {s.editedAt && <span className="fb-rsp-chip" title="Changed by the respondent after sending"><Icon name="pencil" size={13} />Edited {whenLong(s.editedAt)}</span>}
              {s.respondent && <span className="fb-rsp-chip" data-testid="sheet-who"><Icon name="users" size={13} />Sent by {s.respondent}</span>}
              {s.flags.map(f => <span key={f} className="fb-rsp-chip fb-rsp-chip--gold">{f.replace(/_/g, ' ')}</span>)}
              {formLink && <Link href={formLink.href} className="fb-rsp-chip fb-rsp-chip--link" data-forms-root="" data-testid="detail-form-link" style={{ height: 36 }}><Icon name="file-text" size={13} />{formLink.title}</Link>}
            </div>
          ) : null}
          {!detail && !error ? <div style={{ padding: '14px 20px', color: 'var(--mut)' }}>Reading the response…</div> : null}
          {detail && groups.map(g => (
            <React.Fragment key={g.page.id}>
              {many ? <div className="ph-group-head" style={{ position: 'static', background: 'var(--inset)' }} data-testid="answer-group">{g.page.name}</div> : null}
              {g.blocks.map(b => {
                const v = detail.answers[b.id]
                const mono = b.type === 'email' || b.type === 'phone' || b.type === 'url'
                const files = b.type === 'upload' && Array.isArray(v) ? (v as FileAnswer[]) : null
                const sig = b.type === 'signature' ? asSignature(v) : null
                const text = copyText(b)
                return (
                  <div key={b.id} data-testid="answer-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 4, padding: '12px 4px 12px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, color: 'var(--mut)', overflowWrap: 'anywhere' }}>{b.label || componentDef(b.type).label}</span>
                      {files ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {files.length === 0 && <span style={{ color: 'var(--mut2)' }}>—</span>}
                          {files.map(f => { const rec = detail.files.find(x => x.id === f.fileId); return (
                            <div key={f.fileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1.5px solid var(--ink)', borderRadius: 10, background: 'var(--card)' }}>
                              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span><span style={{ fontSize: 12, color: 'var(--mut)' }}>{formatBytes(f.size)}{rec && rec.status !== 'uploaded' ? ` · ${rec.status}` : ''}</span></div>
                              {rec?.status === 'uploaded' ? <a className="ph-btn" href={formsApi.fileUrl(formId, f.fileId)} target="_blank" rel="noreferrer"><Icon name="download" size={14} /> Download</a> : <span className="ph-tag" data-tone="fail">Missing</span>}
                            </div>) })}
                        </div>
                      ) : sig ? <SignatureView value={sig} /> : <AnswerText key={`${rid}:${b.id}`} text={answerText(b, v)} mono={mono} />}
                    </div>
                    {text ? <button type="button" aria-label={`Copy ${b.label || 'answer'}`} onClick={() => void copy(text)} style={{ width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--mut)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><PhoneIcon name="copy" size={17} /></button> : <span />}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
          {detail && hiddenFields.length > 0 && (
            <>
              <div className="ph-group-head" style={{ position: 'static', background: 'var(--inset)' }}>Hidden fields</div>
              {hiddenFields.map(b => (
                <div key={b.id} style={{ display: 'grid', gap: 4, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mut)' }}>{b.label} <span className="fb-mono" style={{ fontWeight: 600 }}>?{blockSettings<{ paramName: string }>(b).paramName}</span></span>
                  <span className="fb-mono" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{String(detail.answers[b.id] ?? '')}</span>
                </div>
              ))}
            </>
          )}
          {detail && (
            <details style={{ padding: '14px 20px 20px' }}>
              <summary style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx2)', minHeight: 32, cursor: 'pointer' }}>Technical details</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: '6px 10px', paddingTop: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--mut)' }}>Form version</span><span className="fb-mono">v{s?.versionNumber}</span>
                <span style={{ color: 'var(--mut)' }}>Response id</span><span className="fb-mono" data-testid="sheet-id" style={{ overflowWrap: 'anywhere' }}>{rid}</span>
                <span style={{ color: 'var(--mut)' }}>Device</span><span className="fb-mono" style={{ overflowWrap: 'anywhere' }}>{s?.device || '—'}</span>
                <span style={{ color: 'var(--mut)' }}>Started</span><span className="fb-mono">{s?.startedAt}</span>
                {Object.entries(detail.metadata).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => <React.Fragment key={k}><span style={{ color: 'var(--mut)' }}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><span className="fb-mono" style={{ overflowWrap: 'anywhere' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</span></React.Fragment>)}
                {detail.events.length > 0 && <><span style={{ color: 'var(--mut)' }}>Events</span><span className="fb-mono" style={{ overflowWrap: 'anywhere' }}>{detail.events.map(e => `${e.kind} ${whenLong(e.at)}`).join(' · ')}</span></>}
              </div>
            </details>
          )}
        </div>
        {menu && <Menu at={menu} items={items} onClose={() => setMenu(null)} label="Response actions" />}
      </RecordView>
    )
  }

  return (
    <section className="fb-rsp-card fb-rsp-detail" aria-label="Response" data-testid="response-detail" data-response-id={rid}>
      <header className="fb-rsp-detail__head">
        <div className="fb-rsp-detail__top">
          {s ? <h2 className="fb-rsp-detail__name" title={name} data-testid="sheet-name">{name}</h2> : error ? <span role="alert" style={{ color: 'var(--coral-tx)', fontWeight: 700 }}>{error}</span> : <Skeleton width="45%" height={26} />}
          {s && <StatusTag status={s.status} testId="detail-status" />}
          <div style={{ flex: 1 }} />
          {nav && <span className="fb-rsp-detail__pos" data-testid="sheet-position">{nav.index >= 0 ? `${nav.index + 1} of ${nav.total}` : `— of ${nav.total}`}</span>}
          {nav && <IconBtn icon="chevron-up" label="Previous response" framed disabled={!nav.prev} onClick={() => nav.prev?.()} data-testid="sheet-prev" />}
          {nav && <IconBtn icon="chevron-down" label="Next response" framed disabled={!nav.next} onClick={() => nav.next?.()} data-testid="sheet-next" />}
          <IconBtn icon="ellipsis" label="More actions" onClick={e => { menuBtn.current = e.currentTarget; setMenu(menuAnchor(e.currentTarget)) }} data-testid="detail-menu" />
          {onClose && <IconBtn icon="x" label="Close" onClick={onClose} data-testid="sheet-close" />}
        </div>
        {s && (
          <div className="fb-rsp-chips">
            <span className="fb-rsp-chip" title={s.submittedAt ? 'Submitted' : 'Last activity'}><Icon name="clock" size={15} />{whenLong(s.submittedAt ?? s.lastActivityAt)}</span>
            {s.durationMs ? <span className="fb-rsp-chip">Took {formatDuration(s.durationMs)}</span> : null}
            {s.endingName
              ? <span className="fb-rsp-chip" data-testid="sheet-ending" title={detail?.endingRuleSentence ?? undefined}>Ending: {s.endingName}</span>
              : s.status === 'partial' ? <span className="fb-rsp-chip">Left at page {s.furthestPageIndex + 1}{s.furthestPageName ? ` · ${s.furthestPageName}` : ''}</span> : null}
            {s.editedAt && <span className="fb-rsp-chip" title="Changed by the respondent after sending"><Icon name="pencil" size={13} />Edited {whenLong(s.editedAt)}</span>}
            {s.respondent && <span className="fb-rsp-chip" data-testid="sheet-who"><Icon name="users" size={13} />Sent by {s.respondent}</span>}
            {s.flags.map(f => <span key={f} className="fb-rsp-chip fb-rsp-chip--gold">{f.replace(/_/g, ' ')}</span>)}
            {formLink && <Link href={formLink.href} className="fb-rsp-chip fb-rsp-chip--link" data-testid="detail-form-link"><Icon name="file-text" size={13} />{formLink.title}</Link>}
          </div>
        )}
      </header>

      <div ref={body} className="fb-rsp-detail__body fb-scroll">
        {!detail && !error && [0, 1, 2, 3].map(i => <div key={i} className="fb-rsp-answer"><Skeleton width="60%" /><Skeleton width="80%" /><span /></div>)}
        {detail && groups.map(g => (
          <React.Fragment key={g.page.id}>
            {many && <div className="fb-rsp-pagebreak" data-testid="answer-group">{g.page.name}</div>}
            {g.blocks.map(b => {
              const v = detail.answers[b.id]
              const mono = b.type === 'email' || b.type === 'phone' || b.type === 'url'
              const files = b.type === 'upload' && Array.isArray(v) ? (v as FileAnswer[]) : null
              const sig = b.type === 'signature' ? asSignature(v) : null
              const text = copyText(b)
              return (
                <div key={b.id} className="fb-rsp-answer" data-testid="answer-row">
                  <span className="fb-rsp-answer__label">{b.label || componentDef(b.type).label}</span>
                  <div style={{ minWidth: 0 }}>
                    {files ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {files.length === 0 && <span style={{ color: 'var(--mut2)' }}>—</span>}
                        {files.map(f => { const rec = detail.files.find(x => x.id === f.fileId); return (
                          <div key={f.fileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 10, background: 'var(--card)' }}>
                            <span style={{ width: 30, height: 30, border: '1.5px solid var(--ink)', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--inset)', flex: 'none' }}><Icon name="file" size={14} /></span>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span><span style={{ fontSize: 11.5, color: 'var(--mut2)' }}>{formatBytes(f.size)}{rec && rec.status !== 'uploaded' ? ` · ${rec.status}` : ''}</span></div>
                            {rec?.status === 'uploaded' ? <a className="fb-btn fb-btn--sm" href={formsApi.fileUrl(formId, f.fileId)} target="_blank" rel="noreferrer"><Icon name="download" size={13} /> Download</a> : <Tag tone="coral">Missing</Tag>}
                          </div>) })}
                      </div>
                    ) : sig ? <SignatureView value={sig} /> : <AnswerText key={`${rid}:${b.id}`} text={answerText(b, v)} mono={mono} />}
                  </div>
                  {text ? <IconBtn icon="copy" size="sm" label={`Copy ${b.label || 'answer'}`} onClick={() => void copy(text)} className="fb-rsp-answer__copy" /> : <span />}
                </div>
              )
            })}
          </React.Fragment>
        ))}
        {detail && hiddenFields.length > 0 && (
          <>
            <div className="fb-rsp-pagebreak">Hidden fields</div>
            {hiddenFields.map(b => (
              <div key={b.id} className="fb-rsp-answer">
                <span className="fb-rsp-answer__label">{b.label} <span className="fb-mono" style={{ fontWeight: 600 }}>?{blockSettings<{ paramName: string }>(b).paramName}</span></span>
                <span className="fb-mono" style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{String(detail.answers[b.id] ?? '')}</span>
                <span />
              </div>
            ))}
          </>
        )}
        {detail && (
          <details className="fb-details" style={{ padding: '14px 28px 20px' }}>
            <summary style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Technical details <Icon name="chevron-down" size={13} /></summary>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 10px', paddingTop: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--mut2)' }}>Form version</span><span className="fb-mono">v{s?.versionNumber}</span>
              <span style={{ color: 'var(--mut2)' }}>Response id</span><span className="fb-mono" data-testid="sheet-id">{rid}</span>
              <span style={{ color: 'var(--mut2)' }}>Device</span><span className="fb-mono">{s?.device || '—'}</span>
              <span style={{ color: 'var(--mut2)' }}>Started</span><span className="fb-mono">{s?.startedAt}</span>
              {Object.entries(detail.metadata).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => <React.Fragment key={k}><span style={{ color: 'var(--mut2)' }}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><span className="fb-mono" style={{ overflowWrap: 'anywhere' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</span></React.Fragment>)}
              {detail.events.length > 0 && <><span style={{ color: 'var(--mut2)' }}>Events</span><span className="fb-mono" style={{ overflowWrap: 'anywhere' }}>{detail.events.map(e => `${e.kind} ${whenLong(e.at)}`).join(' · ')}</span></>}
            </div>
          </details>
        )}
      </div>

      <footer className="fb-rsp-detail__foot">
        <span className="fb-kbd" aria-hidden="true">↑</span><span className="fb-kbd" aria-hidden="true">↓</span>
        <span>to move between responses. Opening one marks it read.</span>
      </footer>
      {menu && <Menu at={menu} items={items} onClose={() => setMenu(null)} label="Response actions" returnFocusTo={menuBtn.current} />}
    </section>
  )
}
