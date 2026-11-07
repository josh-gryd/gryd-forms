// What the demo starts from after every reset: the built-in templates as
// published forms, one with "Work emails only" on, and a few weeks of made-up
// responses so Responses and the summary charts have something to show.

import * as svc from './forms/service.js'
import * as lib from './forms/library.js'
import * as ws from './forms/workspace.js'
import { getDb } from './db/index.js'
import { formsLog } from './forms/log.js'
import { allBlocks, isInputBlock, type Block, type FormDefinition } from './forms/core/index'

const PEOPLE = [
  ['Ada Lovelace', 'ada@analytical.co'], ['Grace Hopper', 'grace@cobol.dev'], ['Alan Turing', 'alan@bletchley.io'],
  ['Katherine Johnson', 'katherine@orbit.space'], ['Linus Torvalds', 'linus@kernel.dev'], ['Margaret Hamilton', 'margaret@apollo.systems'],
  ['Tim Berners-Lee', 'tim@w3.example'], ['Hedy Lamarr', 'hedy@spread.radio'], ['Dennis Ritchie', 'dennis@unix.example'],
  ['Barbara Liskov', 'barbara@substitute.dev'], ['Ken Thompson', 'ken@bell.example'], ['Radia Perlman', 'radia@spanning.tree'],
] as const
const NOTES = [
  'Loved how quick this was.', 'Could you send the slides afterwards?', 'We are a team of 12, mostly remote.',
  'Looking to switch from our current tool this quarter.', 'Happy to jump on a call next week.', 'Everything was clear, thanks!',
  'The second session was the most useful for us.', 'Please add a vegetarian option.', 'Our budget is set for Q1.',
]

const pick = <T,>(list: readonly T[], i: number): T => list[i % list.length]

/** A believable answer for one question, or undefined to leave it blank. */
function answerFor(b: Block, i: number): unknown {
  const [name, email] = pick(PEOPLE, i)
  const opts = b.options ?? []
  const label = (b.label || '').toLowerCase()
  switch (b.type) {
    case 'short': return label.includes('name') ? name : label.includes('company') ? `${email.split('@')[1].split('.')[0].replace(/^./, c => c.toUpperCase())} Inc.` : label.includes('role') ? pick(['Founder', 'Head of Ops', 'Engineer', 'Marketing lead'], i) : pick(['Yes', 'About 20 people', 'Chicago', 'Next month'], i)
    case 'long': return pick(NOTES, i)
    case 'email': return email
    case 'phone': return undefined
    case 'url': return `https://${email.split('@')[1]}`
    case 'number': return 5 + (i * 7) % 40
    case 'choice': case 'dropdown': return opts.length ? pick(opts, i * 3 + 1).id : undefined
    case 'checks': return opts.length ? [pick(opts, i).id, pick(opts, i + 2).id].filter((v, k, a) => a.indexOf(v) === k) : undefined
    case 'yesno': return i % 3 !== 0
    case 'rating': return 3 + (i % 3)
    case 'scale': return 6 + (i % 5)
    case 'date': { const d = new Date(Date.now() + (7 + i) * 86400_000); return d.toISOString().slice(0, 10) }
    default: return undefined
  }
}

function answersFor(def: FormDefinition, i: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const b of allBlocks(def)) {
    if (!isInputBlock(b)) continue
    const v = answerFor(b, i)
    if (v !== undefined) out[b.id] = v
  }
  return out
}

const META: svc.RespondentMeta = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', acceptLanguage: 'en-US', referrer: null, source: null, embedded: false }

function seedResponses(formId: string, count: number): void {
  const def = svc.getFormDetail(formId).draft as FormDefinition
  const back = getDb().prepare('UPDATE form_submissions SET started_at = ?, last_activity_at = ?, submitted_at = ? WHERE id = ?')
  for (let i = 0; i < count; i++) {
    try {
      const r = svc.submitResponse(formId, { idempotencyKey: `demo-seed-${formId}-${i}`, answers: answersFor(def, i), pagesVisited: def.pages.map(p => p.id), meta: META })
      // Spread over the last three weeks, so the summary has a shape.
      const at = Date.now() - (i * 37 + 5) * 3600_000 % (21 * 86400_000)
      back.run(new Date(at - 180_000).toISOString(), new Date(at).toISOString(), new Date(at).toISOString(), r.submissionId)
    } catch (err) { formsLog.warn('demo.seed_response_skipped', { form: formId, error: (err as Error).message }) }
  }
}

export function seedDemo(): void {
  const by = 'demo@example.com'
  const folder = ws.createFolder('Client work', by)
  const intake = lib.useTemplate('builtin-intake', { title: 'Client Intake', folderId: folder.id, by })
  // The "work emails only" check, on, so visitors can try gmail and see it refused.
  const def = intake.draft as FormDefinition
  for (const b of allBlocks(def)) if (b.type === 'email') b.settings = { ...b.settings, workOnly: true }
  svc.saveDraft(intake.id, { definition: def, baseRevision: intake.revision, by })
  svc.publishForm(intake.id, { by })
  seedResponses(intake.id, 9)

  const feedback = lib.useTemplate('builtin-feedback', { title: 'Customer Feedback', by })
  svc.publishForm(feedback.id, { by })
  seedResponses(feedback.id, 24)

  const event = lib.useTemplate('builtin-registration', { title: 'Spring Workshop Registration', by })
  svc.publishForm(event.id, { by })
  seedResponses(event.id, 14)

  const contact = lib.useTemplate('builtin-contact', { title: 'Website Contact', by })
  svc.publishForm(contact.id, { by })
  seedResponses(contact.id, 6)

  // One draft, so the list shows both states.
  lib.useTemplate('builtin-contact', { title: 'Newsletter Signup (draft)', by })
}
