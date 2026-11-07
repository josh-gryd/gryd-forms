'use client'

// The builder's half of the app sidebar. AppSidebar keeps the column mounted
// (header card, Apps footer) and leaves a slot where its page list would be;
// this portals the builder's panels into it — Fields · Page · Field while
// building, the theme controls while theming — so the one column does what
// the old fields panel and the right inspector did. Selection drives the
// tab: pick a field and Field opens, deselect and Fields is back. Responses,
// Share and Settings have nothing to do with fields, so there the column is
// the Forms app's own navigation (QA 09-25, round 3: the palette competed
// with Settings).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { FORMS_SIDEBAR_SLOT } from '@/lib/forms/slot'
import { appById } from '@/lib/apps'
import FormsNav from '@/app/components/v2/FormsNav'
import { Seg } from '../ui'
import { useBuilder, type SideTab } from './context'
import Library from './Library'
import { FieldPanel, PagePanel } from './Inspector'
import ThemePanel from './ThemePanel'

const OUTSIDE_BUILD = new Set(['share', 'settings'])

export default function SidebarPanel() {
  const api = useBuilder()
  const pathname = usePathname()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSlot(document.getElementById(FORMS_SIDEBAR_SLOT)) }, [])
  if (!slot) return null
  const theming = api.tab === 'theme'
  const middle = api.curKind === 'ending' ? 'Ending' : 'Page'
  if (OUTSIDE_BUILD.has(api.tab)) {
    return createPortal(
      <nav aria-label="Forms" data-testid="builder-sidebar-nav" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)', padding: '0 var(--sp-4) var(--sp-5)', overflowY: 'auto' }}>
        <FormsNav pages={appById('forms')?.pages ?? []} pathname={pathname} fallbackEmoji="📝" />
      </nav>,
      slot,
    )
  }
  return createPortal(
    <div data-forms-root="" data-testid="builder-sidebar" data-side-tab={theming ? 'theme' : api.sideTab} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {theming ? <ThemePanel /> : (
        <>
          <div style={{ padding: '0 12px 10px', flex: 'none' }}>
            <Seg<SideTab> value={api.sideTab} onChange={api.setSideTab} label="Sidebar panels" role="tablist" grow className="fb-seg--card" testId="side-tabs" options={[
              { value: 'fields', label: 'Fields', testId: 'side-fields' },
              { value: 'page', label: middle, testId: 'side-page' },
              { value: 'field', label: 'Field', testId: 'side-field' },
            ]} />
          </div>
          {api.sideTab === 'fields' && <Library />}
          {api.sideTab === 'page' && <PagePanel />}
          {api.sideTab === 'field' && <FieldPanel />}
        </>
      )}
    </div>,
    slot,
  )
}
