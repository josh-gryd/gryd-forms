// A page row and a section label for the v2 app sidebar: shared by the
// generic page list and apps that draw their own (FormsNav).

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { navLinkProps } from '@/lib/nav-intent'
import EmojiTile from './EmojiTile'

/** One page row: the current one sits on --app-bg2 with an ink edge. An
 *  `alert` count is something broken (a coral pill), not a to-do (gold). */
export function NavRow({ href, label, emoji, title, on, count, alert, onNavigate, testId }: { href: string; label: string; emoji: string; title?: string; on: boolean; count?: number; alert?: boolean; onNavigate?: () => void; testId?: string }) {
  const router = useRouter()
  return (
    <Link
      href={href}
      title={title}
      aria-current={on ? 'page' : undefined}
      className={on ? undefined : 'gx-navrow'}
      data-testid={testId}
      {...navLinkProps(href, router, {
        current: on,
        onClick: () => {
          onNavigate?.()
          if (on) window.dispatchEvent(new CustomEvent('gryd:nav-home', { detail: { href } }))
        },
      })}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', width: '100%', padding: '7px 10px',
        boxSizing: 'border-box', textAlign: 'left', textDecoration: 'none',
        border: on ? '2px solid var(--ink)' : '2px solid transparent', borderRadius: 'var(--r-control)',
        background: on ? 'var(--app-bg2)' : undefined, boxShadow: on ? 'var(--el-1)' : 'none',
        color: 'var(--tx)', fontSize: 14, fontWeight: on ? 800 : 600,
      }}
    >
      <EmojiTile emoji={emoji} size="md" />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {typeof count === 'number' && count > 0 && (alert ? (
        <span data-testid={testId ? `${testId}-count` : undefined} style={{
          minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'content-box', display: 'grid', placeItems: 'center',
          border: '1.5px solid var(--ink)', borderRadius: 'var(--r-pill)', background: 'var(--coral)', color: 'var(--on-accent)',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      ) : (
        <span data-testid={testId ? `${testId}-count` : undefined} style={{
          display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontWeight: 700, fontSize: 10.5,
          lineHeight: 1.2, background: 'var(--gold)', color: 'var(--on-accent)', border: '1.5px solid var(--ink)',
          borderRadius: 7, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      ))}
    </Link>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, margin: '0 4px', flex: 'none',
      fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 800, letterSpacing: 'var(--track-label)',
      textTransform: 'uppercase', color: 'var(--tx2)',
    }}>{children}</div>
  )
}
