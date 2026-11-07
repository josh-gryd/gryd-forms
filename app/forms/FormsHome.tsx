'use client'

// All forms (design: Forms Screens #home): a list, not a dashboard. One
// primary action. Status is a word. Click a row to build; its folder (in the
// folder's color) moves it to another; its responses pill, at the
// end of the row, opens the form's responses; the ⋯ menu (or right-click)
// previews, copies the link, duplicates, saves as a template, archives, deletes.
// ?folder=<id> (the sidebar's Folders) narrows the list to one folder. The band
// then names the folder, after an "All forms ›" crumb and its tile, and its ⋯
// renames, recolors and deletes it: the same menu a
// right-click on the folder in the sidebar opens.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlabAction, SlabTitle } from '@/app/components/AppSlab'
import { tileStyle } from '@/app/components/v2/EmojiTile'
import { formsApi, publicFormUrl, formsChanged, type FormSummary, type Folder, ApiError } from '@/lib/forms/api'
import { Btn, Icon, Tag, SearchBox, Seg, EmptyState, Skeleton, Menu, Confirm, Dialog, Field, Input, Select, useToast, menuAnchor, type MenuItem, type MenuAt } from './ui'
import { FolderGlyph } from './ui/FolderGlyph'
import { useFolderActions } from './FolderActions'
import { formStatusTag, formLabel } from './status'
import { usePhone } from '@/lib/phone/use-phone'
import { openActionSheet } from '@/lib/phone/ui-store'
import { PhoneFormsList, menuSheet } from './PhoneForms'

type Filter = 'all' | 'live' | 'draft' | 'closed'

const TILE_TINTS = ['var(--lime-bg)', 'var(--gold-bg)', 'var(--blu-bg)', 'var(--pur-bg)', 'var(--neu-bg)']

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? 'F') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase()
}

const isLive = (f: FormSummary) => f.publishState === 'live' || f.publishState === 'dirty'
const isClosed = (f: FormSummary) => f.publishState === 'closed' || (f.publishState !== 'draft' && f.availability === 'closed')

export default function FormsHome() {
  const router = useRouter()
  const params = useSearchParams()
  const folderId = params.get('folder')
  const { toast } = useToast()
  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [menu, setMenu] = useState<{ at: MenuAt; form: FormSummary } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FormSummary | null>(null)
  const [moving, setMoving] = useState<{ form: FormSummary; to: string } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ at: MenuAt; form: FormSummary; el: HTMLElement } | null>(null)
  const [newFolder, setNewFolder] = useState<{ form: FormSummary; name: string } | null>(null)
  const [templating, setTemplating] = useState<{ form: FormSummary; name: string; category: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [list, fl] = await Promise.all([formsApi.list(), formsApi.folders()])
      setForms(list); setFolders(fl); setError(null)
    } catch (err) { setError((err as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])
  // The sidebar makes, renames and deletes folders too: follow it.
  useEffect(() => {
    const on = () => { void load() }
    window.addEventListener('gryd:forms-changed', on)
    return () => window.removeEventListener('gryd:forms-changed', on)
  }, [load])
  useEffect(() => { if (renaming) renameRef.current?.select() }, [renaming])
  const changed = useCallback(async () => { await load(); formsChanged() }, [load])

  const folder = folderId ? folders.find(f => f.id === folderId) ?? null : null
  const folderOf = (id: string | null) => (id ? folders.find(f => f.id === id) ?? null : null)

  const inScope = useMemo(() => (forms ?? []).filter(f => !folderId || f.folderId === folderId), [forms, folderId])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inScope.filter(f => (filter === 'all' || (filter === 'live' ? isLive(f) && !isClosed(f) : filter === 'closed' ? isClosed(f) : f.publishState === 'draft'))
      && (!needle || f.title.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle)))
  }, [inScope, q, filter])

  const counts = useMemo(() => ({
    all: inScope.length,
    live: inScope.filter(f => isLive(f) && !isClosed(f)).length,
    draft: inScope.filter(f => f.publishState === 'draft').length,
    closed: inScope.filter(isClosed).length,
  }), [inScope])
  const segLabel = (label: string, n: number) => <>{label}<span className="fb-seg__count">{n}</span></>

  const create = async () => {
    setBusy(true)
    try {
      const f = await formsApi.create({ title: 'Untitled form', folderId })
      router.push(`/forms/${f.id}?new=1`)
    } catch (err) { toast({ msg: `Couldn’t create the form: ${(err as Error).message}`, tone: 'coral' }); setBusy(false) }
  }

  const duplicate = async (f: FormSummary) => {
    try { const copy = await formsApi.duplicate(f.id); await changed(); toast({ msg: `Duplicated as “${copy.title}”` }) }
    catch (err) { toast({ msg: `Couldn’t duplicate: ${(err as Error).message}`, tone: 'coral' }) }
  }
  const commitRename = async () => {
    if (!renaming) return
    const title = renaming.title.trim()
    const current = forms?.find(f => f.id === renaming.id)
    setRenaming(null)
    if (!title || !current || title === formLabel(current)) return
    // The list shows the internal name when there is one: renaming changes what it shows.
    try { if (current.name) await formsApi.settings(current.id, { name: title }); else await formsApi.patch(current.id, { title }); await load() }
    catch (err) { toast({ msg: `Couldn’t rename: ${(err as Error).message}`, tone: 'coral' }) }
  }
  const setClosed = async (f: FormSummary, closed: boolean) => {
    try { if (closed) await formsApi.close(f.id); else await formsApi.reopen(f.id); await load(); toast({ msg: closed ? `“${formLabel(f)}” is closed to new responses.` : `“${formLabel(f)}” is open again.` }) }
    catch (err) { toast({ msg: (err as ApiError).message, tone: 'coral' }) }
  }
  const copyLink = async (f: FormSummary) => {
    try { await navigator.clipboard.writeText(publicFormUrl(f.slug)); toast({ msg: 'Link copied', stamp: 'COPIED' }) }
    catch { toast({ msg: publicFormUrl(f.slug) }) }
  }
  const archive = async (f: FormSummary) => {
    try {
      await formsApi.archive(f.id); await changed()
      toast({ msg: `Archived “${formLabel(f)}”${isLive(f) ? ' and closed it to responses' : ''}.`, action: 'Undo', onAction: () => { void formsApi.restore(f.id).then(changed) }, testId: 'toast-archived' })
    } catch (err) { toast({ msg: `Couldn’t archive: ${(err as Error).message}`, tone: 'coral' }) }
  }
  const remove = async () => {
    const f = confirmDelete; if (!f) return
    setBusy(true)
    try { await formsApi.remove(f.id); setConfirmDelete(null); await changed(); toast({ msg: `Deleted “${formLabel(f)}”` }) }
    catch (err) { toast({ msg: `Couldn’t delete: ${(err as Error).message}`, tone: 'coral' }) }
    finally { setBusy(false) }
  }
  const moveForm = async (f: FormSummary, to: string | null, toName?: string) => {
    try {
      await formsApi.settings(f.id, { folderId: to })
      const name = toName ?? folderOf(to)?.name
      await changed()
      toast({ msg: to ? `Moved “${formLabel(f)}” to ${name ?? 'the folder'}.` : `Took “${formLabel(f)}” out of its folder.` })
      return true
    } catch (err) { toast({ msg: `Couldn’t move: ${(err as Error).message}`, tone: 'coral' }); return false }
  }
  const move = async () => {
    if (!moving) return
    setBusy(true)
    if (await moveForm(moving.form, moving.to || null)) setMoving(null)
    setBusy(false)
  }
  const createAndMove = async () => {
    if (!newFolder) return
    const name = newFolder.name.trim()
    if (!name) return
    setBusy(true)
    try {
      const created = await formsApi.createFolder(name)
      if (await moveForm(newFolder.form, created.id, created.name)) setNewFolder(null)
    } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
    finally { setBusy(false) }
  }
  const saveTemplate = async () => {
    if (!templating) return
    setBusy(true)
    try {
      const t = await formsApi.saveAsTemplate(templating.form.id, { name: templating.name, category: templating.category })
      setTemplating(null)
      toast({ msg: `Saved “${t.name}” to Templates.`, action: 'Open Templates', onAction: () => router.push('/forms/templates') })
    } catch (err) { toast({ msg: `Couldn’t save the template: ${(err as Error).message}`, tone: 'coral' }) }
    finally { setBusy(false) }
  }
  const folderActions = useFolderActions(gone => {
    router.push('/forms')
    toast({ msg: `Deleted the folder “${gone.name}”. Its forms are still in All forms.` })
  })
  // F2 renames the folder being looked at, as the menu says.
  useEffect(() => {
    if (!folder) return
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'F2' || t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return
      e.preventDefault(); folderActions.rename(folder)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [folder, folderActions.rename])

  const menuItems = (f: FormSummary): MenuItem[] => [
    { label: 'Open builder', icon: 'pencil', run: () => router.push(`/forms/${f.id}`) },
    { label: 'Preview', icon: 'eye', run: () => router.push(`/forms/${f.id}?preview=1`), testId: 'menu-preview' },
    { label: f.publishState === 'draft' ? 'Copy link (publish first)' : 'Copy link', icon: 'link', disabled: f.publishState === 'draft', run: () => { void copyLink(f) }, testId: 'menu-copy-link' },
    { label: 'Responses', icon: 'inbox', run: () => router.push(`/forms/responses?form=${f.id}`), testId: 'menu-responses' },
    { sep: true },
    { label: 'Rename', icon: 'type', run: () => setRenaming({ id: f.id, title: formLabel(f) }), testId: 'menu-rename' },
    { label: 'Duplicate', icon: 'copy', run: () => { void duplicate(f) }, testId: 'menu-duplicate' },
    { label: 'Move to folder…', icon: 'folder', run: () => setMoving({ form: f, to: f.folderId ?? '' }), testId: 'menu-move' },
    { label: 'Save as template…', icon: 'layout', run: () => setTemplating({ form: f, name: formLabel(f), category: '' }), testId: 'menu-template' },
    { sep: true },
    ...(f.publishState === 'closed' ? [{ label: 'Reopen', icon: 'refresh', run: () => { void setClosed(f, false) } } as MenuItem] : f.publishState !== 'draft' ? [{ label: 'Close to responses', icon: 'lock', run: () => { void setClosed(f, true) } } as MenuItem] : []),
    { label: 'Archive', icon: 'archive', run: () => { void archive(f) }, testId: 'menu-archive' },
    { label: 'Delete', icon: 'trash', danger: true, run: () => setConfirmDelete(f), testId: 'menu-delete' },
  ]

  // A row's folder chip: every folder in its color, the current one ticked.
  const folderItems = (f: FormSummary): MenuItem[] => [
    ...folders.map(fl => ({ label: fl.name, lead: <FolderGlyph color={fl.color} size={15} />, checked: f.folderId === fl.id, run: () => { if (f.folderId !== fl.id) void moveForm(f, fl.id) }, testId: `folder-pick-${fl.id}` })),
    ...(folders.length ? [{ sep: true } as const] : []),
    ...(f.folderId ? [{ label: 'Take out of the folder', icon: 'x', run: () => { void moveForm(f, null) }, testId: 'folder-pick-none' }] : []),
    { label: 'New folder…', icon: 'plus', run: () => setNewFolder({ form: f, name: '' }), testId: 'folder-pick-new' },
  ]

  // The folder page names its folder in the band, phone or not.
  const folderTitle = folder && (
    <SlabTitle
      back={<>
        <Link href="/forms" className="fb-slab-crumb" data-testid="folder-crumb">All forms<Icon name="chevron-right" size={15} /></Link>
        <span className="fb-slab-tile" style={tileStyle('lg', 'var(--card)')} data-testid="folder-tile"><FolderGlyph color={folder.color} size={20} /></span>
      </>}
      after={<button type="button" className="fb-slab-more" aria-label={`Actions for the folder ${folder.name}`} aria-haspopup="menu" data-testid="folder-actions"
        onClick={e => { const el = e.currentTarget; folderActions.open(folder, menuAnchor(el), el) }}><Icon name="ellipsis" size={18} /></button>}>
      <span data-testid="folder-name">{folder.name}</span>
    </SlabTitle>
  )
  const dialogs = <>
    <Dialog open={!!newFolder} title="New folder" onClose={() => setNewFolder(null)} testId="new-folder-dialog"
      actions={<><Btn onClick={() => setNewFolder(null)}>Cancel</Btn><Btn solid onClick={() => void createAndMove()} disabled={busy || !newFolder?.name.trim()} testId="new-folder-confirm">Create and move</Btn></>}>
      <form onSubmit={e => { e.preventDefault(); void createAndMove() }}>
        <Field label="Folder name" htmlFor="new-folder-name" hint={newFolder ? `“${formLabel(newFolder.form)}” moves into it.` : undefined}>
          <Input id="new-folder-name" autoFocus value={newFolder?.name ?? ''} onChange={e => newFolder && setNewFolder({ ...newFolder, name: e.target.value })} maxLength={60} data-testid="new-folder-name" />
        </Field>
      </form>
    </Dialog>
    <Confirm open={!!confirmDelete} title={`Delete “${confirmDelete ? formLabel(confirmDelete) : ''}”?`} body={confirmDelete && confirmDelete.completedCount + confirmDelete.partialCount > 0 ? `${confirmDelete.completedCount + confirmDelete.partialCount} response${confirmDelete.completedCount + confirmDelete.partialCount === 1 ? '' : 's'} go with it. The public link stops working. Archive keeps it instead.` : 'The public link stops working. This can’t be undone.'} onConfirm={remove} onCancel={() => setConfirmDelete(null)} busy={busy} />
    {folderActions.ui}

    <Dialog open={!!moving} title={`Move “${moving ? formLabel(moving.form) : ''}”`} onClose={() => setMoving(null)} testId="move-dialog"
      actions={<><Btn onClick={() => setMoving(null)}>Cancel</Btn><Btn solid onClick={move} disabled={busy} testId="move-confirm">Move</Btn></>}>
      {folders.length ? (
        <Field label="Folder" htmlFor="move-folder">
          <Select id="move-folder" value={moving?.to ?? ''} onChange={e => moving && setMoving({ ...moving, to: e.target.value })} data-testid="move-select">
            <option value="">No folder</option>
            {folders.map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
          </Select>
        </Field>
      ) : <p style={{ margin: 0, fontSize: 13.5, color: 'var(--tx2)' }}>There are no folders yet. Add one with + next to Folders in the sidebar.</p>}
    </Dialog>

    <Dialog open={!!templating} title="Save as a template" onClose={() => setTemplating(null)} testId="template-dialog"
      actions={<><Btn onClick={() => setTemplating(null)}>Cancel</Btn><Btn solid onClick={saveTemplate} disabled={busy || !templating?.name.trim()} testId="template-confirm">Save template</Btn></>}>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--tx2)' }}>A copy of the questions, logic and design as they are in the draft. Responses and settings stay with the form.</p>
      <Field label="Template name" htmlFor="tpl-name"><Input id="tpl-name" value={templating?.name ?? ''} onChange={e => templating && setTemplating({ ...templating, name: e.target.value })} maxLength={120} data-testid="template-name" /></Field>
      <Field label="Category" hint="Optional — e.g. Contact, Intake, Feedback, Registration." htmlFor="tpl-cat"><Input id="tpl-cat" value={templating?.category ?? ''} onChange={e => templating && setTemplating({ ...templating, category: e.target.value })} maxLength={40} /></Field>
    </Dialog>
  </>

  // The phone (handoff §6): rows that open the form's responses; ⋯ is the
  // desktop menu plus the folder chip's picker; renaming is a dialog, as an
  // inline field in a row is no place to type on a phone.
  const phone = usePhone()
  if (phone) return (
    <>
      {folderTitle}
      {folderId && !folder && forms ? <div style={{ padding: '12px 12px 0' }}><div className="fb-banner fb-banner--gold fb-banner--inline" role="status"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>That folder no longer exists.</span><Btn onClick={() => router.push('/forms')}>Show all forms</Btn></div></div> : null}
      <PhoneFormsList
        forms={visible} inScope={inScope.length} counts={counts} filter={filter} setFilter={setFilter} q={q} setQ={setQ}
        loading={!forms && !error} error={error} onRetry={() => { void load() }}
        folder={folder} folderId={folderId} folders={folders} folderOf={folderOf}
        onMenu={f => {
          // The desktop menu, grouped so each action sheet fits a phone's
          // height: open it, organise it, or close / archive / delete it.
          const all = menuItems(f).filter((it): it is Exclude<MenuItem, { sep: true }> => !('sep' in it))
          const pick = (ids: string[]) => all.filter(it => ids.includes(it.testId ?? it.label))
          const organise: MenuItem[] = [
            ...pick(['menu-rename', 'menu-duplicate', 'menu-move']),
            { label: `Folder · ${folderOf(f.folderId)?.name ?? 'none'}`, run: () => menuSheet(`Folder for ${formLabel(f)}`, folderItems(f)), testId: 'form-folder' },
            ...pick(['menu-template']),
          ]
          const ending = all.filter(it => it.label === 'Reopen' || it.label === 'Close to responses' || it.testId === 'menu-archive' || it.testId === 'menu-delete')
          menuSheet(`Actions for ${formLabel(f)}`, [
            ...pick(['menu-preview', 'menu-copy-link', 'Open builder', 'menu-responses']),
            { label: 'Rename, duplicate, folder, template…', run: () => menuSheet(formLabel(f), organise), testId: 'menu-organise' },
            { label: ending.some(it => it.label === 'Reopen') ? 'Reopen, archive or delete…' : ending.length === 3 ? 'Close, archive or delete…' : 'Archive or delete…', run: () => menuSheet(formLabel(f), ending), testId: 'menu-ending' },
          ])
        }}
        onPageMenu={() => openActionSheet('New form', [
          { label: busy ? 'Making the form…' : 'Blank form', disabled: busy, onPick: () => { void create() } },
          { label: 'From a template', onPick: () => router.push('/forms/templates') },
        ])}
        onFolder={id => router.push(id ? `/forms?folder=${encodeURIComponent(id)}` : '/forms')}
        empty={<div style={{ padding: 16 }}>{forms && inScope.length === 0
          ? (folder
            ? <EmptyState title="This folder is empty." body="Move a form here from its ⋯ menu, or start a new one — it lands in this folder." action={<Btn solid icon="plus" onClick={create} disabled={busy}>New form</Btn>} testId="folder-empty" />
            : <EmptyState title="No forms yet." body="Start with a blank form or a template: ask a question, press Enter, and you have a field. Publishing gives you a link to share." action={<div style={{ display: 'flex', gap: 8 }}><Btn solid icon="plus" onClick={create} disabled={busy}>New form</Btn><Btn icon="layout" onClick={() => router.push('/forms/templates')}>Browse templates</Btn></div>} testId="forms-empty" />)
          : <EmptyState title="No forms match." body="Try a different search or filter." action={<Btn onClick={() => { setQ(''); setFilter('all') }}>Clear filters</Btn>} />}</div>}
      />
      <Dialog open={!!renaming} title="Rename form" onClose={() => setRenaming(null)} testId="rename-dialog"
        actions={<><Btn onClick={() => setRenaming(null)}>Cancel</Btn><Btn solid onClick={() => void commitRename()} disabled={!renaming?.title.trim()} testId="rename-save">Save</Btn></>}>
        <form onSubmit={e => { e.preventDefault(); void commitRename() }}>
          <Field label="Form name" htmlFor="rename-input-phone">
            <Input id="rename-input-phone" autoFocus value={renaming?.title ?? ''} onChange={e => renaming && setRenaming({ ...renaming, title: e.target.value })} maxLength={200} data-testid="rename-input" />
          </Field>
        </form>
      </Dialog>
      {dialogs}
    </>
  )

  return (
    <div style={{ padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1240 }} data-testid="forms-home">
      <SlabAction>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn icon="layout" className="fb-hide-phone" onClick={() => router.push('/forms/templates')} testId="from-template">From a template</Btn>
          <Btn solid size="lg" icon="plus" onClick={create} disabled={busy} testId="new-form">New form</Btn>
        </div>
      </SlabAction>

      {folderTitle}
      {folderId && !folder && forms && <div className="fb-banner fb-banner--gold fb-banner--inline" role="status"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>That folder no longer exists.</span><Btn size="sm" onClick={() => router.push('/forms')}>Show all forms</Btn></div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SearchBox large value={q} onChange={setQ} placeholder={folder ? 'Search this folder' : 'Search forms'} label={folder ? 'Search this folder' : 'Search forms'} style={{ width: 300 }} />
        <Seg<Filter> label="Filter forms" value={filter} onChange={setFilter} testId="forms-filter" options={[
          { value: 'all', label: segLabel('All', counts.all), ariaLabel: `All, ${counts.all}` },
          { value: 'live', label: segLabel('Live', counts.live), ariaLabel: `Live, ${counts.live}` },
          { value: 'draft', label: segLabel('Draft', counts.draft), ariaLabel: `Draft, ${counts.draft}` },
          { value: 'closed', label: segLabel('Closed', counts.closed), ariaLabel: `Closed, ${counts.closed}` },
        ]} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--mut2)' }}>Sorted by last edited</span>
      </div>

      {error && <div className="fb-banner fb-banner--coral fb-banner--inline" role="alert"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>Couldn’t load forms: {error}</span><Btn size="sm" onClick={load}>Retry</Btn></div>}

      {!forms && !error && (
        <div className="fb-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Skeleton width={30} height={30} /><Skeleton width="40%" /><Skeleton width={80} /><Skeleton width={60} /></div>)}
        </div>
      )}

      {forms && inScope.length === 0 && (folder
        ? <EmptyState title="This folder is empty." body="Move a form here from its ⋯ menu, or start a new one — it lands in this folder." action={<Btn solid icon="plus" onClick={create} disabled={busy}>New form</Btn>} testId="folder-empty" />
        : <EmptyState title="No forms yet." body="Start with a blank form or a template: ask a question, press Enter, and you have a field. Publishing gives you a link to share." action={<div style={{ display: 'flex', gap: 8 }}><Btn solid icon="plus" onClick={create} disabled={busy}>New form</Btn><Btn icon="layout" onClick={() => router.push('/forms/templates')}>Browse templates</Btn></div>} testId="forms-empty" />)}
      {forms && inScope.length > 0 && visible.length === 0 && (
        <EmptyState title="No forms match." body="Try a different search or filter." action={<Btn onClick={() => { setQ(''); setFilter('all') }}>Clear filters</Btn>} />
      )}

      {forms && visible.length > 0 && (
        <div className="fb-table" role="table" aria-label="Forms">
          <div className="fb-table__head fb-forms-grid" role="row">
            <span role="columnheader">Form</span><span role="columnheader">Folder</span><span role="columnheader">Status</span><span role="columnheader" style={{ textAlign: 'right' }}>Responses</span><span />
          </div>
          {visible.map((f, i) => {
            const tag = formStatusTag(f)
            const label = formLabel(f)
            const inFolder = folderOf(f.folderId)
            const pickerOpen = folderMenu?.form.id === f.id
            return (
              <div key={f.id} role="row" className="fb-table__row fb-forms-grid" data-testid="form-row" data-form-id={f.id} tabIndex={0}
                onClick={e => { if (renaming?.id === f.id) return; if (e.metaKey || e.ctrlKey) window.open(`/forms/responses?form=${f.id}`, '_blank'); else router.push(`/forms/${f.id}`) }}
                onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget && renaming?.id !== f.id) router.push(`/forms/${f.id}`) }}
                onContextMenu={e => { e.preventDefault(); setMenu({ at: { x: e.clientX, y: e.clientY }, form: f }) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 30, height: 30, border: '1.5px solid var(--ink)', borderRadius: 8, display: 'grid', placeItems: 'center', background: TILE_TINTS[i % TILE_TINTS.length], fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 'none' }}>{initials(label)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {renaming?.id === f.id ? (
                      <input ref={renameRef} aria-label="Form name" className="fb-input" style={{ height: 28, fontWeight: 800 }} value={renaming.title} onChange={e => setRenaming({ id: f.id, title: e.target.value })}
                        onClick={e => e.stopPropagation()} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitRename() } if (e.key === 'Escape') setRenaming(null) }} data-testid="rename-input" />
                    ) : <span style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="form-title">{label}</span>}
                    <span style={{ fontSize: 12, color: 'var(--mut2)', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {f.name && f.name !== f.title && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title="Public title">“{f.title}” ·</span>}
                      <span>{f.pages} page{f.pages === 1 ? '' : 's'} · {f.fields} field{f.fields === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <button type="button" className={inFolder ? 'fb-folder-chip' : 'fb-folder-chip fb-folder-chip--empty'} aria-haspopup="menu" aria-expanded={pickerOpen}
                    aria-label={inFolder ? `Folder: ${inFolder.name}. Change the folder` : `Add ${label} to a folder`} data-testid="form-folder" data-folder-id={inFolder?.id}
                    onClick={e => { e.stopPropagation(); const el = e.currentTarget; setFolderMenu({ at: menuAnchor(el), form: f, el }) }}>
                    {inFolder ? <FolderGlyph color={inFolder.color} size={15} /> : <Icon name="plus" size={13} />}
                    <span className="fb-folder-chip__name">{inFolder ? inFolder.name : 'Folder'}</span>
                    <Icon name="chevron-down" size={12} />
                  </button>
                </div>
                <Tag tone={tag.tone} testId="form-state" title={tag.title}>{tag.label}</Tag>
                <Link href={`/forms/responses?form=${f.id}`} onClick={e => e.stopPropagation()} className={f.completedCount ? 'fb-count-pill' : 'fb-count-pill fb-count-pill--none'} data-testid="form-responses-link"
                  aria-label={`${f.completedCount} response${f.completedCount === 1 ? '' : 's'}${f.unreadCount ? `, ${f.unreadCount} new` : ''} — open ${label} responses`} style={{ justifySelf: 'end' }}>
                  <Icon name="inbox" size={15} />
                  <span><b>{f.completedCount}</b><span className="fb-count-pill__word"> response{f.completedCount === 1 ? '' : 's'}</span></span>
                  {f.unreadCount > 0 && <span className="fb-count-pill__new" data-testid="form-unread">{f.unreadCount} new</span>}
                </Link>
                <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label={`Actions for ${label}`} data-testid="form-menu" onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ at: { x: r.right - 220, y: r.bottom + 4 }, form: f }) }}><Icon name="ellipsis" size={15} /></button>
              </div>
            )
          })}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mut2)' }}>Click a row to open the builder, its folder to move it, or its responses to read them. ⋯ or right-click for preview, link, templates, archive.</p>

      {menu && <Menu at={menu.at} items={menuItems(menu.form)} onClose={() => setMenu(null)} label={`Actions for ${formLabel(menu.form)}`} />}
      {folderMenu && <Menu at={folderMenu.at} items={folderItems(folderMenu.form)} onClose={() => setFolderMenu(null)} label={`Folder for ${formLabel(folderMenu.form)}`} returnFocusTo={folderMenu.el} />}
      {dialogs}
    </div>
  )
}
