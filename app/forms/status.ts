// One word for where a form stands, the same in the list, Archived and the
// builder: Draft, Live, Unpublished edits, Scheduled, Closed. Closed by a
// date or a response limit says which, so nobody reopens a form that would
// only close again.

import type { FormSummary } from '@/lib/forms/api'
import type { TagTone } from './ui'

export function formStatusTag(f: Pick<FormSummary, 'publishState' | 'availability' | 'closedReason'>): { label: string; tone: TagTone; title?: string } {
  if (f.publishState === 'draft') return { label: 'Draft', tone: 'neutral' }
  if (f.publishState === 'closed') return { label: 'Closed', tone: 'coral' }
  if (f.availability === 'scheduled') return { label: 'Scheduled', tone: 'gold', title: 'Published, and opens at the time set in Settings › Availability.' }
  if (f.availability === 'closed' && f.closedReason === 'limit') return { label: 'Closed · limit reached', tone: 'coral', title: 'The response limit in Settings › Availability is reached.' }
  if (f.availability === 'closed' && f.closedReason === 'date') return { label: 'Closed · date passed', tone: 'coral', title: 'The closing date in Settings › Availability has passed.' }
  return f.publishState === 'dirty' ? { label: 'Unpublished edits', tone: 'gold' } : { label: 'Live', tone: 'lime' }
}

/** What the list calls a form: its internal name, else its title. */
export const formLabel = (f: { name?: string; title: string }): string => f.name?.trim() || f.title
