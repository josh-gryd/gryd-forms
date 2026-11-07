import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import './globals-v2.css'
import './globals-phone.css'
import Shell from './components/shell/Shell'
import PhoneChrome from './components/phone/PhoneChrome'
import { THEME_INIT_SCRIPT } from './components/theme'
import { DSProvider } from './components/v2/ds-context'
import { authEnabled } from '@/lib/auth'

const BRAND = process.env.FORMS_BRAND_NAME || 'Forms'

export const metadata: Metadata = {
  title: BRAND,
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eceae3' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const surface = (await headers()).get('x-forms-surface')

  // Public forms (/f/<slug>): a respondent's page, no portal chrome. The form brings its own theme.
  if (surface === 'public-form') {
    return (
      <html lang="en" data-surface="public-form" suppressHydrationWarning>
        <body style={{ margin: 0, minHeight: '100vh' }}>{children}</body>
      </html>
    )
  }

  if (surface === 'sign-in') {
    return (
      <html lang="en" data-ds="v2" data-surface="sign-in" suppressHydrationWarning>
        <body style={{ margin: 0, minHeight: '100vh', background: 'var(--bg)' }}>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          {children}
        </body>
      </html>
    )
  }

  return (
    <html lang="en" data-ds="v2" suppressHydrationWarning>
      <body style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/Plus-Jakarta-Sans-400-latin.woff2" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <DSProvider ds="v2">
          <Shell brand={BRAND} signOut={authEnabled()}>{children}</Shell>
          <PhoneChrome />
        </DSProvider>
      </body>
    </html>
  )
}
