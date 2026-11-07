// Every screen around a form — closed, not open yet, password, sign-in,
// already responded — drawn in the form's own theme and language, with the
// owner's footer. No hooks, so the server page and the client gates share it.

import React from 'react'
import { themeStyles, type Theme, type FormLanguage } from '@/lib/forms-core/index'

export function Shell({ theme, children, embed }: { theme: Theme; children: React.ReactNode; embed: boolean }) {
  const T = themeStyles(theme)
  return (
    <div data-forms-root="" style={{ minHeight: embed ? undefined : '100vh', background: theme.bg, backgroundImage: T.bgImage, backgroundSize: '22px 22px', fontFamily: T.font, color: theme.text }}>
      {children}
    </div>
  )
}

/** `bare` skips the themed page behind it, for a panel inside a page that already has one. */
export default function StatePanel({ theme, language, embed, tag, title, body, children, testId, bare = false }: { theme: Theme; language: FormLanguage; embed: boolean; tag: string; title: string; body?: React.ReactNode; children?: React.ReactNode; testId: string; bare?: boolean }) {
  const T = themeStyles(theme)
  const inner = (
      <div style={{ padding: embed ? '20px 16px' : '56px 24px 72px' }} lang={language}>
        <section style={{ margin: '0 auto', maxWidth: theme.width, ...T.container, padding: T.pad, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }} className="fb-rise" data-testid={testId}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 10px', border: `2px solid ${theme.line}`, borderRadius: 8, background: theme.input, fontSize: 12, fontWeight: 800 }}>{tag}</span>
          <h1 style={{ margin: 0, fontFamily: T.headFont, fontSize: 28, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.15 }}>{title}</h1>
          {body && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: theme.muted, whiteSpace: 'pre-wrap' }} data-testid={`${testId}-body`}>{body}</p>}
          {children}
        </section>
        {!embed && theme.footer.trim() && <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: theme.muted, fontFamily: 'var(--font-body)' }}>{theme.footer}</p>}
      </div>
  )
  return bare ? inner : <Shell theme={theme} embed={embed}>{inner}</Shell>
}

/** A button in the form's own primary style. */
export function themedButton(theme: Theme): React.CSSProperties {
  const T = themeStyles(theme)
  return { height: 46, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', ...T.button }
}
