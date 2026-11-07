'use client'

// Archived: forms kept, out of the active list. Archiving closed any form that
// was taking responses; Restore puts it back in All forms and reopens a form
// that archiving closed. Responses stay readable here, and in Responses.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formsApi, formsChanged, type FormSummary } from '@/lib/forms/api'
import { Btn, Icon, Tag, SearchBox, EmptyState, Skeleton, Menu, Confirm, useToast, relativeTime, type MenuAt, type MenuItem } from '../ui'
import { formStatusTag, formLabel } from '../status'
import { usePhone } from '@/lib/phone/use-phone'
import { SlabSub } from '@/app/components/AppSlab'
import { PhoneIcon } from '@/app/components/phone/icons'
import { FormRow, menuSheet, linkS } from '../PhoneForms'


export default function Archived() {
  const router = useRouter()
  const { toast } = useToast()
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<{ at: MenuAt; form: FormSummary } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FormSummary | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setForms(await formsApi.list({ archived: true })); setError(null) } catch (err) { setError((err as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const restore = async (f: FormSummary) => {
    try {
      const d = await formsApi.restore(f.id); await load(); formsChanged()
      toast({ msg: `Restored “${formLabel(f)}”${d.status === 'published' ? ' — it takes responses again' : ''}.`, action: 'Open', onAction: () => router.push(`/forms/${f.id}`), testId: 'toast-restored' })
    } catch (err) { toast({ msg: `Couldn’t restore: ${(err as Error).message}`, tone: 'coral' }) }
  }
  const remove = async () => {
    const f = confirmDelete; if (!f) return
    setBusy(true)
    try { await formsApi.remove(f.id); setConfirmDelete(null); await load(); formsChanged(); toast({ msg: `Deleted “${formLabel(f)}”` }) }
    catch (err) { toast({ msg: `Couldn’t delete: ${(err as Error).message}`, tone: 'coral' }) }
    finally { setBusy(false) }
  }

  const needle = q.trim().toLowerCase()
  const visible = (forms ?? []).filter(f => !needle || f.title.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle))
  const menuItems = (f: FormSummary): MenuItem[] => [
    { label: 'Restore', icon: 'rotate-ccw', run: () => { void restore(f) }, testId: 'archived-restore' },
    { label: 'Open builder', icon: 'pencil', run: () => router.push(`/forms/${f.id}`) },
    { label: 'Responses', icon: 'inbox', run: () => router.push(`/forms/responses?form=${f.id}`) },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, run: () => setConfirmDelete(f), testId: 'archived-delete' },
  ]
  const confirmNode = <Confirm open={!!confirmDelete} title={`Delete “${confirmDelete ? formLabel(confirmDelete) : ''}”?`} body={confirmDelete && confirmDelete.completedCount > 0 ? `${confirmDelete.completedCount} response${confirmDelete.completedCount === 1 ? '' : 's'} go with it. This can’t be undone.` : 'This can’t be undone.'} onConfirm={remove} onCancel={() => setConfirmDelete(null)} busy={busy} />

  // The phone: the same rows as All forms. A row opens the form's responses
  // (they stay readable here); ⋯ restores, opens the builder or deletes.
  const phone = usePhone()
  if (phone) return (
    <div className="ph-page" data-testid="forms-archived">
      <SlabSub>{forms ? `${forms.length} archived` : 'Reading…'}</SlabSub>
      {forms && forms.length > 0 ? (
        <div className="ph-bar-row">
          <label className="ph-search">
            <PhoneIcon name="search" size={17} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search archived forms" aria-label="Search archived forms" />
          </label>
        </div>
      ) : null}
      <p style={{ margin: 0, padding: '12px 20px', fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.5, borderBottom: '1px solid var(--line)' }}>Archived forms keep their responses but leave All forms. Archiving closes a form that was taking responses; restoring it opens it again.</p>
      {error ? <div role="alert" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: 'var(--coral-tx)', borderBottom: '1px solid var(--line)' }}>Couldn’t load archived forms: {error} <button type="button" onClick={() => { void load() }} style={linkS}>Retry</button></div> : null}
      {!forms && !error ? <div className="ph-empty">Reading the archive…</div> : null}
      {forms && forms.length === 0 ? <div style={{ padding: 16 }}><EmptyState title="Nothing archived." body="Archive a form from its ⋯ menu in All forms to keep it — and its responses — without it cluttering the list." testId="archived-empty" /></div> : null}
      {forms && forms.length > 0 && visible.length === 0 ? <div className="ph-empty">No archived forms match.</div> : null}
      {visible.map((f, i) => (
        <FormRow key={f.id} f={f} i={i} folder={null} menuLabel={`Actions for ${formLabel(f)}`} onMenu={() => menuSheet(`Actions for ${formLabel(f)}`, menuItems(f))}
          sub={`${f.completedCount} response${f.completedCount === 1 ? '' : 's'} · archived ${relativeTime(f.archivedAt)}`} />
      ))}
      {confirmNode}
    </div>
  )

  return (
    <div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }} data-testid="forms-archived">
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.5 }}>Archived forms keep their responses but leave All forms. Archiving closes a form that was taking responses; restoring it opens it again.</p>
      {forms && forms.length > 0 && <SearchBox large value={q} onChange={setQ} placeholder="Search archived forms" label="Search archived forms" style={{ width: 300 }} />}
      {error && <div className="fb-banner fb-banner--coral fb-banner--inline" role="alert"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>Couldn’t load archived forms: {error}</span><Btn size="sm" onClick={load}>Retry</Btn></div>}
      {!forms && !error && <div className="fb-card" style={{ padding: 18 }} aria-busy="true"><Skeleton width="50%" /></div>}
      {forms && forms.length === 0 && <EmptyState title="Nothing archived." body="Archive a form from its ⋯ menu in All forms to keep it — and its responses — without it cluttering the list." testId="archived-empty" />}
      {forms && visible.length > 0 && (
        <div className="fb-table" role="table" aria-label="Archived forms">
          <div className="fb-table__head fb-archived-grid" role="row" style={{ height: 36, padding: '0 18px' }}>
            <span role="columnheader">Form</span><span role="columnheader">Status</span><span role="columnheader" style={{ textAlign: 'right' }}>Responses</span><span role="columnheader" className="fb-hide-phone">Archived</span><span />
          </div>
          {visible.map(f => {
            const tag = formStatusTag(f)
            return (
              <div key={f.id} role="row" className="fb-table__row fb-archived-grid" data-testid="archived-row" data-form-id={f.id} tabIndex={0} style={{ height: 52, padding: '0 18px' }}
                onClick={() => router.push(`/forms/${f.id}`)} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) router.push(`/forms/${f.id}`) }}
                onContextMenu={e => { e.preventDefault(); setMenu({ at: { x: e.clientX, y: e.clientY }, form: f }) }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formLabel(f)}</span>
                  <span style={{ fontSize: 12, color: 'var(--mut2)' }}>{f.pages} page{f.pages === 1 ? '' : 's'} · {f.fields} field{f.fields === 1 ? '' : 's'}</span>
                </div>
                <Tag tone={tag.tone}>{tag.label}</Tag>
                <Link href={`/forms/responses?form=${f.id}`} onClick={e => e.stopPropagation()} style={{ justifySelf: 'end', fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>{f.completedCount}</Link>
                <span className="fb-mono fb-hide-phone" style={{ fontSize: 11.5, color: 'var(--mut2)' }}>{relativeTime(f.archivedAt)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label={`Actions for ${formLabel(f)}`} data-testid="archived-menu" onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ at: { x: r.right - 200, y: r.bottom + 4 }, form: f }) }}><Icon name="ellipsis" size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {menu && <Menu at={menu.at} label={`Actions for ${formLabel(menu.form)}`} onClose={() => setMenu(null)} items={menuItems(menu.form)} />}
      {confirmNode}
    </div>
  )
}
