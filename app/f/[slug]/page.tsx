import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { engineFetch } from '@/lib/engine-fetch'
import { authEnabled } from '@/lib/auth'
import { currentEmail } from '@/lib/session'
import { uiFor, formatWhen } from '@/lib/forms-core/index'
import '../../forms/forms.css'
import PublicForm from './PublicForm'
import StatePanel, { Shell, themedButton } from './StatePanel'
import { LockedGate, RespondedGate } from './Gates'
import type { PublicPayload } from './public-api'

export const dynamic = 'force-dynamic'

// The public form is fetched on the server so the first paint is the form
// itself, not a spinner. The visitor's IP travels with the request so the
// engine's rate limit sees the visitor, not this server. A signed-in GRYD
// person is named too — the engine reads it only for forms restricted to them.
async function load(slug: string): Promise<PublicPayload> {
  const h = await headers()
  const ip = h.get('fly-client-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  const reqHeaders: Record<string, string> = { 'x-forms-client-ip': ip, 'x-forms-client-ua': (h.get('user-agent') || '').slice(0, 300) }
  const email = await signedInEmail()
  if (email) reqHeaders['x-forms-respondent'] = email
  try {
    const res = await engineFetch(`/api/forms/public/by-slug/${encodeURIComponent(slug)}`, { headers: reqHeaders, cache: 'no-store' })
    if (!res.ok) return { status: 'unavailable' }
    return (await res.json()) as PublicPayload
  } catch { return { status: 'unavailable' } }
}

async function signedInEmail(): Promise<string | null> {
  // With sign-in off (local development) nobody is a signed-in respondent.
  if (!authEnabled()) return null
  try { return await currentEmail() } catch { return null }
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const data = await load(params.slug)
  if (data.status === 'unavailable') return { title: 'Form not available', robots: { index: false, follow: false }, icons: { icon: '/icon.svg?v=2' } }
  const description = data.status === 'live' ? data.definition.settings.description || undefined : undefined
  return { title: data.form.title, description, openGraph: { title: data.form.title, description }, robots: { index: false, follow: false }, icons: { icon: '/icon.svg?v=2' } }
}

/** Sign-in happens on the portal's own host, then comes back to the form there. */
function signInUrl(slug: string): string {
  const base = (process.env.FORMS_PUBLIC_URL || '').replace(/\/+$/, '')
  return `${base}/auth/sign-in?callbackUrl=${encodeURIComponent(`/f/${slug}`)}`
}

export default async function PublicFormPage(
  props: { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const data = await load(params.slug)
  const embed = searchParams?.embed === '1' || searchParams?.embed === 'true'
  const hidden: Record<string, string> = {}
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === 'string' && k !== 'embed') hidden[k] = v
  if (data.status === 'unavailable') notFound()
  if (data.status === 'live') {
    return (
      <Shell theme={data.definition.theme} embed={embed}>
        <PublicForm form={data.form} version={data.version} def={data.definition} respond={data.respond} embed={embed} hidden={hidden} />
      </Shell>
    )
  }
  const ui = uiFor(data.language)
  const look = { theme: data.theme, language: data.language, embed, title: data.form.title }
  if (data.status === 'closed') return <StatePanel {...look} tag={ui.closed} body={data.closedMessage || (data.reason === 'limit' ? ui.closedLimit : ui.closedDefault)} testId="form-closed" />
  if (data.status === 'scheduled') return <StatePanel {...look} tag={ui.opensSoon} body={ui.opensOn(formatWhen(data.opensAt, data.language, data.timezone))} testId="form-scheduled" />
  if (data.status === 'signin') {
    return (
      <StatePanel {...look} tag={ui.signinTitle} body={ui.signinBody} testId="form-signin">
        <a href={signInUrl(data.form.slug)} style={themedButton(data.theme)} data-testid="signin-button">{ui.signin}</a>
      </StatePanel>
    )
  }
  if (data.status === 'locked') return <LockedGate form={data.form} theme={data.theme} language={data.language} embed={embed} hidden={hidden} />
  if (data.status === 'responded') return <RespondedGate form={data.form} theme={data.theme} language={data.language} embed={embed} canEdit={data.canEdit} />
  notFound()
}
