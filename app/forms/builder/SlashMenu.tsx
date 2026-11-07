'use client'

// The slash / library menu: the same list as the left panel, as a 340px
// popover anchored where the author is working. Search autofocuses, arrows
// move, Enter inserts, Esc closes and focus returns to the trigger.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { libraryItems, type LibraryItem } from '@/lib/forms-core/index'
import { Icon } from '../ui/icons'
import { useBuilder, type LibraryPick } from './context'
import { COLUMN_ITEMS, pickFor } from './Library'

interface Row { key: string; label: string; icon: string; pick: LibraryPick; category: string }

export default function SlashMenu() {
  const api = useBuilder()
  const menu = api.library
  const [q, setQ] = useState(menu?.initialQuery ?? '')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(menu?.initialQuery ?? ''); setActive(0); if (menu) setTimeout(() => inputRef.current?.focus(), 0) }, [menu])

  const groups = useMemo(() => {
    if (!menu) return []
    const lib = libraryItems(q, { displayOnly: menu.displayOnly })
    const toRow = (it: LibraryItem): Row => ({ key: it.key, label: it.label, icon: it.icon, pick: pickFor(it), category: it.category })
    const out = lib.groups.map(g => ({ category: g.category, items: g.items.map(toRow) }))
    if (!menu.displayOnly && (!q || /col/i.test(q))) {
      const cols = COLUMN_ITEMS.map(c => ({ key: c.key, label: c.label, icon: c.icon, pick: c.pick, category: 'Layout' }))
      const layout = out.find(g => g.category === 'Layout' || g.category === 'Results')
      if (layout) layout.items.push(...cols); else out.push({ category: 'Layout', items: cols })
    }
    return out.filter(g => g.items.length || g.category === 'No fields match')
  }, [menu, q])
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups])

  useEffect(() => { if (active >= flat.length) setActive(0) }, [flat, active])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  if (!menu) return null
  const close = () => { const rf = menu.returnFocus; api.closeLibrary(); rf?.focus?.() }
  const pick = (row: Row) => { api.closeLibrary(); api.addBlock(row.pick, menu.target, { focus: true }) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) pick(flat[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }
  let index = -1
  return createPortal(
    <>
      <div className="fb-scrim" onClick={close} onContextMenu={e => { e.preventDefault(); close() }} data-testid="slash-scrim" />
      <div role="dialog" aria-label="Add a field" data-forms-root="" data-testid="slash-menu" onKeyDown={onKey}
        style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 209, width: 340, maxWidth: 'calc(100vw - 16px)', maxHeight: menu.maxH, display: 'flex', flexDirection: 'column', border: '2px solid var(--ink)', borderRadius: 12, background: 'var(--card)', boxShadow: 'var(--el-4)', overflow: 'hidden', color: 'var(--tx)', animation: 'fb-rise .16s var(--ease-out) both' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 12px', borderBottom: '1.5px solid var(--line2)', flex: 'none' }}>
          <Icon name="search" size={15} />
          <input ref={inputRef} aria-label="Search field types" value={q} onChange={e => { setQ(e.target.value); setActive(0) }} placeholder="Search fields…" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--tx)', outline: 'none' }} data-testid="slash-search" />
          <span className="fb-kbd">esc</span>
        </label>
        <div ref={listRef} className="fb-scroll" style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }} role="listbox" aria-label="Field types">
          {groups.map(g => (
            <div key={g.category} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div className="fb-caps" style={{ fontSize: 10.5, padding: '6px 8px 3px' }}>{g.category}</div>
              {g.items.map(it => { index += 1; const i = index; const on = i === active; return (
                <button key={it.key} type="button" role="option" aria-selected={on} data-index={i} data-testid={`slash-${g.category === 'Frequently used' ? 'freq-' : ''}${it.key}`} onClick={() => pick(it)} onMouseEnter={() => setActive(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 8px', border: 0, borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: on ? 'var(--inset)' : 'transparent', color: 'var(--tx)', fontSize: 13, fontWeight: 600, width: '100%' }}>
                  <span style={{ width: 26, height: 26, border: '1.5px solid var(--ink)', borderRadius: 7, background: on ? 'var(--lime)' : 'var(--card)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={it.icon} size={14} /></span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {on && <span className="fb-kbd" style={{ borderColor: 'var(--ink)', color: 'var(--tx)' }}>↵</span>}
                </button>
              ) })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 12px', borderTop: '1.5px solid var(--line2)', fontSize: 11, fontWeight: 600, color: 'var(--mut2)', flex: 'none' }}><span>↑↓ move</span><span>↵ add</span><span style={{ flex: 1 }} /><span>{menu.target.kind === 'end' ? 'Adds to the end of the page' : menu.target.kind === 'slot' ? 'Fills the column' : 'Inserts here'}</span></div>
      </div>
    </>, document.body)
}
