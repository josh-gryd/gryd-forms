'use client'

// The bottom strip: pages and endings as tabs under the canvas only. Tabs
// are a tablist (arrow keys move), double-click renames, drag reorders
// pages, and a field dragged onto a tab moves to that page.

import { useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { isConditionalPage, rulesTargeting, type Page, type Ending } from '@/lib/forms-core/index'
import { Btn, menuAnchor } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder } from './context'

function RenameInput({ value, onCommit, onCancel }: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return <input ref={ref} aria-label="Page name" value={v} onChange={e => setV(e.target.value)} onBlur={() => onCommit(v)} onClick={e => e.stopPropagation()}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCommit(v) } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }}
    data-testid="tab-rename" style={{ width: 130, height: 24, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--input)', padding: '0 6px', fontWeight: 700, fontSize: 13, color: 'var(--tx)' }} />
}

function PageTab({ page, index }: { page: Page; index: number }) {
  const api = useBuilder()
  const isCur = api.cur === page.id
  const cond = isConditionalPage(api.def, page.id)
  const { setNodeRef: setDrop, isOver } = useDroppable({ id: `page:${page.id}`, data: { kind: 'page', pageId: page.id, index } })
  const { attributes, listeners, setNodeRef: setDrag, isDragging } = useDraggable({ id: `pagetab:${page.id}`, data: { kind: 'pagetab', pageId: page.id, index, label: page.name } })
  const blockOver = api.dnd.over && 'targetId' in api.dnd.over && api.dnd.over.id === 'page' && api.dnd.over.targetId === page.id
  const renaming = api.renaming === page.id
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={el => { setDrop(el); setDrag(el); (ref as React.MutableRefObject<HTMLDivElement | null>).current = el }} {...attributes} {...listeners} role="tab" aria-selected={isCur} tabIndex={isCur ? 0 : -1} data-testid={`tab-page-${index}`} data-page-id={page.id}
      onClick={() => api.goTo(page.id)} onDoubleClick={() => api.setRenaming(page.id)} onContextMenu={e => { e.preventDefault(); api.pageMenu(page.id, { x: e.clientX, y: e.clientY }) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.goTo(page.id) } else if (e.key === 'F2') { e.preventDefault(); api.setRenaming(page.id) } }}
      aria-roledescription="page tab"
      style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px 0 4px', borderBottom: `3px solid ${isCur ? 'var(--ink)' : 'transparent'}`, marginBottom: -1.5, boxShadow: blockOver || isOver ? 'inset 0 0 0 2px var(--lime)' : 'none', borderRadius: blockOver || isOver ? 6 : 0, color: isCur ? 'var(--tx)' : 'var(--tx2)', cursor: 'pointer', opacity: isDragging ? .5 : 1, outlineOffset: -2 }}>
      <button type="button" aria-label={`Actions for ${page.name}`} className="fb-iconbtn fb-iconbtn--xs" tabIndex={-1} onClick={e => { e.stopPropagation(); api.pageMenu(page.id, menuAnchor(e.currentTarget)) }} onPointerDown={e => e.stopPropagation()} style={{ width: 22, height: 26 }}><Icon name="more-v" size={14} /></button>
      {renaming ? <RenameInput value={page.name} onCommit={v => { api.updatePage(page.id, { name: v.trim() || page.name }); api.setRenaming(null) }} onCancel={() => api.setRenaming(null)} />
        : <span style={{ maxWidth: 180, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</span>}
      {page.kind === 'cover' && <span className="fb-tag" style={{ height: 16, fontSize: 9, padding: '0 4px', marginLeft: 2 }}>COVER</span>}
      {cond && <span title="Shown conditionally" aria-label="Shown conditionally" style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={14} /></span>}
    </div>
  )
}

function EndingTab({ ending, index }: { ending: Ending; index: number }) {
  const api = useBuilder()
  const isCur = api.cur === ending.id
  const reached = rulesTargeting(api.def, ending.id).length > 0
  return (
    <div role="tab" aria-selected={isCur} tabIndex={isCur ? 0 : -1} data-testid={`tab-ending-${index}`} onClick={() => api.goTo(ending.id)} onContextMenu={e => { e.preventDefault(); api.endingMenu(ending.id, { x: e.clientX, y: e.clientY }) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.goTo(ending.id) } }}
      style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', borderBottom: `3px solid ${isCur ? 'var(--ink)' : 'transparent'}`, marginBottom: -1.5, color: isCur ? 'var(--tx)' : 'var(--tx2)', cursor: 'pointer', outlineOffset: -2 }}>
      <span style={{ display: 'grid', placeItems: 'center', color: 'var(--lime-tx)' }}><Icon name={ending.kind === 'redirect' ? 'external' : 'check-circle'} size={14} /></span>
      <span style={{ maxWidth: 180, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ending.name}</span>
      {reached && <span title="Reached by a rule" aria-label="Reached by a rule" style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={14} /></span>}
    </div>
  )
}

export default function PageStrip() {
  const api = useBuilder()
  const listRef = useRef<HTMLDivElement>(null)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    const i = tabs.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length
    tabs[j].focus()
    tabs[j].click()
  }
  return (
    <div ref={listRef} role="tablist" aria-label="Pages and endings" onKeyDown={onKey} data-testid="page-strip" style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'stretch', gap: 4, padding: '0 12px', borderTop: '1.5px solid var(--line2)', background: 'var(--bg)', overflowX: 'auto', overflowY: 'hidden' }}>
      <Btn onClick={api.addPage} icon="plus" size="sm" style={{ alignSelf: 'center', marginRight: 8, flex: 'none' }} testId="add-page">Add page</Btn>
      {api.def.pages.map((p, i) => <PageTab key={p.id} page={p} index={i} />)}
      <span aria-hidden="true" style={{ alignSelf: 'center', width: 1.5, height: 22, background: 'var(--line2)', margin: '0 6px', flex: 'none' }} />
      {api.def.endings.map((e, i) => <EndingTab key={e.id} ending={e} index={i} />)}
      <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Add ending" title="Add ending" onClick={api.addEnding} data-testid="add-ending" style={{ alignSelf: 'center', color: 'var(--mut2)' }}><Icon name="plus" size={15} /></button>
    </div>
  )
}
