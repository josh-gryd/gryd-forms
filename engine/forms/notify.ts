// Who hears about a response: a Slack post (slack.ts) when a new one arrives,
// an email alert to the form's recipients when one arrives or is changed, and
// an optional confirmation to the respondent at the form's first email
// question. It runs after the response is committed and never holds it up.
// Every attempt is logged per form — sent, failed, or skipped and why — so the
// Settings tab can show what happened. Email goes out over SMTP
// (integrations/email.ts); with email not set up, nothing sends.
//
// A public form lets strangers type an address, so confirmations are capped
// per address and per form: nobody can use a form to flood an inbox.

import * as repo from './repo'
import { formsLog } from './log'
import { loadDefinition } from './definitions'
import { parseOps, isEmail, mailboxKey } from './ops'
import { getWorkspace } from './workspace'
import { emailFrom, sendEmail } from '../integrations/email.js'
import { isDemo } from '../demo.js'
import { postToSlack, slackProblem, slackTestText, slackText } from './slack'
import { ServiceError } from './errors'
import { allBlocks, componentDef, isInputBlock, renderTemplate, uiFor, formatWhen, type AnswerMap, type FormDefinition } from './core/index'

export const NOTIFY_CAPS = { slackPerFormPerHour: 60, alertsPerFormPerHour: 60, confirmationsPerFormPerHour: 30, confirmationsPerAddressPerDay: 3 }

export interface OutgoingEmail { to: string; subject: string; body: string }
export interface NotifyDeps { send: (sender: string, msg: OutgoingEmail) => Promise<void> }

const realDeps: NotifyDeps = {
  async send(_sender, msg) {
    await sendEmail(msg)
  },
}
let deps: NotifyDeps = realDeps

/** Test injection only. Null restores the real transport. */
export function setNotifyDeps(next: Partial<NotifyDeps> | null): void { deps = { ...realDeps, ...(next ?? {}) } }

const pending = new Set<Promise<void>>()

/** Resolves once every notification started so far has finished (tests). */
export async function notificationsIdle(): Promise<void> { while (pending.size) await Promise.all([...pending]) }

export function portalUrl(): string {
  return (process.env.FORMS_PUBLIC_URL ?? '').trim().replace(/\/+$/, '') || `http://localhost:${process.env.PORT || '3000'}`
}

/** One response, open on the Forms app's Responses page. */
const responseUrl = (portal: string, formId: string, submissionId: string): string => `${portal}/forms/responses?form=${formId}&r=${submissionId}`

/** Fire and forget: called after a response commits. Never throws. */
export function notifySubmission(formId: string, submissionId: string, extra: { editToken?: string | null; edited?: boolean } = {}): void {
  // The demo never sends: strangers' forms must not email or post anywhere.
  if (isDemo()) return
  const p: Promise<void> = run(formId, submissionId, extra)
    .catch(err => formsLog.error('notify_failed', err, { form: formId, submission: submissionId }))
    .finally(() => { pending.delete(p) })
  pending.add(p)
}

/** Settings › Notifications › Send a test: a sample post to the form's Slack target, now. */
export async function sendSlackTest(formId: string, by: string | null): Promise<{ ok: true; target: string }> {
  const row = repo.getForm(formId)
  if (!row) throw new ServiceError(404, 'form not found')
  if (isDemo()) throw new ServiceError(403, 'Slack is turned off in the demo.')
  const ops = parseOps(row.ops)
  const target = ops.slack.target
  if (!target) throw new ServiceError(400, 'Choose a Slack channel or person first')
  if (repo.countNotifications({ formId, kind: 'slack', since: new Date(Date.now() - 3600_000).toISOString() }) >= NOTIFY_CAPS.slackPerFormPerHour) {
    throw new ServiceError(429, `Over ${NOTIFY_CAPS.slackPerFormPerHour} Slack posts in an hour for this form. Try again later.`)
  }
  const def = loadDefinition(row.draftDefinition)
  const logId = repo.insertNotification({ formId, submissionId: null, kind: 'slack', recipient: target.label, status: 'sent', detail: 'Test post' })
  const r = await postToSlack(target, slackTestText(def, ops.slack, `${portalUrl()}/forms/responses?form=${formId}`))
    .catch((err: Error): { ok: false; error: string } => ({ ok: false, error: err.message || 'post failed' }))
  if (!r.ok) {
    const why = slackProblem(r.error, target)
    repo.updateNotification(logId, 'failed', `Test post · ${why}`)
    formsLog.warn('notify.slack_test_failed', { form: formId, by, error: r.error })
    throw new ServiceError(400, why)
  }
  formsLog.info('notify.slack_test', { form: formId, by })
  return { ok: true, target: target.label }
}

function answerLines(def: FormDefinition, answers: AnswerMap, forRespondent: boolean): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const b of allBlocks(def)) {
    if (!isInputBlock(b) || answers[b.id] === undefined || (forRespondent && b.type === 'hidden')) continue
    const d = componentDef(b.type)
    if (d.isEmpty(answers[b.id])) continue
    out.push([renderTemplate(b.label, def, answers) || d.label, d.display(b, answers[b.id]).slice(0, 1000)])
  }
  return out
}

function firstEmailAnswer(def: FormDefinition, answers: AnswerMap): string | null {
  for (const b of allBlocks(def)) {
    if (b.type !== 'email') continue
    const v = answers[b.id]
    if (typeof v === 'string' && isEmail(v.trim())) return v.trim().toLowerCase()
  }
  return null
}

async function run(formId: string, submissionId: string, extra: { editToken?: string | null; edited?: boolean }): Promise<void> {
  const row = repo.getForm(formId)
  const sub = repo.getSubmission(submissionId)
  if (!row || !sub || sub.status !== 'completed' || sub.deletedAt) return
  const ops = parseOps(row.ops)
  const wantConfirmation = ops.notify.confirmation && !extra.edited
  // A changed response doesn't post again: a custom message ("New lead: …") would read as a second lead.
  const slackTarget = ops.slack.on && !extra.edited ? ops.slack.target : null
  if (!ops.notify.owner && !wantConfirmation && !slackTarget) return
  const version = repo.getVersion(sub.versionId)
  if (!version) return
  const def = loadDefinition(version.definition)
  const answers = JSON.parse(sub.answers || '{}') as AnswerMap
  // The chosen sender, or the SMTP sender when email is set up and none was chosen.
  const sender = getWorkspace().notifications.sender ?? (emailFrom() ? 'smtp' : null)
  const portal = portalUrl()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const log = (kind: repo.NotificationKind, recipient: string, status: repo.NotificationStatus, detail: string) => repo.insertNotification({ formId, submissionId, kind, recipient, recipientKey: recipient && kind !== 'slack' ? mailboxKey(recipient) : '', status, detail })
  // The log row is written before the send, in the same synchronous step as the
  // cap check, so a burst of responses can't all pass the check at once.
  const send = async (kind: repo.NotificationKind, to: string, subject: string, body: string) => {
    const logId = log(kind, to, 'sent', '')
    try {
      await deps.send(sender!, { to, subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200), body })
      formsLog.info('notify.sent', { form: formId, submission: submissionId, kind })
    } catch (err) {
      repo.updateNotification(logId, 'failed', (err as Error).message || 'send failed')
      formsLog.warn('notify.failed', { form: formId, submission: submissionId, kind, error: (err as Error).message })
    }
  }

  if (slackTarget) {
    if (repo.countNotifications({ formId, kind: 'slack', since: hourAgo }) >= NOTIFY_CAPS.slackPerFormPerHour) log('slack', slackTarget.label, 'skipped', `Over ${NOTIFY_CAPS.slackPerFormPerHour} Slack posts in an hour for this form.`)
    else {
      const logId = log('slack', slackTarget.label, 'sent', '')
      const r = await postToSlack(slackTarget, slackText(def, answers, ops.slack, responseUrl(portal, formId, submissionId)))
        .catch((err: Error): { ok: false; error: string } => ({ ok: false, error: err.message || 'post failed' }))
      if (r.ok) formsLog.info('notify.sent', { form: formId, submission: submissionId, kind: 'slack' })
      else {
        repo.updateNotification(logId, 'failed', slackProblem(r.error, slackTarget))
        formsLog.warn('notify.failed', { form: formId, submission: submissionId, kind: 'slack', error: r.error })
      }
    }
  }

  if (ops.notify.owner) {
    const recipients = ops.notify.recipients.length ? ops.notify.recipients : [row.owner ?? row.createdBy ?? ''].map(e => e.toLowerCase()).filter(isEmail)
    if (!recipients.length) log('owner', '', 'skipped', 'No recipients — add one in the form’s Settings › Notifications.')
    const when = formatWhen(sub.editedAt ?? sub.submittedAt ?? sub.lastActivityAt, 'en', ops.timezone)
    const lines = answerLines(def, answers, false)
    for (const to of recipients) {
      if (!sender) { log('owner', to, 'skipped', 'Email isn’t set up — set FORMS_SMTP_URL and FORMS_EMAIL_FROM (see the README).'); continue }
      if (repo.countNotifications({ formId, kind: 'owner', since: hourAgo }) >= NOTIFY_CAPS.alertsPerFormPerHour) { log('owner', to, 'skipped', `Over ${NOTIFY_CAPS.alertsPerFormPerHour} alerts in an hour for this form.`); continue }
      const subject = `${extra.edited ? 'Response changed' : 'New response'}: ${def.title}`
      const body = [
        `${extra.edited ? 'A response was changed' : 'A new response arrived'} on “${def.title}” at ${when}.`, '',
        ...lines.map(([l, t]) => `${l}: ${t}`), '',
        `Open it: ${responseUrl(portal, formId, submissionId)}`,
      ].join('\n')
      await send('owner', to, subject, body)
    }
  }

  if (wantConfirmation) {
    const to = firstEmailAnswer(def, answers)
    if (!to) { log('confirmation', '', 'skipped', 'The response has no email answer to send to.'); return }
    if (!sender) { log('confirmation', to, 'skipped', 'Email isn’t set up — set FORMS_SMTP_URL and FORMS_EMAIL_FROM (see the README).'); return }
    if (repo.countNotifications({ formId, kind: 'confirmation', since: hourAgo }) >= NOTIFY_CAPS.confirmationsPerFormPerHour) { log('confirmation', to, 'skipped', `Over ${NOTIFY_CAPS.confirmationsPerFormPerHour} confirmations in an hour for this form.`); return }
    if (repo.countNotifications({ kind: 'confirmation', recipientKey: mailboxKey(to), since: dayAgo }) >= NOTIFY_CAPS.confirmationsPerAddressPerDay) { log('confirmation', to, 'skipped', `This address already had ${NOTIFY_CAPS.confirmationsPerAddressPerDay} confirmations today.`); return }
    const ui = uiFor(def.settings.language)
    const subject = ops.notify.subject ? renderTemplate(ops.notify.subject, def, answers) : ui.confirmationSubject(def.title)
    const parts = [ops.notify.message ? renderTemplate(ops.notify.message, def, answers) : ui.confirmationIntro]
    const lines = answerLines(def, answers, true)
    if (ops.notify.includeAnswers && lines.length) parts.push('', `${ui.yourAnswers}:`, ...lines.map(([l, t]) => `${l}: ${t}`))
    if (extra.editToken) parts.push('', `${ui.changeAnswers}: ${portal}/f/${row.slug}#edit=${extra.editToken}`)
    await send('confirmation', to, subject, parts.join('\n'))
  }
}
