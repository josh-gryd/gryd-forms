'use client'

// The portal's frame for a one-app install: a top bar, the Forms sidebar (or,
// in the builder, the slot the builder fills with its panels), and the content
// column with the app band above the page.

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APPS, activePage } from '@/lib/apps'
import { FORMS_SIDEBAR_SLOT, FORMS_SIDEBAR_W, isFormBuilderPath } from '@/lib/forms/slot'
import { usePhoneShell } from '@/lib/phone/use-phone'
import EmojiTile from '../v2/EmojiTile'
import FormsNav from '../v2/FormsNav'
import { ShellSlab } from '../AppSlab'
import { ThemeToggle } from '../theme'

const SIDEBAR_W = 256

export default function Shell({ brand, children, signOut }: { brand: string; children: React.ReactNode; signOut: boolean }) {
  const pathname = usePathname()
  const phone = usePhoneShell()
  const builder = isFormBuilderPath(pathname)
  const [open, setOpen] = useState(false)
  const app = APPS[0]
  const width = builder ? FORMS_SIDEBAR_W : SIDEBAR_W

  useEffect(() => { document.documentElement.style.setProperty('--shell-app-w', `${width}px`) }, [width])
  useEffect(() => { setOpen(false) }, [pathname])

  const sidebar = (
    <aside data-side="1" data-v2-sidebar="" data-forms-builder={builder ? '' : undefined} aria-label={builder ? 'Form builder panels' : 'Forms pages'}
      style={{
        width, flex: 'none', height: '100%', boxSizing: 'border-box', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)',
        padding: builder ? 0 : 'var(--sp-5) var(--sp-4)', overflowY: builder ? 'hidden' : 'auto',
        background: 'var(--app-bg)', color: 'var(--tx)', fontFamily: 'var(--font-body)',
        borderTop: '2px solid var(--ink)', borderRight: '2px solid var(--ink)',
      }}>
      {builder ? (
        <div id={FORMS_SIDEBAR_SLOT} data-forms-sidebar-slot="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} />
      ) : (
        <Suspense fallback={null}>
          <FormsNav pages={app.pages} pathname={pathname} fallbackEmoji={app.emoji} onNavigate={() => setOpen(false)} />
        </Suspense>
      )}
    </aside>
  )

  const here = activePage(app.pages, pathname)

  return (
    <>
      <header data-shell-top="" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 16px', background: 'var(--side)', color: 'var(--tx)', fontFamily: 'var(--font-body)' }}>
        {phone && !builder && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open}
            style={{ width: 36, height: 36, border: '2px solid var(--ink)', borderRadius: 'var(--r-control)', background: 'var(--card)', color: 'var(--tx)', cursor: 'pointer', fontSize: 18 }}>☰</button>
        )}
        <Link href="/forms" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
          <EmojiTile emoji={app.emoji} size="md" bg="var(--app-bg)" />
          <span style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: 17 }}>{brand}</span>
        </Link>
        {here && !phone ? <span style={{ color: 'var(--tx2)', fontWeight: 700, fontSize: 14 }}>/ {here.label}</span> : null}
        <span style={{ flex: 1 }} />
        <ThemeToggle size={36} />
        {signOut ? (
          <form action="/api/auth/sign-out" method="post">
            <button type="submit" style={{ height: 36, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 'var(--r-control)', background: 'var(--card)', color: 'var(--tx)', font: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Sign out</button>
          </form>
        ) : null}
      </header>
      <div data-app-frame="" data-app="forms" data-v2app="forms" style={{ display: 'flex', flex: 1, minHeight: 0, background: 'var(--side)', position: 'relative' }}>
        {phone ? (open ? (
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: '56px 0 0 0', zIndex: 50, background: 'rgba(0,0,0,.35)' }}>
            <div onClick={e => e.stopPropagation()} style={{ height: '100%', width: SIDEBAR_W }}>{sidebar}</div>
          </div>
        ) : null) : sidebar}
        <div className="shell-main" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <ShellSlab />
          <main className="mobile-main" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</main>
        </div>
      </div>
    </>
  )
}
