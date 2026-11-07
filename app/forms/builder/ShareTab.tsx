'use client'

// Share: the public link, publish / unpublish, the link name, a QR code and
// the embed snippet. Whether the link takes responses (and when, and for
// whom) lives in Settings. Autosave never touches the live version; only
// Publish does.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { publicFormUrl, embedSnippet } from '@/lib/forms/api'
import { Btn, Card, Field, Input, Tag } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder } from './context'

const STATE: Record<string, { label: string; tone: 'neutral' | 'lime' | 'gold' | 'coral' }> = { draft: { label: 'Draft', tone: 'neutral' }, live: { label: 'Live', tone: 'lime' }, dirty: { label: 'Unpublished edits', tone: 'gold' }, closed: { label: 'Closed', tone: 'coral' } }

export default function ShareTab() {
  const api = useBuilder()
  const d = api.detail
  const live = d.live !== null
  const url = publicFormUrl(d.slug)
  const [slug, setSlug] = useState(d.slug)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<{ png: string; svg: string } | null>(null)
  useEffect(() => { setSlug(d.slug) }, [d.slug])
  useEffect(() => {
    let cancelled = false
    const opts = { margin: 1, errorCorrectionLevel: 'M' as const, color: { dark: '#161616', light: '#ffffff' } } // print-color
    Promise.all([QRCode.toDataURL(url, { ...opts, width: 1024 }), QRCode.toString(url, { ...opts, type: 'svg' })])
      .then(([png, svg]) => { if (!cancelled) setQr({ png, svg }) })
      .catch(() => { if (!cancelled) setQr(null) })
    return () => { cancelled = true }
  }, [url])
  const download = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove() }
  const copy = async (text: string, msg: string) => { try { await navigator.clipboard.writeText(text); api.toast({ msg, stamp: 'COPIED' }) } catch { api.toast({ msg: 'Couldn’t copy — select the text and copy it yourself.', tone: 'coral' }) } }
  const state = STATE[d.publishState]
  return (
    <div className="fb-scroll fb-rise" style={{ flex: 1, minHeight: 0, padding: '66px 32px 48px', display: 'flex', justifyContent: 'center' }} data-testid="share-tab">
      <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h1 className="fb-h1" style={{ flex: 1 }}>Share</h1><Tag tone={state.tone} large>{state.label}</Tag></div>
        <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong style={{ fontSize: 15 }}>{live ? (d.publishState === 'closed' ? 'Closed to new responses' : 'Your form is live') : 'Publish to get a link'}</strong>
            <span style={{ fontSize: 13.5, color: 'var(--tx2)' }}>{live ? (d.publishState === 'dirty' ? 'The link serves the last published version. Publish to update it.' : d.publishState === 'closed' ? (d.unpublishedChanges ? 'Visitors see the closed message. You have edits that are not published yet.' : 'Visitors see the closed message. Existing responses stay.') : `Version ${d.live!.number}, published ${new Date(d.live!.publishedAt).toLocaleString()}.`) : 'Anyone with the link can respond once you publish.'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, height: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 10, background: live ? 'var(--input)' : 'var(--inset)', fontFamily: 'var(--font-mono)', fontSize: 13, color: live ? 'var(--tx)' : 'var(--mut2)', overflow: 'hidden', whiteSpace: 'nowrap' }} data-testid="share-url"><Icon name="link" size={14} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</span></div>
            <Btn icon="copy" disabled={!live} onClick={() => copy(url, 'Link copied.')} testId="share-copy">Copy link</Btn>
            <a className="fb-btn" href={live ? url : undefined} target="_blank" rel="noreferrer" aria-disabled={!live} style={{ opacity: live ? 1 : .5, pointerEvents: live ? 'auto' : 'none' }} data-testid="share-open"><Icon name="external" size={14} /> Open</a>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn solid onClick={() => void api.publish()} disabled={api.brokenRules.length > 0} title={api.brokenRules.length ? 'Fix the broken rules in Logic first' : undefined} testId="share-publish">{d.publishState === 'dirty' || (d.publishState === 'closed' && d.unpublishedChanges) ? 'Publish changes' : live ? 'Published' : 'Publish'}</Btn>
            {live && <Btn ghost onClick={() => void api.unpublish()} testId="share-unpublish">Unpublish</Btn>}
            <span style={{ fontSize: 12.5, color: 'var(--mut2)' }} data-testid="share-publish-hint">{d.publishState === 'closed' ? 'Publishing updates the form and keeps it closed. Accept responses, in Settings › Availability, is what reopens it.' : d.publishState === 'dirty' ? 'Autosave keeps your draft. Publishing snapshots it as the new live version.' : live ? 'Every publish is a new immutable version.' : 'Nothing is public until you publish.'}</span>
          </div>
        </Card>
        <Card style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }} data-testid="share-availability">
          <Icon name={d.status === 'closed' || d.availability === 'closed' ? 'lock' : d.availability === 'scheduled' ? 'calendar-clock' : 'check-circle'} size={16} />
          <span style={{ flex: 1, fontSize: 13.5 }}>{!live ? 'Nothing is public until you publish.' : d.status === 'closed' ? 'Closed to new responses — visitors see the closed message.' : d.availability === 'scheduled' ? 'Published, and opens at the time set in Settings.' : d.availability === 'closed' ? (d.closedReason === 'limit' ? 'Closed: the response limit is reached.' : 'Closed: the closing time has passed.') : `Taking responses${d.ops.access === 'restricted' ? ' from signed-in people' : ''}${d.ops.hasPassword ? ', behind a password' : ''}.`}</span>
          <Btn size="sm" onClick={() => api.setTab('settings')} testId="share-open-settings">Availability and access</Btn>
        </Card>
        <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Link name" hint={d.versions.length === 0 ? "Until you first publish, the link follows the form's name. Type one here to choose your own." : "Letters, numbers and dashes. Changing it breaks the old link."}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input mono value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} aria-label="Link name" data-testid="share-slug" />
              <Btn disabled={busy || slug === d.slug || slug.length < 3} onClick={async () => { setBusy(true); const ok = await api.patchMeta({ slug }); setBusy(false); if (!ok) setSlug(d.slug) }} testId="share-slug-save">Save</Btn>
            </div>
          </Field>
        </Card>
        <Card style={{ padding: '18px 20px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }} data-testid="share-qr">
          <div style={{ width: 148, height: 148, border: '2px solid var(--ink)', borderRadius: 12, background: 'var(--on-fill)', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none', opacity: live ? 1 : .45 }}>
            {qr ? <img src={qr.png} alt={`QR code for ${url}`} width={136} height={136} data-testid="share-qr-image" /> : <Icon name="qr" size={40} />}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>QR code</strong>
            <span style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }}>{live ? 'Opens the form’s link. Print it on posters, slides and name badges.' : 'The code opens the link, which works once the form is published.'}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn size="sm" icon="download" disabled={!qr} onClick={() => qr && download(qr.png, `${d.slug}-qr.png`)} testId="share-qr-png">PNG</Btn>
              <Btn size="sm" icon="download" disabled={!qr} onClick={() => qr && download(URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml' })), `${d.slug}-qr.svg`)} testId="share-qr-svg">SVG</Btn>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><strong style={{ fontSize: 15, flex: 1 }}>Embed</strong><Btn size="sm" icon="copy" onClick={() => copy(embedSnippet(d.slug), 'Embed code copied.')} testId="share-embed-copy">Copy code</Btn></div>
          <pre style={{ margin: 0, padding: '12px 14px', borderRadius: 10, background: 'var(--syn-surface)', color: 'var(--syn-text)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} data-testid="share-embed">{embedSnippet(d.slug)}</pre>
          <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Paste anywhere HTML is allowed. The form keeps its theme and resizes to its content.</span>
        </Card>
      </div>
    </div>
  )
}
