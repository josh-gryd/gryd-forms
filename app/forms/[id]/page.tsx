import { redirect } from 'next/navigation'
import Builder from '../builder/Builder'
import { currentBuild } from '@/lib/build-id'
import type { Tab } from '../builder/context'

export const dynamic = 'force-dynamic'

// The URL names sections the way the tabs do (design); the older name (theme)
// still opens it.
const TAB_ALIASES: Record<string, Tab> = { build: 'build', questions: 'build', logic: 'logic', design: 'theme', theme: 'theme', share: 'share', settings: 'settings' }

// /forms/<id> is the builder; ?preview=1 opens the preview, and the tabs then
// keep the URL in step. Responses moved to the Forms app's Responses page on
// 09-26, so ?tab=responses (and the older ?tab=results) — in bookmarks, Slack
// posts and emails already sent — lands there, on the same response and view.
export default async function FormBuilderPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string; preview?: string; r?: string; view?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (searchParams?.tab === 'responses' || searchParams?.tab === 'results') {
    const q = new URLSearchParams({ form: params.id })
    if (searchParams.r) q.set('r', searchParams.r)
    if (searchParams.view === 'summary') q.set('view', 'summary')
    redirect(`/forms/responses?${q.toString()}`)
  }
  const tab = searchParams?.tab ? TAB_ALIASES[searchParams.tab] : undefined
  return <Builder id={params.id} initialTab={tab} initialPreview={searchParams?.preview === '1'} build={currentBuild()} />
}
