// A form's operational settings: who may respond, when, how often, who hears
// about it. They live in forms.ops and take effect
// the moment they are saved. What a respondent SEES (questions, design, the
// back button, the language) is the form document and goes live on publish;
// these settings are the door around it.

import crypto from 'node:crypto'
import { appSecret } from '../config.js'
import { ServiceError } from './errors'

export type AccessMode = 'public' | 'restricted'
/** allow: no check · device: one per browser · email: one per email answer · account: one per signed-in person. */
export type DuplicateMode = 'allow' | 'device' | 'email' | 'account'

export interface NotifySettings {
  /** Email the form's recipients when a response arrives. */
  owner: boolean
  /** Empty means the form's owner. */
  recipients: string[]
  /** Email the respondent (at the form's first email question) a confirmation. */
  confirmation: boolean
  /** Empty uses the form language's default. */
  subject: string
  message: string
  includeAnswers: boolean
}

/** Where a form posts in Slack: a channel, or a person (a direct message). */
export interface SlackTarget { kind: 'channel' | 'user'; id: string; label: string }

export interface SlackSettings {
  /** Post to Slack when a response arrives. */
  on: boolean
  target: SlackTarget | null
  /** The first line of the post; empty uses "New response to <title>". Recall works. */
  message: string
  /** The questions the post includes, by block id. Null includes every answered one. */
  fields: string[] | null
}

export interface FormOps {
  opensAt: string | null
  closesAt: string | null
  maxResponses: number | null
  /** IANA zone the opening and closing times are shown in. */
  timezone: string
  access: AccessMode
  password: { salt: string; hash: string } | null
  duplicates: DuplicateMode
  notify: NotifySettings
  slack: SlackSettings
  /** Responses older than this many days are deleted. Null keeps them. */
  retentionDays: number | null
  /** Set when archiving closed an open form, so restoring reopens it. */
  reopenOnRestore: boolean
}

export const DEFAULT_TIMEZONE = 'America/New_York'

export const DEFAULT_NOTIFY: NotifySettings = { owner: true, recipients: [], confirmation: false, subject: '', message: '', includeAnswers: true }

export const DEFAULT_SLACK: SlackSettings = { on: false, target: null, message: '', fields: null }

export function defaultOps(): FormOps {
  return { opensAt: null, closesAt: null, maxResponses: null, timezone: DEFAULT_TIMEZONE, access: 'public', password: null, duplicates: 'allow', notify: { ...DEFAULT_NOTIFY, recipients: [] }, slack: { ...DEFAULT_SLACK }, retentionDays: null, reopenOnRestore: false }
}

const SLACK_CHANNEL_ID = /^[CGD][A-Z0-9]{6,20}$/
const SLACK_USER_ID = /^[UW][A-Z0-9]{6,20}$/
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/

function parseSlackTarget(v: unknown): SlackTarget | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Record<string, unknown>
  if (typeof t.id !== 'string' || !(t.kind === 'channel' ? SLACK_CHANNEL_ID : t.kind === 'user' ? SLACK_USER_ID : null)?.test(t.id)) return null
  return { kind: t.kind as SlackTarget['kind'], id: t.id, label: typeof t.label === 'string' && t.label.trim() ? t.label.trim().slice(0, 200) : t.id }
}

function parseFields(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && BLOCK_ID.test(x)))].slice(0, 200)
}

/** One plain address. A name, quotes, brackets or a second address would reach a mail header as typed. */
export const isEmail = (s: string): boolean => s.length <= 254 && /^[^\s@<>()[\]\\,;:"\x00-\x1f\x7f]+@[^\s@<>()[\]\\,;:"\x00-\x1f\x7f]+\.[^\s@<>()[\]\\,;:"\x00-\x1f\x7f]{2,}$/.test(s)

/** The inbox an address reaches, for per-address caps: case, +tags and Gmail's dots fold away. */
export function mailboxKey(email: string): string {
  const at = email.lastIndexOf('@')
  let local = email.slice(0, at).toLowerCase().split('+')[0]
  let domain = email.slice(at + 1).toLowerCase()
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Stored JSON → ops. Tolerant: anything missing or malformed takes its default. */
export function parseOps(json: string | null | undefined): FormOps {
  const d = defaultOps()
  let r: Record<string, unknown> = {}
  try { const v = JSON.parse(json || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) r = v as Record<string, unknown> } catch { /* defaults */ }
  const n = (r.notify && typeof r.notify === 'object' ? r.notify : {}) as Record<string, unknown>
  const sl = (r.slack && typeof r.slack === 'object' ? r.slack : {}) as Record<string, unknown>
  const slackTarget = parseSlackTarget(sl.target)
  const pw = r.password && typeof r.password === 'object' ? (r.password as Record<string, unknown>) : null
  return {
    opensAt: isoOrNull(r.opensAt),
    closesAt: isoOrNull(r.closesAt),
    maxResponses: Number.isInteger(r.maxResponses) && (r.maxResponses as number) > 0 ? (r.maxResponses as number) : null,
    timezone: typeof r.timezone === 'string' && isValidTimezone(r.timezone) ? r.timezone : d.timezone,
    access: r.access === 'restricted' ? 'restricted' : 'public',
    password: pw && typeof pw.salt === 'string' && typeof pw.hash === 'string' ? { salt: pw.salt, hash: pw.hash } : null,
    duplicates: r.duplicates === 'device' || r.duplicates === 'email' || r.duplicates === 'account' ? r.duplicates : 'allow',
    notify: {
      owner: typeof n.owner === 'boolean' ? n.owner : d.notify.owner,
      recipients: Array.isArray(n.recipients) ? n.recipients.filter((e): e is string => typeof e === 'string' && isEmail(e)).slice(0, 10) : [],
      confirmation: n.confirmation === true,
      subject: typeof n.subject === 'string' ? n.subject.slice(0, 200) : '',
      message: typeof n.message === 'string' ? n.message.slice(0, 5000) : '',
      includeAnswers: typeof n.includeAnswers === 'boolean' ? n.includeAnswers : d.notify.includeAnswers,
    },
    slack: {
      on: sl.on === true && !!slackTarget,
      target: slackTarget,
      message: typeof sl.message === 'string' ? sl.message.slice(0, 1000) : '',
      fields: parseFields(sl.fields),
    },
    retentionDays: Number.isInteger(r.retentionDays) && (r.retentionDays as number) > 0 ? (r.retentionDays as number) : null,
    reopenOnRestore: r.reopenOnRestore === true,
  }
}

/** What the Settings tab sees: never the password hash. */
export type OpsView = Omit<FormOps, 'password' | 'reopenOnRestore'> & { hasPassword: boolean }

export function opsView(ops: FormOps): OpsView {
  const { password, reopenOnRestore: _r, ...rest } = ops
  return { ...rest, hasPassword: !!password }
}

export interface OpsPatch {
  opensAt?: string | null; closesAt?: string | null; maxResponses?: number | null; timezone?: string
  access?: AccessMode; password?: string | null; duplicates?: DuplicateMode
  notify?: Partial<NotifySettings>; slack?: Partial<SlackSettings>; retentionDays?: number | null
}

/** Validates a patch from the Settings tab onto the current ops. A string
 *  password sets a new one; null removes it; absent keeps it. */
export function patchOps(current: FormOps, patch: OpsPatch): FormOps {
  const next: FormOps = { ...current, notify: { ...current.notify }, slack: { ...current.slack } }
  const bad = (msg: string) => { throw new ServiceError(400, msg) }
  const when = (v: unknown, label: string): string | null => {
    if (v === null || v === '') return null
    const iso = isoOrNull(v)
    if (!iso) bad(`${label} is not a date`)
    return iso
  }
  if (patch.opensAt !== undefined) next.opensAt = when(patch.opensAt, 'The opening time')
  if (patch.closesAt !== undefined) next.closesAt = when(patch.closesAt, 'The closing time')
  if (next.opensAt && next.closesAt && Date.parse(next.closesAt) <= Date.parse(next.opensAt)) bad('The closing time has to be after the opening time')
  if (patch.maxResponses !== undefined) {
    const m = patch.maxResponses
    if (m === null) next.maxResponses = null
    else if (!Number.isInteger(m) || m < 1 || m > 1_000_000) bad('The response limit has to be a whole number from 1 to 1,000,000')
    else next.maxResponses = m
  }
  if (patch.timezone !== undefined) { if (!isValidTimezone(patch.timezone)) bad('Unknown time zone'); next.timezone = patch.timezone }
  if (patch.access !== undefined) { if (patch.access !== 'public' && patch.access !== 'restricted') bad('Access is public or restricted'); next.access = patch.access }
  if (patch.password !== undefined) {
    if (patch.password === null || patch.password === '') next.password = null
    else if (typeof patch.password !== 'string' || patch.password.length < 4 || patch.password.length > 200) bad('Passwords need at least 4 characters')
    else next.password = hashPassword(patch.password)
  }
  if (patch.duplicates !== undefined) {
    if (!['allow', 'device', 'email', 'account'].includes(patch.duplicates)) bad('Unknown duplicate setting')
    next.duplicates = patch.duplicates
  }
  if (next.duplicates === 'account' && next.access !== 'restricted') bad('One response per person needs sign-in access, so each response has a person to count')
  if (patch.notify) {
    const n = patch.notify
    if (n.owner !== undefined) next.notify.owner = !!n.owner
    if (n.confirmation !== undefined) next.notify.confirmation = !!n.confirmation
    if (n.includeAnswers !== undefined) next.notify.includeAnswers = !!n.includeAnswers
    if (n.recipients !== undefined) {
      if (!Array.isArray(n.recipients)) bad('Recipients are a list of email addresses')
      const list = [...new Set(n.recipients.map(e => String(e).trim().toLowerCase()).filter(Boolean))]
      const wrong = list.find(e => !isEmail(e))
      if (wrong) bad(`${wrong} is not an email address`)
      if (list.length > 10) bad('Up to 10 recipients')
      next.notify.recipients = list
    }
    if (n.subject !== undefined) next.notify.subject = String(n.subject).replace(/[\r\n]+/g, ' ').slice(0, 200)
    if (n.message !== undefined) next.notify.message = String(n.message).slice(0, 5000)
  }
  if (patch.slack) {
    const s = patch.slack
    if (s.target !== undefined) {
      if (s.target === null) next.slack.target = null
      else {
        const t = parseSlackTarget(s.target)
        if (!t) bad('Choose a Slack channel or person from the list')
        next.slack.target = t
      }
    }
    if (s.message !== undefined) next.slack.message = String(s.message ?? '').slice(0, 1000)
    if (s.fields !== undefined) {
      if (s.fields !== null && !Array.isArray(s.fields)) bad('Fields are a list of question ids, or null for all of them')
      next.slack.fields = s.fields === null ? null : parseFields(s.fields)
    }
    if (s.on !== undefined) next.slack.on = !!s.on
    if (next.slack.on && !next.slack.target) bad('Choose a Slack channel or person first')
  }
  if (patch.retentionDays !== undefined) {
    const d = patch.retentionDays
    if (d === null) next.retentionDays = null
    else if (!Number.isInteger(d) || d < 1 || d > 3650) bad('Keep responses for 1 to 3,650 days, or forever')
    else next.retentionDays = d
  }
  return next
}

// ── Password ────────────────────────────────────────────────────────────────

export function hashPassword(pw: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') }
}

export function verifyPassword(pw: string, stored: { salt: string; hash: string }): boolean {
  const got = crypto.scryptSync(String(pw).slice(0, 200), stored.salt, 32)
  const want = Buffer.from(stored.hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

/** How long one correct password keeps a browser tab in. */
export const UNLOCK_TTL_MS = 12 * 3600 * 1000

// Keyed off the engine secret, so a token can't be minted without it. The
// password hash is in the signed payload: changing the password logs everyone out.
function unlockKey(): Buffer {
  return crypto.createHash('sha256').update(`forms-unlock:${appSecret()}`).digest()
}

export function unlockToken(formId: string, pw: { hash: string }, now = Date.now()): string {
  const exp = now + UNLOCK_TTL_MS
  const sig = crypto.createHmac('sha256', unlockKey()).update(`${formId}.${exp}.${pw.hash}`).digest('base64url')
  return `${exp}.${sig}`
}

export function checkUnlock(formId: string, pw: { hash: string }, token: string | null | undefined, now = Date.now()): boolean {
  if (!token || token.length > 200) return false
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < now || !sig) return false
  const want = Buffer.from(crypto.createHmac('sha256', unlockKey()).update(`${formId}.${exp}.${pw.hash}`).digest('base64url'))
  // Compare bytes, not characters: a header with non-ASCII in it must be a wrong token, not a 500.
  const got = Buffer.from(sig)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

// ── Availability ────────────────────────────────────────────────────────────

export type Availability =
  | { state: 'open' }
  | { state: 'scheduled'; opensAt: string }
  | { state: 'closed'; reason: 'manual' | 'date' | 'limit' }

/** Whether a published form takes responses right now. `completed` is only
 *  read when there is a limit, so callers pass a thunk. */
export function availabilityOf(status: string, ops: FormOps, completed: () => number, now = Date.now()): Availability {
  if (status === 'closed') return { state: 'closed', reason: 'manual' }
  if (ops.opensAt && now < Date.parse(ops.opensAt)) return { state: 'scheduled', opensAt: ops.opensAt }
  if (ops.closesAt && now >= Date.parse(ops.closesAt)) return { state: 'closed', reason: 'date' }
  if (ops.maxResponses && completed() >= ops.maxResponses) return { state: 'closed', reason: 'limit' }
  return { state: 'open' }
}
