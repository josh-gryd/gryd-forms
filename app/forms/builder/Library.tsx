'use client'

// The Fields panel (sidebar, Fields tab): search on top, tiles grouped the
// way the handoff orders them. Click appends to the current page and brings
// Build back if another section is open; drag drops anywhere on the form.
// Endings only take display content.

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { libraryItems, type LibraryItem } from '@/lib/forms-core/index'
import { SearchBox } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder, type LibraryPick } from './context'

export function pickFor(item: LibraryItem): LibraryPick { return { type: item.type, preset: item.preset } }

export const COLUMN_ITEMS: Array<{ key: string; label: string; icon: string; pick: LibraryPick }> = [
  { key: 'cols2', label: 'Two columns', icon: 'columns', pick: { columns: 2 } },
  { key: 'cols3', label: 'Three columns', icon: 'columns3', pick: { columns: 3 } },
]

function Tile({ id, label, icon, pick, group }: { id: string; label: string; icon: string; pick: LibraryPick; group?: string }) {
  const api = useBuilder()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${group ? `${group}:` : ''}${id}`, data: { kind: 'lib', pick, label } })
  return (
    <button ref={setNodeRef} type="button" className="fb-tile" data-dragging={isDragging || undefined} data-testid={`lib-${group === 'Frequently used' ? 'freq-' : ''}${id}`} {...listeners} {...attributes} aria-label={`Add ${label}`}
      onClick={() => { if (api.tab !== 'build') api.setTab('build'); api.addBlock(pick, { kind: 'end', containerId: api.cur }, { focus: true, keepSidebar: true }) }}>
      <span className="fb-tile__icon"><Icon name={icon} size={15} /></span>
      <span style={{ textWrap: 'balance' } as React.CSSProperties}>{label}</span>
    </button>
  )
}

export default function Library() {
  const api = useBuilder()
  const [q, setQ] = useState('')
  const displayOnly = api.curKind === 'ending'
  const { groups } = libraryItems(q, { displayOnly })
  const cols = !displayOnly && (!q || /col/i.test(q)) ? COLUMN_ITEMS : []
  return (
    <section aria-label="Fields" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="library">
      <div style={{ padding: '0 12px 8px', flex: 'none' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search fields" label="Search fields" />
      </div>
      <div className="fb-scroll" style={{ flex: 1, padding: '2px 12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(g => (
          <div key={g.category} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="fb-caps" style={{ padding: '0 2px 4px' }}>{g.category}</div>
            {g.items.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {g.items.map(it => <Tile key={it.key} id={it.key} label={it.label} icon={it.icon} pick={pickFor(it)} group={g.category} />)}
                {g.category === 'Layout' && cols.map(c => <Tile key={c.key} id={c.key} label={c.label} icon={c.icon} pick={c.pick} />)}
              </div>
            )}
          </div>
        ))}
        {!groups.some(g => g.category === 'Layout') && cols.length > 0 && !q && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="fb-caps" style={{ padding: '0 2px 4px' }}>Layout</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{cols.map(c => <Tile key={c.key} id={c.key} label={c.label} icon={c.icon} pick={c.pick} />)}</div>
          </div>
        )}
        <p style={{ margin: 0, padding: '4px 2px 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.5 }}>
          {displayOnly ? 'Endings take display content only: headings, text, images and links.' : <>Click a field to add it to the end of this page, or drag it to a spot on the form. On the form itself, type a question and press <span className="fb-kbd">↵</span>, or press <span className="fb-kbd">/</span> for this same list.</>}
        </p>
      </div>
    </section>
  )
}
