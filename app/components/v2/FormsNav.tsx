'use client'

// The Forms app's sidebar: All forms, Responses (with the unread count),
// Templates and Archived; a Folders section under them; Settings pinned at the
// foot. Folders and the count are read here, not in the shell, so no other
// app pays for them. Pages that change either fire `gryd:forms-changed`.
// Right-clicking a folder opens the menu its page's ⋯ opens: Rename, Color,
// Delete folder.

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { AppPage } from '@/lib/apps'
import { activePage } from '@/lib/apps'
import { formsApi, formsChanged, type Folder } from '@/lib/forms/api'
import { tileStyle } from './EmojiTile'
import { FolderGlyph } from '@/app/forms/ui/FolderGlyph'
import { useFolderActions } from '@/app/forms/FolderActions'
import { NavRow, SectionLabel } from './NavRow'
import { V2Icon } from './icons'
import { visibleInterval } from '@/lib/visible-interval'

export default function FormsNav({ pages, pathname, fallbackEmoji, onNavigate }: { pages: AppPage[]; pathname: string; fallbackEmoji: string; onNavigate?: () => void }) {
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [unread, setUnread] = useState(0)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Deleting the folder being looked at leaves its page for All forms.
  const folderActions = useFolderActions(gone => {
    if (window.location.pathname === '/forms' && new URLSearchParams(window.location.search).get('folder') === gone.id) router.push('/forms')
  })

  const refresh = useCallback(() => {
    formsApi.folders().then(setFolders).catch(() => undefined)
    formsApi.unread().then(setUnread).catch(() => setUnread(0))
  }, [])
  useEffect(() => {
    refresh()
    const stop = visibleInterval(refresh, 60_000)
    window.addEventListener('gryd:forms-changed', refresh)
    return () => { stop(); window.removeEventListener('gryd:forms-changed', refresh) }
  }, [refresh])
  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const main = pages.filter(p => p.href !== '/forms/settings')
  const settings = pages.find(p => p.href === '/forms/settings')
  const here = activePage(pages, pathname)

  const create = async () => {
    const n = name.trim()
    if (!n) { setAdding(false); return }
    try {
      const f = await formsApi.createFolder(n)
      setAdding(false); setName(''); setError(null)
      formsChanged()
      router.push(`/forms?folder=${f.id}`)
      onNavigate?.()
    } catch (err) { setError((err as Error).message) }
  }

  return (
    <>
      <SectionLabel>Forms</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Suspense fallback={null}>
          {main.map(p => <MainRow key={p.href} page={p} on={p.href === here?.href} count={p.href === '/forms/responses' ? unread : undefined} emoji={p.emoji || fallbackEmoji} onNavigate={onNavigate} />)}
        </Suspense>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 -8px' }}>
        <SectionLabel>Folders</SectionLabel>
        <button type="button" onClick={() => { setAdding(true); setError(null) }} aria-label="New folder" title="New folder" data-testid="nav-new-folder"
          className="gx-navrow" style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: '2px solid transparent', borderRadius: 'var(--r-chip)', background: 'transparent', color: 'var(--tx2)', cursor: 'pointer' }}>
          <V2Icon name="plus" size={15} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="nav-folders">
        <Suspense fallback={null}>
          {folders.map(f => <FolderRow key={f.id} folder={f} pathname={pathname} onNavigate={onNavigate} onMenu={(at, el) => folderActions.open(f, at, el)} />)}
        </Suspense>
        {adding ? (
          <form onSubmit={e => { e.preventDefault(); void create() }} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 4px' }}>
            <input ref={inputRef} value={name} onChange={e => setName(e.target.value)} onBlur={() => { if (!name.trim()) setAdding(false) }}
              onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setName('') } }}
              aria-label="Folder name" placeholder="Folder name" maxLength={60} data-testid="nav-folder-input"
              style={{ height: 32, padding: '0 10px', border: '2px solid var(--ink)', borderRadius: 'var(--r-control)', background: 'var(--card)', color: 'var(--tx)', font: 'inherit', fontSize: 13.5, fontWeight: 600 }} />
            {error && <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-tx)' }}>{error}</span>}
          </form>
        ) : !folders.length ? (
          <button type="button" onClick={() => setAdding(true)} className="gx-navrow"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '7px 10px', border: '2px dashed var(--line2)', borderRadius: 'var(--r-control)', background: 'transparent', color: 'var(--tx2)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
            <V2Icon name="plus" size={14} /> New folder
          </button>
        ) : null}
      </div>

      {folderActions.ui}

      {settings && (
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavRow href={settings.href} label={settings.label} emoji={settings.emoji || fallbackEmoji} title={settings.description} on={settings.href === here?.href} onNavigate={onNavigate} testId="nav-forms-settings" />
        </div>
      )}
    </>
  )
}

/** All forms is current only without a folder chosen. */
function MainRow({ page, on, count, emoji, onNavigate }: { page: AppPage; on: boolean; count?: number; emoji: string; onNavigate?: () => void }) {
  const params = useSearchParams()
  const inFolder = page.href === '/forms' && !!params.get('folder')
  return <NavRow href={page.href} label={page.label} emoji={emoji} title={page.description} on={on && !inFolder} count={count} onNavigate={onNavigate} testId={`nav-${page.href.split('/').pop()}`} />
}

function FolderRow({ folder, pathname, onNavigate, onMenu }: { folder: Folder; pathname: string; onNavigate?: () => void; onMenu: (at: { x: number; y: number }, el: HTMLElement) => void }) {
  const params = useSearchParams()
  const on = pathname === '/forms' && params.get('folder') === folder.id
  return (
    <Link href={`/forms?folder=${folder.id}`} aria-current={on ? 'page' : undefined} className={on ? undefined : 'gx-navrow'} onClick={() => onNavigate?.()} data-testid="nav-folder" data-folder-id={folder.id}
      onContextMenu={e => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }, e.currentTarget) }}
      onKeyDown={e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.left + 12, y: r.bottom + 4 }, e.currentTarget) } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', width: '100%', padding: '7px 10px', boxSizing: 'border-box', textDecoration: 'none',
        border: on ? '2px solid var(--ink)' : '2px solid transparent', borderRadius: 'var(--r-control)',
        background: on ? 'var(--app-bg2)' : undefined, boxShadow: on ? 'var(--el-1)' : 'none', color: 'var(--tx)', fontSize: 14, fontWeight: on ? 800 : 600,
      }}>
      <span aria-hidden="true" style={tileStyle('md', 'var(--card)')} data-testid="nav-folder-glyph"><FolderGlyph color={folder.color} size={16} /></span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{folder.formCount}</span>
    </Link>
  )
}
