'use client'

// Templates: the four built-in starting points (contact, intake, feedback,
// registration) and any form someone saved as a template. Preview runs the
// template in the respondent view; Use makes a new form from it and opens the
// builder. A built-in template takes the workspace's look and defaults; a
// saved one keeps the design it was saved with.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SlabAction } from '@/app/components/AppSlab'
import { formsApi, type TemplateSummary } from '@/lib/forms/api'
import type { FormDefinition } from '@/lib/forms-core/index'
import { Btn, Icon, Tag, EmptyState, Skeleton, Sheet, Menu, Confirm, Dialog, Field, Input, useToast, relativeTime, type MenuAt } from '../ui'
import { FormRunner } from '../render/FormRunner'
import { usePhone } from '@/lib/phone/use-phone'
import { SlabSub } from '@/app/components/AppSlab'
import PhoneSheet from '@/app/components/phone/Sheet'
import { PhoneIcon } from '@/app/components/phone/icons'
import { menuSheet, linkS } from '../PhoneForms'

const CATEGORY_EMOJI: Record<string, string> = { Contact: '✉️', Intake: '🧾', Feedback: '💬', Registration: '🎟️' }

export default function Templates() {
  const router = useRouter()
  const { toast } = useToast()
  const [list, setList] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ t: TemplateSummary; def: FormDefinition } | null>(null)
  const [menu, setMenu] = useState<{ at: MenuAt; t: TemplateSummary } | null>(null)
  const [editing, setEditing] = useState<{ t: TemplateSummary; name: string; category: string; description: string } | null>(null)
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null)

  const load = useCallback(async () => {
    try { setList(await formsApi.templates()); setError(null) } catch (err) { setError((err as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const builtIn = useMemo(() => (list ?? []).filter(t => t.builtIn), [list])
  const saved = useMemo(() => (list ?? []).filter(t => !t.builtIn), [list])

  const use = async (t: TemplateSummary) => {
    setBusy(t.id)
    try { const f = await formsApi.useTemplate(t.id); router.push(`/forms/${f.id}?new=1`) }
    catch (err) { toast({ msg: `Couldn’t make a form from it: ${(err as Error).message}`, tone: 'coral' }); setBusy(null) }
  }
  const openPreview = async (t: TemplateSummary) => {
    try { const full = await formsApi.template(t.id); setPreview({ t, def: full.definition }) }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const saveEdit = async () => {
    if (!editing) return
    try { await formsApi.updateTemplate(editing.t.id, { name: editing.name, category: editing.category, description: editing.description }); setEditing(null); await load() }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }
  const remove = async () => {
    if (!deleting) return
    try { await formsApi.deleteTemplate(deleting.id); toast({ msg: `Deleted the template “${deleting.name}”. Forms made from it are unchanged.` }); setDeleting(null); await load() }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }

  const card = (t: TemplateSummary) => (
    <article key={t.id} className="fb-card" data-testid="template-card" data-template-id={t.id} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 190 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, border: '1.5px solid var(--ink)', borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--pur-bg)', fontSize: 18 }}>{CATEGORY_EMOJI[t.category] ?? '📝'}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="template-name">{t.name}</strong>
          <span style={{ fontSize: 12, color: 'var(--mut2)' }}>{t.questions} question{t.questions === 1 ? '' : 's'} · {t.pages} page{t.pages === 1 ? '' : 's'}</span>
        </div>
        {t.category && <Tag tone="plain">{t.category}</Tag>}
        {!t.builtIn && <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label={`Actions for ${t.name}`} data-testid="template-menu" onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ at: { x: r.right - 180, y: r.bottom + 4 }, t }) }}><Icon name="ellipsis" size={15} /></button>}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)', flex: 1 }}>{t.description || 'Saved from a form.'}</p>
      {!t.builtIn && <span style={{ fontSize: 11.5, color: 'var(--mut2)' }}>Saved {relativeTime(t.updatedAt)}{t.createdBy ? ` by ${t.createdBy}` : ''}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn solid icon="plus" onClick={() => use(t)} disabled={busy !== null} testId="template-use">{busy === t.id ? 'Making…' : 'Use template'}</Btn>
        <Btn icon="eye" onClick={() => openPreview(t)} testId="template-preview">Preview</Btn>
      </div>
    </article>
  )

  const blank = async () => { const f = await formsApi.create({ title: 'Untitled form' }); router.push(`/forms/${f.id}?new=1`) }
  const editDialog = (
    <Dialog open={!!editing} title="Template details" onClose={() => setEditing(null)} actions={<><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn solid onClick={saveEdit} disabled={!editing?.name.trim()} testId="template-edit-save">Save</Btn></>}>
      <Field label="Name" htmlFor="te-name"><Input id="te-name" value={editing?.name ?? ''} maxLength={120} onChange={e => editing && setEditing({ ...editing, name: e.target.value })} /></Field>
      <Field label="Category" htmlFor="te-cat"><Input id="te-cat" value={editing?.category ?? ''} maxLength={40} onChange={e => editing && setEditing({ ...editing, category: e.target.value })} /></Field>
      <Field label="Description" htmlFor="te-desc"><Input id="te-desc" value={editing?.description ?? ''} maxLength={300} onChange={e => editing && setEditing({ ...editing, description: e.target.value })} /></Field>
    </Dialog>
  )
  const deleteConfirm = <Confirm open={!!deleting} title={`Delete the template “${deleting?.name ?? ''}”?`} body="Forms already made from it stay as they are." onConfirm={remove} onCancel={() => setDeleting(null)} />

  // The phone: a template is a row; tapping it previews it in a sheet whose
  // bar has Use template. A saved one's ⋯ renames or deletes it. Using one
  // opens the builder, which is desktop work (handoff §6).
  const phone = usePhone()
  const [shut, setShut] = useState(false)
  if (phone) {
    const row = (t: TemplateSummary) => (
      <div key={t.id} style={{ display: 'grid', gridTemplateColumns: t.builtIn ? 'minmax(0,1fr)' : 'minmax(0,1fr) 44px', borderBottom: '1px solid var(--line)' }} data-testid="template-card" data-template-id={t.id}>
        <button type="button" className="ph-row" data-lead="tile" style={{ borderBottom: 0 }} onClick={() => { setShut(false); void openPreview(t) }} data-testid="template-preview">
          <span className="ph-mono" aria-hidden style={{ background: 'var(--pur-bg)', fontSize: 18, fontFamily: 'var(--font-emoji)' }}>{CATEGORY_EMOJI[t.category] ?? '📝'}</span>
          <span className="ph-row-main">
            <span className="ph-row-title" data-strong="" style={{ display: 'block' }} data-testid="template-name">{t.name}</span>
            <span className="ph-row-sub" style={{ display: 'block' }}>{t.questions} question{t.questions === 1 ? '' : 's'} · {t.pages} page{t.pages === 1 ? '' : 's'}</span>
            <span className="ph-row-sub" data-clamp="" style={{ color: 'var(--tx2)' }}>{t.description || 'Saved from a form.'}</span>
            {!t.builtIn ? <span className="ph-row-sub" style={{ display: 'block', fontSize: 12.5 }}>Saved {relativeTime(t.updatedAt)}{t.createdBy ? ` by ${t.createdBy}` : ''}</span> : null}
          </span>
          <span className="ph-row-side">{t.category ? <span className="ph-tag">{t.category}</span> : null}</span>
        </button>
        {!t.builtIn ? (
          <button type="button" aria-label={`Actions for ${t.name}`} data-testid="template-menu" style={{ border: 0, background: 'transparent', color: 'var(--tx)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            onClick={() => menuSheet(`Actions for ${t.name}`, [
              { label: 'Rename or describe', icon: 'pencil', run: () => setEditing({ t, name: t.name, category: t.category, description: t.description }), testId: 'template-edit' },
              { sep: true },
              { label: 'Delete template', icon: 'trash', danger: true, run: () => setDeleting(t), testId: 'template-delete' },
            ])}><PhoneIcon name="more-horizontal" size={19} /></button>
        ) : null}
      </div>
    )
    const closePreview = () => { setShut(true); setTimeout(() => setPreview(null), 300) }
    return (
      <div className="ph-page" data-testid="forms-templates" style={{ paddingBottom: 64 }}>
        <SlabAction><Btn solid size="lg" icon="plus" onClick={blank} testId="template-blank">Blank form</Btn></SlabAction>
        <SlabSub>{list ? `${list.length} templates` : 'Reading…'}</SlabSub>
        {error ? <div role="alert" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: 'var(--coral-tx)', borderBottom: '1px solid var(--line)' }}>Couldn’t load templates: {error} <button type="button" onClick={() => { void load() }} style={linkS}>Retry</button></div> : null}
        {!list && !error ? <div className="ph-empty">Reading the templates…</div> : null}
        {list ? (
          <>
            <section aria-label="Starting points" data-testid="templates-builtin">
              <div className="ph-group-head">Starting points<span className="n">{builtIn.length}</span></div>
              {builtIn.map(row)}
            </section>
            <section aria-label="Your templates">
              <div className="ph-group-head">Your templates<span className="n">{saved.length}</span></div>
              {saved.length ? <div data-testid="templates-saved">{saved.map(row)}</div>
                : <div style={{ padding: 16 }}><EmptyState title="None saved yet." body="Open a form’s ⋯ menu in All forms and choose Save as template. Its questions, logic and design become a starting point here." testId="templates-saved-empty" /></div>}
            </section>
          </>
        ) : null}
        {preview ? (
          <PhoneSheet open={!shut} onClose={closePreview} label={`Preview of ${preview.t.name}`} detents={['large']} initial="large" flush
            header={
              <div className="ph-sheet-head" style={{ gridTemplateColumns: '44px minmax(0,1fr) 44px' }}>
                <span className="ph-mono" style={{ width: 44, height: 44, background: 'var(--pur-bg)', fontSize: 20, fontFamily: 'var(--font-emoji)' }}>{CATEGORY_EMOJI[preview.t.category] ?? '📝'}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ph-sheet-title" style={{ display: 'block' }}>{preview.t.name}</span>
                  <span className="ph-sheet-sub" style={{ display: 'block' }}>Preview · answers here aren’t saved</span>
                </span>
                <button type="button" className="ph-close" aria-label="Close preview" onClick={closePreview}><PhoneIcon name="x" size={18} /></button>
              </div>
            }
            actionBar={<Btn solid icon="plus" onClick={() => use(preview.t)} disabled={busy !== null} testId="template-preview-use" style={{ width: '100%', height: 50, justifyContent: 'center', fontSize: 15 }}>{busy === preview.t.id ? 'Making…' : 'Use template'}</Btn>}>
            <div data-testid="template-preview-runner">
              <FormRunner def={preview.def} mode="preview" device="phone" transport={{ submit: async () => ({ submissionId: 'preview', endingId: preview.def.endings[0]?.id ?? '' }), uploads: null }} />
            </div>
          </PhoneSheet>
        ) : null}
        {editDialog}
        {deleteConfirm}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1240 }} data-testid="forms-templates">
      <SlabAction><Btn solid size="lg" icon="plus" onClick={async () => { const f = await formsApi.create({ title: 'Untitled form' }); router.push(`/forms/${f.id}?new=1`) }} testId="template-blank">Blank form</Btn></SlabAction>
      {error && <div className="fb-banner fb-banner--coral fb-banner--inline" role="alert"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>Couldn’t load templates: {error}</span><Btn size="sm" onClick={load}>Retry</Btn></div>}
      {!list && !error && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>{[0, 1, 2, 3].map(i => <div key={i} className="fb-card" style={{ padding: 18, height: 190 }}><Skeleton width="60%" /><Skeleton width="90%" style={{ marginTop: 14 }} /></div>)}</div>}
      {list && (
        <>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="fb-caps" style={{ margin: 0 }}>Starting points</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }} data-testid="templates-builtin">{builtIn.map(card)}</div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="fb-caps" style={{ margin: 0 }}>Your templates</h2>
            {saved.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }} data-testid="templates-saved">{saved.map(card)}</div>
              : <EmptyState title="None saved yet." body="Open a form’s ⋯ menu in All forms and choose Save as template. Its questions, logic and design become a starting point here." testId="templates-saved-empty" />}
          </section>
        </>
      )}

      <Sheet open={!!preview} onClose={() => setPreview(null)} label={`Preview of ${preview?.t.name ?? ''}`} style={{ width: 'min(720px, 100vw)' }}>
        {preview && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '2px solid var(--ink)', background: 'var(--card)' }}>
              <strong style={{ flex: 1 }}>{preview.t.name}</strong>
              <Btn solid icon="plus" onClick={() => use(preview.t)} disabled={busy !== null} testId="template-preview-use">Use template</Btn>
              <button type="button" className="fb-iconbtn" aria-label="Close preview" onClick={() => setPreview(null)}><Icon name="x" size={16} /></button>
            </div>
            <div className="fb-scroll" data-runner-scroll="" style={{ flex: 1, minHeight: 0 }} data-testid="template-preview-runner">
              <FormRunner def={preview.def} mode="preview" device="tablet" transport={{ submit: async () => ({ submissionId: 'preview', endingId: preview.def.endings[0]?.id ?? '' }), uploads: null }} />
            </div>
          </>
        )}
      </Sheet>
      {menu && <Menu at={menu.at} label={`Actions for ${menu.t.name}`} onClose={() => setMenu(null)} items={[
        { label: 'Rename or describe', icon: 'pencil', run: () => setEditing({ t: menu.t, name: menu.t.name, category: menu.t.category, description: menu.t.description }), testId: 'template-edit' },
        { sep: true },
        { label: 'Delete template', icon: 'trash', danger: true, run: () => setDeleting(menu.t), testId: 'template-delete' },
      ]} />}
      {editDialog}
      {deleteConfirm}
    </div>
  )
}
