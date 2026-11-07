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
import { DEMO_REPO_URL, isDemo } from '@/lib/demo'
import DemoBanner from './components/demo/DemoBanner'

const BRAND = process.env.FORMS_BRAND_NAME || 'Forms'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: isDemo() ? `${BRAND} · live demo` : BRAND,
    icons: { icon: '/icon.svg' },
    // Demo forms are strangers' content: keep them out of search results.
    ...(isDemo() ? { robots: { index: false, follow: false } } : {}),
  }
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
          {isDemo() ? <DemoBanner repo={DEMO_REPO_URL} /> : null}
          <Shell brand={BRAND} signOut={authEnabled()}>{children}</Shell>
          <PhoneChrome />
        </DSProvider>
      </body>
    </html>
  )
}
