// The business layer: everything the API does, with no HTTP in it. Every
// state change goes through here so the rules (immutable versions, revision
// checks, idempotent submission, hidden-answer stripping, file ownership) are
// enforced once. The router only parses requests and formats responses.

import crypto from 'node:crypto'
import type { Readable } from 'node:stream'
import * as repo from './repo'
import { getStorage, fileKey, assetKey, BytesLimitError } from './storage'
import { formsLog } from './log'
import { abuseVerdict, deviceSummary } from './abuse'
import {
  SCHEMA_VERSION, definitionHash, emptyForm, cloneDefinition, longId, secretToken,
  allBlocks, answerPages, checkRules, evaluate, stripInactive, applySetValues, normalizeAnswers, validatePage, pagePath,
  componentDef, isInputBlock, fileGate, extensionOf, uploadSettings, renderTemplate, csvLine, CSV_BOM, DEFAULT_CLOSED_MESSAGE, ruleSentence, errorsFor,
  type FormDefinition, type AnswerMap, type Block, type FileAnswer, type ValidationContext, type Ending, type Page, type FormLanguage, type LogicState,
} from './core/index'
import { ServiceError } from './errors'
import { loadDefinition, acceptDefinition } from './definitions'
import { parseOps, opsView, patchOps, availabilityOf, checkUnlock, unlockToken, verifyPassword, isEmail, type FormOps, type OpsView, type OpsPatch, type Availability, type DuplicateMode } from './ops'
import { withWorkspaceDefaults, opsForNewForm } from './workspace'
import { notifySubmission } from './notify'

export { ServiceError, loadDefinition }

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex')

// ── Slugs ────────────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return base || 'form'
}

function uniqueSlug(title: string, exceptId?: string): string {
  const base = slugify(title)
  if (!repo.slugTaken(base, exceptId)) return base
  for (let i = 0; i < 20; i++) {
    const candidate = `${base}-${crypto.randomBytes(2).toString('hex')}`
    if (!repo.slugTaken(candidate, exceptId)) return candidate
  }
  return `${base}-${longId('frm').slice(4, 12)}`
}

/** Until a form is first published its link follows its name, as long as the
 *  link is still a generated one (the previous name's slug, or untitled-form):
 *  QA retest 2026-09-25 found "untitled-form-d76b" about to escape into use
 *  after a rename. A link that was ever published, or that someone typed, never
 *  moves. Returns the slug the form ends up with. */
function followTitle(id: string, before: { title: string; slug: string }, title: string): string {
  if (before.title === title || repo.versionCount(id) > 0) return before.slug
  const prev = slugify(before.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`^(${prev}|untitled-form)(-[0-9a-z]{4,8})?$`).test(before.slug)) return before.slug
  const next = uniqueSlug(title, id)
  if (next === before.slug || !isValidSlug(next)) return before.slug
  repo.updateFormMeta(id, { slug: next })
  formsLog.info('slug.followed_title', { form: id, from: before.slug, to: next })
  return next
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/.test(slug) && !['api', 'f', 'forms', 'auth', 'embed', 'new'].includes(slug)
}

// ── Forms (authenticated) ────────────────────────────────────────────────────

export interface FormSummary {
  id: string; slug: string; title: string; status: repo.FormStatus; publishState: 'draft' | 'live' | 'dirty' | 'closed'
  /** The draft differs from what the link serves. Independent of closed: a closed form can still have edits to publish. */
  unpublishedChanges: boolean
  pages: number; fields: number; completedCount: number; partialCount: number; lastResponseAt: string | null
  updatedAt: string; updatedBy: string | null; createdBy: string | null; liveNumber: number | null
  /** Internal name ('' shows the title), owner, folder, archive. */
  name: string; owner: string | null; folderId: string | null; archivedAt: string | null
  unreadCount: number
  /** Whether a published form takes responses now: scheduled and closed-by-date or limit show here. */
  availability: Availability['state']; closedReason: 'manual' | 'date' | 'limit' | null
}

export function unpublishedChanges(row: Pick<repo.FormRow, 'draftHash' | 'liveVersionId'>, liveHash: string | null): boolean {
  return !row.liveVersionId || !liveHash || liveHash !== row.draftHash
}

export function publishState(row: Pick<repo.FormRow, 'status' | 'draftHash' | 'liveVersionId'>, liveHash: string | null): FormSummary['publishState'] {
  if (row.status === 'closed') return 'closed'
  if (!row.liveVersionId) return 'draft'
  return liveHash && liveHash === row.draftHash ? 'live' : 'dirty'
}

export function listForms(opts: { archived?: boolean } = {}): FormSummary[] {
  return repo.listForms(opts).map(r => {
    let pages = 0, fields = 0
    try { const d = loadDefinition(r.draftDefinition); pages = answerPages(d).length; fields = allBlocks(d).filter(isInputBlock).length } catch { /* counted as 0 */ }
    return {
      id: r.id, slug: r.slug, title: r.title, status: r.status, publishState: publishState(r, r.liveHash), unpublishedChanges: unpublishedChanges(r, r.liveHash), pages, fields,
      completedCount: r.completedCount, partialCount: r.partialCount, lastResponseAt: r.lastResponseAt, updatedAt: r.updatedAt, updatedBy: r.draftUpdatedBy, createdBy: r.createdBy, liveNumber: r.liveNumber,
      name: r.name, owner: r.owner ?? r.createdBy, folderId: r.folderId, archivedAt: r.archivedAt, unreadCount: r.unreadCount, ...availabilityFields(r, () => r.completedCount),
    }
  })
}

function availabilityFields(row: repo.FormRow, completed: () => number): { availability: Availability['state']; closedReason: 'manual' | 'date' | 'limit' | null } {
  const a = availabilityOf(row.status, parseOps(row.ops), completed)
  return { availability: a.state, closedReason: a.state === 'closed' ? a.reason : null }
}

export interface FormDetail {
  id: string; slug: string; title: string; status: repo.FormStatus; publishState: FormSummary['publishState']; unpublishedChanges: boolean
  draft: FormDefinition; revision: number; draftUpdatedAt: string; draftUpdatedBy: string | null
  live: { versionId: string; number: number; publishedAt: string; hash: string } | null
  versions: Array<{ id: string; number: number; publishedAt: string; publishedBy: string | null }>
  closedMessage: string; createdAt: string
  name: string; owner: string | null; folderId: string | null; archivedAt: string | null
  /** Operational settings (ops.ts): they take effect when saved, not on publish. */
  ops: OpsView
  availability: Availability['state']; closedReason: 'manual' | 'date' | 'limit' | null; opensAt: string | null
  completedCount: number; unreadCount: number
}

export function getFormDetail(id: string): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  const draft = loadDefinition(row.draftDefinition)
  const ops = parseOps(row.ops)
  const completed = repo.completedCount(id)
  const versions = repo.listVersions(id)
  const live = row.liveVersionId ? versions.find(v => v.id === row.liveVersionId) ?? null : null
  return {
    id: row.id, slug: row.slug, title: row.title, status: row.status, publishState: publishState(row, live?.definitionHash ?? null), unpublishedChanges: unpublishedChanges(row, live?.definitionHash ?? null),
    draft, revision: row.draftRevision, draftUpdatedAt: row.draftUpdatedAt, draftUpdatedBy: row.draftUpdatedBy,
    live: live ? { versionId: live.id, number: live.number, publishedAt: live.publishedAt, hash: live.definitionHash } : null,
    versions: versions.map(v => ({ id: v.id, number: v.number, publishedAt: v.publishedAt, publishedBy: v.publishedBy })),
    closedMessage: row.closedMessage || DEFAULT_CLOSED_MESSAGE, createdAt: row.createdAt,
    name: row.name, owner: row.owner ?? row.createdBy, folderId: row.folderId, archivedAt: row.archivedAt,
    ops: opsView(ops), ...availabilityFields(row, () => completed), opensAt: ops.opensAt, completedCount: completed, unreadCount: repo.unreadCount(id),
  }
}

/** A blank form starts from the workspace defaults (theme, language, progress,
 *  thank-you message); a document handed in keeps its own, unless `defaults`
 *  says otherwise (a built-in template takes everything but its questions). */
export function createForm(input: { title?: string; definition?: unknown; createdBy: string | null; folderId?: string | null; defaults?: 'all' | 'settings' | 'none' }): FormDetail {
  let def = input.definition ? acceptDefinition(input.definition) : emptyForm(input.title?.trim() || 'Untitled form')
  const defaults = input.defaults ?? (input.definition ? 'none' : 'all')
  if (defaults !== 'none') def = withWorkspaceDefaults(def, { theme: defaults === 'all' })
  if (input.title?.trim()) def.title = input.title.trim().slice(0, 300)
  const folderId = input.folderId ? checkFolder(input.folderId) : null
  const id = longId('frm')
  const slug = uniqueSlug(def.title)
  repo.insertForm({ id, slug, title: def.title, draftDefinition: JSON.stringify(def), draftHash: definitionHash(def), createdBy: input.createdBy, ops: JSON.stringify(opsForNewForm()), folderId })
  formsLog.info('form.created', { form: id, slug, by: input.createdBy })
  return getFormDetail(id)
}

function checkFolder(folderId: string): string {
  if (!repo.getFolder(folderId)) throw new ServiceError(400, 'that folder doesn’t exist')
  return folderId
}

export function saveDraft(id: string, input: { definition: unknown; baseRevision: number; by: string | null }): { ok: true; revision: number; updatedAt: string; publishState: FormSummary['publishState']; unpublishedChanges: boolean; slug: string } | { ok: false; conflict: true; revision: number; definition: FormDefinition; updatedAt: string; updatedBy: string | null } {
  const def = acceptDefinition(input.definition)
  if (!Number.isInteger(input.baseRevision)) throw new ServiceError(400, 'baseRevision required')
  const json = JSON.stringify(def)
  const before = repo.getForm(id)
  const res = repo.updateDraft(id, input.baseRevision, json, definitionHash(def), def.title, input.by)
  if (!res.ok) {
    formsLog.warn('draft.conflict', { form: id, base: input.baseRevision, current: res.current.draftRevision })
    return { ok: false, conflict: true, revision: res.current.draftRevision, definition: loadDefinition(res.current.draftDefinition), updatedAt: res.current.draftUpdatedAt, updatedBy: res.current.draftUpdatedBy }
  }
  const slug = before ? followTitle(id, before, def.title) : ''
  const row = repo.getForm(id)!
  const live = row.liveVersionId ? repo.getVersion(row.liveVersionId) : undefined
  return { ok: true, revision: res.revision, updatedAt: res.updatedAt, publishState: publishState(row, live?.definitionHash ?? null), unpublishedChanges: unpublishedChanges(row, live?.definitionHash ?? null), slug: slug || row.slug }
}

export function patchForm(id: string, patch: { title?: string; slug?: string; closedMessage?: string; by: string | null }): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 300)
    if (!title) throw new ServiceError(400, 'title required')
    const def = loadDefinition(row.draftDefinition)
    def.title = title
    const res = repo.updateDraft(id, row.draftRevision, JSON.stringify(def), definitionHash(def), title, patch.by)
    if (!res.ok) throw new ServiceError(409, 'form changed meanwhile', { revision: res.current.draftRevision })
    if (patch.slug === undefined) followTitle(id, row, title)
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim().toLowerCase()
    if (!isValidSlug(slug)) throw new ServiceError(400, 'slug may only use lowercase letters, numbers and dashes')
    if (repo.slugTaken(slug, id)) throw new ServiceError(409, 'that link is already taken')
    repo.updateFormMeta(id, { slug })
  }
  if (patch.closedMessage !== undefined) repo.updateFormMeta(id, { closedMessage: patch.closedMessage.slice(0, 2000) })
  return getFormDetail(id)
}

export function duplicateForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  const def = cloneDefinition(loadDefinition(row.draftDefinition))
  def.title = `${def.title} copy`
  const newId = longId('frm')
  const ops: FormOps = { ...parseOps(row.ops), reopenOnRestore: false }
  repo.insertForm({ id: newId, slug: uniqueSlug(def.title), title: def.title, draftDefinition: JSON.stringify(def), draftHash: definitionHash(def), createdBy: by, ops: JSON.stringify(ops), folderId: row.folderId })
  formsLog.info('form.duplicated', { form: newId, from: id, by })
  return getFormDetail(newId)
}

export function deleteForm(id: string, by: string | null): void {
  if (!repo.softDeleteForm(id)) throw new ServiceError(404, 'form not found')
  formsLog.info('form.deleted', { form: id, by })
}

/** `created` is false when the draft matched the live version and nothing new was made.
 *  `publishState` is 'closed' when the form was closed to responses: publishing
 *  changes what the link serves, never whether it accepts responses. */
export interface PublishResult { ok: true; version: { id: string; number: number; publishedAt: string }; slug: string; publishState: 'live' | 'closed'; created: boolean }

export function publishForm(id: string, input: { baseRevision?: number; by: string | null }): PublishResult {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (input.baseRevision !== undefined && input.baseRevision !== row.draftRevision) throw new ServiceError(409, 'the draft changed in another tab — reload before publishing', { revision: row.draftRevision })
  const def = loadDefinition(row.draftDefinition)
  const issues = checkRules(def)
  if (issues.length) throw new ServiceError(422, 'fix broken rules before publishing', { issues })
  const hasQuestion = allBlocks(def).some(isInputBlock)
  if (!hasQuestion) throw new ServiceError(422, 'add at least one question before publishing', { issues: [{ kind: 'empty_form', message: 'The form has no questions yet.' }] })
  const existingLive = row.liveVersionId ? repo.getVersion(row.liveVersionId) : undefined
  // Closed is the author's decision about accepting responses, separate from what
  // the link serves: publishing new content keeps a closed form closed. Reopening
  // is its own action (reopenForm). QA 2026-09-24: "Publish changes" used to reopen.
  const closed = row.status === 'closed'
  const state: PublishResult['publishState'] = closed ? 'closed' : 'live'
  if (existingLive && existingLive.definitionHash === row.draftHash && (row.status === 'published' || closed)) {
    return { ok: true, version: { id: existingLive.id, number: existingLive.number, publishedAt: existingLive.publishedAt }, slug: row.slug, publishState: state, created: false }
  }
  let created = false
  const version = repo.transaction(() => {
    const reuse = existingLive && existingLive.definitionHash === row.draftHash
    const v = reuse
      ? existingLive
      : repo.insertVersion({ id: longId('ver'), formId: id, number: repo.nextVersionNumber(id), schemaVersion: SCHEMA_VERSION, definition: JSON.stringify(def), definitionHash: definitionHash(def), publishedBy: input.by })
    created = !reuse
    // The draft is what was just published. Its stored hash can predate a schema default
    // (a draft saved before a deploy), and left alone it would read "unpublished" forever.
    const draftHash = v.definitionHash
    repo.updateFormMeta(id, closed ? { liveVersionId: v.id, publishedAt: repo.nowIso(), draftHash } : { status: 'published', liveVersionId: v.id, publishedAt: repo.nowIso(), closedAt: null, draftHash })
    return v
  })
  formsLog.info('form.published', { form: id, version: version.id, number: version.number, closed, by: input.by })
  return { ok: true, version: { id: version.id, number: version.number, publishedAt: version.publishedAt }, slug: row.slug, publishState: state, created }
}

export function closeForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (!row.liveVersionId) throw new ServiceError(400, 'publish the form before closing it')
  repo.updateFormMeta(id, { status: 'closed', closedAt: repo.nowIso() })
  formsLog.info('form.closed', { form: id, by })
  return getFormDetail(id)
}

export function reopenForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (row.status !== 'closed') return getFormDetail(id)
  repo.updateFormMeta(id, { status: 'published', closedAt: null })
  formsLog.info('form.reopened', { form: id, by })
  return getFormDetail(id)
}

export function unpublishForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  repo.updateFormMeta(id, { status: 'draft', liveVersionId: null, closedAt: null })
  formsLog.info('form.unpublished', { form: id, by })
  return getFormDetail(id)
}

export interface SettingsPatch {
  name?: string; owner?: string | null; folderId?: string | null; closedMessage?: string
  /** Close or reopen (the Availability switch). */
  acceptingResponses?: boolean
  ops?: OpsPatch
}

/** Everything in the form's Settings tab that is not part of the document:
 *  saved at once, live at once. */
export function updateFormSettings(id: string, patch: SettingsPatch, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  const meta: Parameters<typeof repo.updateFormMeta>[1] = {}
  if (patch.name !== undefined) meta.name = String(patch.name).replace(/\s+/g, ' ').trim().slice(0, 120)
  if (patch.owner !== undefined) {
    const owner = patch.owner === null ? '' : String(patch.owner).trim().toLowerCase()
    if (owner && !isEmail(owner)) throw new ServiceError(400, 'the owner has to be an email address')
    meta.owner = owner || null
  }
  if (patch.folderId !== undefined) meta.folderId = patch.folderId ? checkFolder(patch.folderId) : null
  if (patch.closedMessage !== undefined) meta.closedMessage = String(patch.closedMessage).slice(0, 2000)
  if (patch.ops) meta.ops = JSON.stringify(patchOps(parseOps(row.ops), patch.ops))
  repo.updateFormMeta(id, meta)
  if (patch.acceptingResponses === false && row.status !== 'closed') closeForm(id, by)
  if (patch.acceptingResponses === true && row.status === 'closed') reopenForm(id, by)
  formsLog.info('form.settings', { form: id, by, keys: [...Object.keys(meta), ...(patch.acceptingResponses === undefined ? [] : ['accepting'])].join(',') })
  return getFormDetail(id)
}

/** Archived forms leave the list. An open form is closed on the way, and
 *  opens again when it is restored. */
export function archiveForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (row.archivedAt) return getFormDetail(id)
  const closing = row.status === 'published'
  const at = repo.nowIso()
  repo.updateFormMeta(id, { archivedAt: at, ops: JSON.stringify({ ...parseOps(row.ops), reopenOnRestore: closing }), ...(closing ? { status: 'closed' as const, closedAt: at } : {}) })
  formsLog.info('form.archived', { form: id, closed: closing, by })
  return getFormDetail(id)
}

export function restoreForm(id: string, by: string | null): FormDetail {
  const row = repo.getForm(id)
  if (!row) throw new ServiceError(404, 'form not found')
  if (!row.archivedAt) return getFormDetail(id)
  const ops = parseOps(row.ops)
  const reopen = ops.reopenOnRestore && row.status === 'closed' && !!row.liveVersionId
  repo.updateFormMeta(id, { archivedAt: null, ops: JSON.stringify({ ...ops, reopenOnRestore: false }), ...(reopen ? { status: 'published' as const, closedAt: null } : {}) })
  formsLog.info('form.restored', { form: id, reopened: reopen, by })
  return getFormDetail(id)
}

export function getVersionDefinition(formId: string, versionId: string): { id: string; number: number; publishedAt: string; definition: FormDefinition } {
  const v = repo.getVersion(versionId)
  if (!v || v.formId !== formId) throw new ServiceError(404, 'version not found')
  return { id: v.id, number: v.number, publishedAt: v.publishedAt, definition: loadDefinition(v.definition) }
}

// ── Public surface ───────────────────────────────────────────────────────────

type PublicFormRef = { id: string; slug: string; title: string }
type PublicLook = { form: PublicFormRef; theme: FormDefinition['theme']; language: FormLanguage }

/** What the public page renders. Only 'live' carries the form document; every
 *  other state says why not, in the form's own look and language. */
export type PublicForm =
  | { status: 'live'; form: PublicFormRef; version: { id: string; number: number }; definition: FormDefinition; respond: { duplicates: DuplicateMode; respondent: string | null } }
  | (PublicLook & { status: 'closed'; closedMessage: string; reason: 'manual' | 'date' | 'limit' })
  | (PublicLook & { status: 'scheduled'; opensAt: string; timezone: string })
  | (PublicLook & { status: 'locked' | 'signin' })
  | (PublicLook & { status: 'responded'; canEdit: boolean })
  | { status: 'unavailable' }

/** What the dashboard vouches for about a respondent: the password token this
 *  tab holds, and who is signed in (only ever read for restricted forms). */
export interface RespondentAuth { unlock?: string | null; respondent?: string | null }

const signedIn = (v: unknown): string | null => {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return e && isEmail(e) ? e : null
}

function accessDenied(formId: string, ops: FormOps, auth: RespondentAuth): 'signin' | 'locked' | null {
  if (ops.access === 'restricted' && !signedIn(auth.respondent)) return 'signin'
  if (ops.password && !checkUnlock(formId, ops.password, auth.unlock)) return 'locked'
  return null
}

export function getPublicForm(slug: string, auth: RespondentAuth = {}): PublicForm {
  const row = repo.getFormBySlug(slug)
  if (!row || !row.liveVersionId) return { status: 'unavailable' }
  const v = repo.getVersion(row.liveVersionId)
  if (!v) return { status: 'unavailable' }
  const definition = loadDefinition(v.definition)
  const ops = parseOps(row.ops)
  const form = { id: row.id, slug: row.slug, title: definition.title }
  const look: PublicLook = { form, theme: definition.theme, language: definition.settings.language }
  const a = availabilityOf(row.status, ops, () => repo.completedCount(row.id))
  if (a.state === 'closed') return { ...look, status: 'closed', closedMessage: row.closedMessage, reason: a.reason }
  if (a.state === 'scheduled') return { ...look, status: 'scheduled', opensAt: a.opensAt, timezone: ops.timezone }
  const denied = accessDenied(row.id, ops, auth)
  if (denied) return { ...look, status: denied }
  const respondent = ops.access === 'restricted' ? signedIn(auth.respondent) : null
  if (ops.duplicates === 'account' && respondent && repo.findCompletedBy(row.id, { respondent }, null)) return { ...look, status: 'responded', canEdit: definition.settings.allowEdits }
  return { status: 'live', form, version: { id: v.id, number: v.number }, definition, respond: { duplicates: ops.duplicates, respondent } }
}

/** The password gate. A right password returns a token for this tab and the
 *  form itself; a wrong one is only ever "wrong" (and rate-limited upstream). */
export function unlockForm(formId: string, password: unknown, auth: RespondentAuth = {}): { token: string; form: PublicForm } {
  const row = repo.getForm(formId)
  if (!row || !row.liveVersionId) throw new ServiceError(404, 'form not available')
  const ops = parseOps(row.ops)
  if (!ops.password) throw new ServiceError(400, 'this form has no password')
  if (typeof password !== 'string' || !password || !verifyPassword(password, ops.password)) {
    formsLog.warn('unlock.refused', { form: formId })
    throw new ServiceError(403, 'wrong password', { wrongPassword: true })
  }
  const token = unlockToken(formId, ops.password)
  return { token, form: getPublicForm(row.slug, { ...auth, unlock: token }) }
}

/** The draft, rendered for the builder's preview: never a submission. */
export function getDraftForPreview(formId: string): { definition: FormDefinition; revision: number } {
  const row = repo.getForm(formId)
  if (!row) throw new ServiceError(404, 'form not found')
  return { definition: loadDefinition(row.draftDefinition), revision: row.draftRevision }
}

interface LiveContext { row: repo.FormRow; ops: FormOps; version: repo.VersionRow; definition: FormDefinition }

/** The live version, while the form takes responses: closed (by hand, date or
 *  limit) is 410 and not-open-yet is 403, for everyone including sessions in
 *  flight. */
function liveContext(formId: string): LiveContext {
  const row = repo.getForm(formId)
  if (!row || !row.liveVersionId) throw new ServiceError(404, 'form not available')
  const ops = parseOps(row.ops)
  const a = availabilityOf(row.status, ops, () => repo.completedCount(formId))
  if (a.state === 'closed') throw new ServiceError(410, 'form is closed', { closed: true, reason: a.reason })
  if (a.state === 'scheduled') throw new ServiceError(403, 'this form isn’t open yet', { notOpen: true, opensAt: a.opensAt })
  const version = repo.getVersion(row.liveVersionId)
  if (!version) throw new ServiceError(404, 'form not available')
  return { row, ops, version, definition: loadDefinition(version.definition) }
}

/** liveContext behind the door: sign-in for restricted forms, then the password. */
function respondentContext(formId: string, auth: RespondentAuth): LiveContext {
  const ctx = liveContext(formId)
  const denied = accessDenied(formId, ctx.ops, auth)
  if (denied === 'signin') throw new ServiceError(401, 'sign in to respond', { signin: true })
  if (denied === 'locked') throw new ServiceError(403, 'this form needs its password', { locked: true })
  return ctx
}

const deviceHashFor = (formId: string, deviceId: unknown): string | null =>
  typeof deviceId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(deviceId) ? sha256(`${formId}:${deviceId}`) : null

// ── Sessions belong to the version they started on ──────────────────────────
// Publishing must never pull the ground out from under someone halfway through
// a form. A respondent's saves, uploads and submit keep running against the
// version their page was loaded with, for as long as that version was
// superseded less than SESSION_VERSION_GRACE_MS ago (the same seven days their
// browser keeps the draft). Past that — or for a version this form never had —
// the answer is 409 versionChanged, and the page carries the answers onto the
// live version with a notice. Closed and unpublished still stop everyone.
// QA 2026-09-24 P0: a publish mid-session made the submit fail on every retry
// and a refresh came back blank.

export const SESSION_VERSION_GRACE_MS = 7 * 24 * 3600 * 1000

/** The version a session may keep using, or null when it has been retired. */
function acceptedSessionVersion(formId: string, live: repo.VersionRow, versionId: string, now = Date.now()): repo.VersionRow | null {
  if (versionId === live.id) return live
  const v = repo.getVersion(versionId)
  if (!v || v.formId !== formId || v.number >= live.number) return null
  const successor = repo.listVersions(formId).filter(x => x.number > v.number).sort((x, y) => x.number - y.number)[0]
  if (!successor) return null
  const supersededAt = Date.parse(successor.publishedAt)
  return Number.isFinite(supersededAt) && now - supersededAt <= SESSION_VERSION_GRACE_MS ? v : null
}

interface SessionContext extends LiveContext { live: repo.VersionRow }

/** Resolve the version a respondent request runs against. An explicit
 *  versionId (what the page is showing) is strict; without one — an older
 *  page — the session's own version is used while it is accepted, else live. */
function sessionContext(formId: string, versionId: string | null | undefined, sessionVersionId: string | null | undefined, live: LiveContext = liveContext(formId)): SessionContext {
  if (versionId) {
    const v = acceptedSessionVersion(formId, live.version, versionId)
    if (!v) throw new ServiceError(409, 'this form was updated — reload to continue', { versionChanged: true, liveVersion: { id: live.version.id, number: live.version.number } })
    return { row: live.row, ops: live.ops, version: v, definition: v.id === live.version.id ? live.definition : versionDef(v.id).definition, live: live.version }
  }
  const v = (sessionVersionId && acceptedSessionVersion(formId, live.version, sessionVersionId)) || live.version
  return { row: live.row, ops: live.ops, version: v, definition: v.id === live.version.id ? live.definition : versionDef(v.id).definition, live: live.version }
}

export type SessionVersion =
  | { status: 'live'; version: { id: string; number: number }; definition: FormDefinition }
  | { status: 'moved'; live: { id: string; number: number } }

/** For a returning respondent whose saved session is on another version: the
 *  definition to resume on, or 'moved' when that version has been retired. */
export function getSessionVersion(formId: string, versionId: string, auth: RespondentAuth = {}): SessionVersion {
  const live = respondentContext(formId, auth)
  const v = acceptedSessionVersion(formId, live.version, versionId)
  if (!v) return { status: 'moved', live: { id: live.version.id, number: live.version.number } }
  return { status: 'live', version: { id: v.id, number: v.number }, definition: v.id === live.version.id ? live.definition : versionDef(v.id).definition }
}

export interface RespondentMeta { userAgent?: string | null; acceptLanguage?: string | null; referrer?: string | null; source?: Record<string, string> | null; embedded?: boolean }

function metadataFor(meta: RespondentMeta, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ua: (meta.userAgent ?? '').slice(0, 300), device: deviceSummary(meta.userAgent), language: (meta.acceptLanguage ?? '').split(',')[0]?.trim().slice(0, 20) || null,
    referrer: (meta.referrer ?? '').slice(0, 500) || null, source: meta.source ?? null, embedded: !!meta.embedded, ...extra,
  }
}

function searchTextFor(def: FormDefinition, answers: AnswerMap, id: string): string {
  const parts: string[] = [id]
  const blocks = allBlocks(def)
  for (const b of blocks) {
    if (answers[b.id] === undefined) continue
    const text = componentDef(b.type).display(b, answers[b.id])
    if (text) parts.push(text)
  }
  return parts.join(' \n ').toLowerCase().slice(0, 20000)
}

function answerRows(def: FormDefinition, answers: AnswerMap): Array<{ blockId: string; value: string; text: string }> {
  const out: Array<{ blockId: string; value: string; text: string }> = []
  for (const b of allBlocks(def)) {
    if (!isInputBlock(b) || answers[b.id] === undefined) continue
    const d = componentDef(b.type)
    if (d.isEmpty(answers[b.id])) continue
    out.push({ blockId: b.id, value: JSON.stringify(answers[b.id]), text: d.display(b, answers[b.id]).slice(0, 4000) })
  }
  return out
}

function furthestIndex(def: FormDefinition, visited: string[], current: string | null): { id: string | null; index: number } {
  const pages = answerPages(def)
  let best = -1
  for (const id of [...visited, current ?? '']) { const i = pages.findIndex(p => p.id === id); if (i > best) best = i }
  return { id: best >= 0 ? pages[best].id : null, index: Math.max(0, best) }
}

function ownsSubmission(sub: repo.SubmissionRow, formId: string): void {
  if (sub.formId !== formId || sub.deletedAt) throw new ServiceError(404, 'session not found')
}

export interface DraftInput { token?: string | null; versionId?: string | null; answers?: Record<string, unknown>; currentPageId?: string | null; pagesVisited?: string[]; meta: RespondentMeta; auth?: RespondentAuth; deviceId?: string | null }
export interface DraftResult { submissionId: string; token: string | null; status: repo.SubmissionStatus; versionId: string; currentPageId: string | null; completed: boolean }

/** Create or update a respondent session. The token is returned only when the
 *  session is created; the browser keeps it and sends it back. A session that
 *  the page has carried onto another version moves with it. */
export function saveRespondentDraft(formId: string, input: DraftInput): DraftResult {
  const live = respondentContext(formId, input.auth ?? {})
  const found = input.token ? repo.getSubmissionByTokenHash(sha256(input.token)) : undefined
  if (found) {
    ownsSubmission(found, formId)
    if (found.status !== 'partial') return { submissionId: found.id, token: null, status: found.status, versionId: found.versionId, currentPageId: found.currentPageId, completed: true }
  }
  const ctx = sessionContext(formId, input.versionId, found?.versionId, live)
  const normalized = normalizeAnswers(ctx.definition, input.answers ?? {})
  const state = evaluate(ctx.definition, normalized)
  const active = stripInactive(ctx.definition, normalized, state)
  const visited = Array.isArray(input.pagesVisited) ? input.pagesVisited.filter((p): p is string => typeof p === 'string').slice(0, 200) : []
  const current = typeof input.currentPageId === 'string' && ctx.definition.pages.some(p => p.id === input.currentPageId) ? input.currentPageId : null
  const now = repo.nowIso()
  if (found) {
    const moved = found.versionId !== ctx.version.id
    const pageIds = new Set(ctx.definition.pages.map(p => p.id))
    const prevVisited = new Set<string>((JSON.parse(found.pagesVisited || '[]') as string[]).filter(id => pageIds.has(id)))
    for (const v of visited) prevVisited.add(v)
    const far = furthestIndex(ctx.definition, [...prevVisited], current)
    repo.transaction(() => {
      repo.updateSubmission(found.id, { versionId: moved ? ctx.version.id : undefined, answers: JSON.stringify(active), currentPageId: current ?? (moved ? null : found.currentPageId), furthestPageId: far.id, furthestPageIndex: far.index, pagesVisited: JSON.stringify([...prevVisited]), searchText: searchTextFor(ctx.definition, active, found.id), lastActivityAt: now })
      repo.replaceAnswerRows(found.id, answerRows(ctx.definition, active))
      repo.addEvent(found.id, moved ? 'version_moved' : 'autosaved', moved ? { from: found.versionId, to: ctx.version.id, page: current } : { page: current, answers: Object.keys(active).length })
    })
    if (moved) formsLog.info('submission.version_moved', { form: formId, submission: found.id, from: found.versionId, to: ctx.version.id })
    return { submissionId: found.id, token: null, status: 'partial', versionId: ctx.version.id, currentPageId: current ?? (moved ? null : found.currentPageId), completed: false }
  }
  const id = longId('rsp')
  const token = secretToken()
  const far = furthestIndex(ctx.definition, visited, current)
  repo.transaction(() => {
    repo.insertSubmission({ id, formId, versionId: ctx.version.id, resumeTokenHash: sha256(token), idempotencyKey: null, answers: JSON.stringify(active), metadata: JSON.stringify(metadataFor(input.meta)), currentPageId: current })
    repo.updateSubmission(id, { furthestPageId: far.id, furthestPageIndex: far.index, pagesVisited: JSON.stringify(visited), searchText: searchTextFor(ctx.definition, active, id), respondent: live.ops.access === 'restricted' ? signedIn(input.auth?.respondent) : null, deviceHash: deviceHashFor(formId, input.deviceId) })
    repo.replaceAnswerRows(id, answerRows(ctx.definition, active))
    repo.addEvent(id, 'started', { page: current, embedded: !!input.meta.embedded, version: ctx.version.id })
  })
  formsLog.info('submission.started', { form: formId, version: ctx.version.id, submission: id, superseded: ctx.version.id !== ctx.live.id || undefined })
  return { submissionId: id, token, status: 'partial', versionId: ctx.version.id, currentPageId: current, completed: false }
}

export function getRespondentDraft(formId: string, token: string): { submissionId: string; status: repo.SubmissionStatus; versionId: string; answers: AnswerMap; currentPageId: string | null; pagesVisited: string[]; endingId: string | null } {
  const sub = repo.getSubmissionByTokenHash(sha256(token))
  if (!sub) throw new ServiceError(404, 'session not found')
  ownsSubmission(sub, formId)
  return { submissionId: sub.id, status: sub.status, versionId: sub.versionId, answers: JSON.parse(sub.answers || '{}'), currentPageId: sub.currentPageId, pagesVisited: JSON.parse(sub.pagesVisited || '[]'), endingId: sub.endingId }
}

export interface SubmitInput { token?: string | null; versionId?: string | null; idempotencyKey: string; answers: Record<string, unknown>; pagesVisited?: string[]; honeypot?: string | null; meta: RespondentMeta; auth?: RespondentAuth; deviceId?: string | null }
/** `editToken` is returned once, with a first completion on a form that allows
 *  edits: it is the respondent's private link to change their answers. */
export interface SubmitResult { submissionId: string; status: repo.SubmissionStatus; endingId: string; ending: Ending | null; duplicate: boolean; token: string | null; editToken: string | null }

/** The ending a stored submission reached, read from the version it was given against. */
function endingOf(sub: repo.SubmissionRow): Ending | null {
  if (!sub.endingId) return null
  try { return versionDef(sub.versionId).definition.endings.find(e => e.id === sub.endingId) ?? null } catch { return null }
}

/** Normalise, run the logic and validate every page on the respondent's path,
 *  exactly as the page did. Throws 422 with the field errors. */
function checkedAnswers(formId: string, ctx: SessionContext, raw: Record<string, unknown> | undefined, existing: repo.SubmissionRow | undefined): { active: AnswerMap; state: LogicState; pagesInPath: Page[] } {
  const normalized = normalizeAnswers(ctx.definition, raw ?? {})
  let state = evaluate(ctx.definition, normalized)
  const withDefaults = applySetValues(ctx.definition, normalized, state)
  state = evaluate(ctx.definition, withDefaults)
  const active = stripInactive(ctx.definition, withDefaults, state)
  const fileStatus: ValidationContext['fileStatus'] = fileId => {
    const f = repo.getFile(fileId)
    if (!f || f.formId !== formId || f.deletedAt) return { status: 'missing' }
    if (existing && f.submissionId && f.submissionId !== existing.id) return { status: 'missing' }
    return { status: f.status === 'uploaded' ? 'uploaded' : f.status === 'pending' ? 'pending' : 'failed', size: f.size, mime: f.mime, name: f.originalName }
  }
  const errors: Record<string, string> = {}
  let firstErrorPage: string | null = null
  const pagesInPath = pathThrough(ctx.definition, state)
  for (const page of pagesInPath) {
    const e = validatePage(ctx.definition, page, active, state, { fileStatus })
    for (const [id, msg] of Object.entries(e)) { errors[id] = msg; if (!firstErrorPage) firstErrorPage = page.id }
  }
  if (Object.keys(errors).length) throw new ServiceError(422, 'some answers need attention', { errors, pageId: firstErrorPage })
  return { active, state, pagesInPath }
}

/** One response per email address: the form's first answered email question
 *  is the address. The error sits on that question, in the form's language. */
function emailTaken(formId: string, def: FormDefinition, active: AnswerMap, exceptId: string | null): ServiceError | null {
  const b = allBlocks(def).find(x => x.type === 'email' && typeof active[x.id] === 'string' && String(active[x.id]).trim())
  if (!b || !repo.findCompletedBy(formId, { email: { blockId: b.id, value: String(active[b.id]) } }, exceptId)) return null
  const page = def.pages.find(p => p.blocks.some(x => x.id === b.id))
  return new ServiceError(422, 'some answers need attention', { errors: { [b.id]: errorsFor(def.settings.language).duplicateEmail }, pageId: page?.id ?? null, duplicate: 'email' })
}

/** Early word on a form that takes one response per email address: the address is
 *  checked when the respondent leaves its page, not only at the final submit, so
 *  nobody answers every page to learn it was already used (QA 09-25, round 3). The
 *  submit still decides; this answers only what the submit would say about the email. */
export function checkAnswers(formId: string, input: { versionId?: string | null; answers?: unknown; auth?: RespondentAuth }): { errors: Record<string, string>; pageId: string | null } {
  const live = respondentContext(formId, input.auth ?? {})
  if (live.ops.duplicates !== 'email') return { errors: {}, pageId: null }
  const ctx = sessionContext(formId, input.versionId, undefined, live)
  const raw = input.answers && typeof input.answers === 'object' ? input.answers as Record<string, unknown> : {}
  const emails: AnswerMap = {}
  for (const b of allBlocks(ctx.definition)) if (b.type === 'email' && typeof raw[b.id] === 'string') emails[b.id] = String(raw[b.id]).slice(0, 320)
  const taken = emailTaken(formId, ctx.definition, emails, null)
  return taken ? { errors: taken.body.errors as Record<string, string>, pageId: (taken.body.pageId as string | null) ?? null } : { errors: {}, pageId: null }
}

/** The door's last checks, run inside the write so two tabs can't both get in:
 *  the response limit, then one response per device, account or email. */
function admissionError(formId: string, ctx: SessionContext, active: AnswerMap, who: { deviceHash: string | null; respondent: string | null }, selfId: string): ServiceError | null {
  if (ctx.ops.maxResponses && repo.completedCount(formId) >= ctx.ops.maxResponses) return new ServiceError(410, 'form is closed', { closed: true, reason: 'limit' })
  const mode = ctx.ops.duplicates
  if (mode === 'device' && who.deviceHash && repo.findCompletedBy(formId, { deviceHash: who.deviceHash }, selfId)) return new ServiceError(409, 'already responded', { duplicate: 'device' })
  if (mode === 'account' && who.respondent && repo.findCompletedBy(formId, { respondent: who.respondent }, selfId)) return new ServiceError(409, 'already responded', { duplicate: 'account' })
  if (mode === 'email') return emailTaken(formId, ctx.definition, active, selfId)
  return null
}

export function submitResponse(formId: string, input: SubmitInput): SubmitResult {
  const key = typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9_\-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null
  if (!key) throw new ServiceError(400, 'idempotencyKey required')

  // A retry of a response that already went in gets its own result back before the door is
  // checked: the response that filled the limit must not be told, on retry, that the form closed.
  const priorByKey = repo.getSubmissionByIdempotency(formId, key)
  if (priorByKey && priorByKey.status !== 'partial') {
    repo.addEvent(priorByKey.id, 'duplicate_ignored', { via: 'idempotency' })
    return { submissionId: priorByKey.id, status: priorByKey.status, endingId: priorByKey.endingId ?? '', ending: endingOf(priorByKey), duplicate: true, token: null, editToken: null }
  }
  let existing: repo.SubmissionRow | undefined
  if (input.token) {
    existing = repo.getSubmissionByTokenHash(sha256(input.token))
    if (existing) {
      ownsSubmission(existing, formId)
      if (existing.status !== 'partial') {
        repo.addEvent(existing.id, 'duplicate_ignored', { via: 'token' })
        return { submissionId: existing.id, status: existing.status, endingId: existing.endingId ?? '', ending: endingOf(existing), duplicate: true, token: null, editToken: null }
      }
    }
  }
  const live = respondentContext(formId, input.auth ?? {})
  // The version this respondent answered: the page's, or their session's. Validation,
  // logic and the ending all come from it, so a publish mid-session changes nothing for them.
  const ctx = sessionContext(formId, input.versionId, existing?.versionId, live)
  const movedFrom = existing && existing.versionId !== ctx.version.id ? existing.versionId : null
  const { active, state, pagesInPath } = checkedAnswers(formId, ctx, input.answers, existing)

  const now = repo.nowIso()
  const verdict = abuseVerdict({ honeypotFilled: !!(input.honeypot && String(input.honeypot).trim()), startedAt: existing?.startedAt ?? null, now: Date.parse(now), answeredCount: Object.keys(active).length, userAgent: input.meta.userAgent ?? null, acceptLanguage: input.meta.acceptLanguage })
  const status: repo.SubmissionStatus = verdict.spam ? 'spam' : 'completed'
  const visited = Array.isArray(input.pagesVisited) ? input.pagesVisited.filter((p): p is string => typeof p === 'string') : []
  const endingId = state.endingId
  const id = existing?.id ?? longId('rsp')
  const token = existing ? null : secretToken()
  const who = { deviceHash: deviceHashFor(formId, input.deviceId) ?? existing?.deviceHash ?? null, respondent: live.ops.access === 'restricted' ? signedIn(input.auth?.respondent) : null }
  const editToken = status === 'completed' && ctx.definition.settings.allowEdits ? secretToken() : null

  try {
    repo.transaction(() => {
      const refused = status === 'completed' ? admissionError(formId, ctx, active, who, id) : null
      if (refused) throw refused
      if (!existing) {
        repo.insertSubmission({ id, formId, versionId: ctx.version.id, resumeTokenHash: sha256(token!), idempotencyKey: key, answers: JSON.stringify(active), metadata: JSON.stringify(metadataFor(input.meta, { flags: verdict.flags })), currentPageId: pagesInPath[pagesInPath.length - 1]?.id ?? null, startedAt: now })
        repo.addEvent(id, 'started', { direct: true })
      }
      const startedAt = existing?.startedAt ?? now
      const prevMeta = existing ? (JSON.parse(existing.metadata || '{}') as Record<string, unknown>) : {}
      const far = furthestIndex(ctx.definition, [...(existing ? (JSON.parse(existing.pagesVisited || '[]') as string[]) : []), ...visited, ...pagesInPath.map(p => p.id)], null)
      repo.updateSubmission(id, {
        versionId: movedFrom ? ctx.version.id : undefined,
        status, idempotencyKey: key, answers: JSON.stringify(active), endingId, endingRuleId: state.endingRuleId, currentPageId: far.id, furthestPageId: far.id, furthestPageIndex: far.index,
        pagesVisited: JSON.stringify([...new Set([...(existing ? (JSON.parse(existing.pagesVisited || '[]') as string[]) : []), ...visited, ...pagesInPath.map(p => p.id)])]),
        metadata: JSON.stringify({ ...prevMeta, ...metadataFor(input.meta, { flags: verdict.flags }) }), searchText: searchTextFor(ctx.definition, active, id), lastActivityAt: now, submittedAt: now,
        durationMs: Math.max(0, Date.parse(now) - Date.parse(startedAt)),
        respondent: who.respondent, deviceHash: who.deviceHash, editTokenHash: editToken ? sha256(editToken) : null,
      })
      repo.replaceAnswerRows(id, answerRows(ctx.definition, active))
      // Attach every referenced upload to this submission; anything unreferenced stays orphaned for the sweeper.
      for (const b of allBlocks(ctx.definition)) {
        if (b.type !== 'upload') continue
        for (const f of (active[b.id] as FileAnswer[] | undefined) ?? []) repo.updateFile(f.fileId, { submissionId: id })
      }
      repo.addEvent(id, status === 'spam' ? 'flagged_spam' : 'submitted', { ending: endingId, rule: state.endingRuleId, flags: verdict.flags })
    })
  } catch (err) {
    const msg = (err as Error).message || ''
    if (/UNIQUE constraint failed: form_submissions\.form_id, form_submissions\.idempotency_key/.test(msg)) {
      const dup = repo.getSubmissionByIdempotency(formId, key)!
      return { submissionId: dup.id, status: dup.status, endingId: dup.endingId ?? '', ending: endingOf(dup), duplicate: true, token: null, editToken: null }
    }
    if (err instanceof ServiceError) formsLog.info('submission.refused', { form: formId, status: err.status, reason: String(err.body.duplicate ?? err.body.reason ?? '') })
    throw err
  }
  formsLog.info('submission.completed', { form: formId, version: ctx.version.id, submission: id, status, ending: endingId, flags: verdict.flags.join(',') || undefined, superseded: ctx.version.id !== ctx.live.id || undefined, movedFrom: movedFrom ?? undefined })
  if (status === 'completed') notifySubmission(formId, id, { editToken })
  return { submissionId: id, status, endingId, ending: ctx.definition.endings.find(e => e.id === endingId) ?? null, duplicate: false, token, editToken }
}

/** The pages a respondent walks with these answers (core pagePath). */
export const pathThrough = pagePath

// ── Respondent edits ─────────────────────────────────────────────────────────
// A form with settings.allowEdits hands each respondent a private link after
// they submit. It opens their response on the form as it is now; saving
// validates like a submit, replaces the answers and keeps the response's id,
// time and place in the list. The form has to be open and still allow edits.

export interface EditSession { submissionId: string; version: { id: string; number: number }; definition: FormDefinition; answers: AnswerMap; submittedAt: string | null; editedAt: string | null }

function editableSubmission(ctx: LiveContext, token: string | null | undefined, auth: RespondentAuth): repo.SubmissionRow {
  if (!ctx.definition.settings.allowEdits) throw new ServiceError(403, 'this form doesn’t take changes to responses', { editsOff: true })
  let sub: repo.SubmissionRow | undefined
  if (token) sub = repo.getSubmissionByEditHash(sha256(token))
  else {
    // A signed-in respondent on a restricted form edits their own, no link needed.
    const who = ctx.ops.access === 'restricted' ? signedIn(auth.respondent) : null
    const id = who ? repo.findCompletedBy(ctx.row.id, { respondent: who }, null) : null
    sub = id ? repo.getSubmission(id) : undefined
  }
  if (!sub || sub.formId !== ctx.row.id || sub.deletedAt || sub.status !== 'completed') throw new ServiceError(404, 'response not found', { editGone: true })
  return sub
}

export function getEditSession(formId: string, token: string | null | undefined, auth: RespondentAuth = {}): EditSession {
  const ctx = respondentContext(formId, auth)
  const sub = editableSubmission(ctx, token, auth)
  const answers = normalizeAnswers(ctx.definition, JSON.parse(sub.answers || '{}'))
  return { submissionId: sub.id, version: { id: ctx.version.id, number: ctx.version.number }, definition: ctx.definition, answers, submittedAt: sub.submittedAt, editedAt: sub.editedAt }
}

export interface EditInput { token?: string | null; versionId?: string | null; answers: Record<string, unknown>; pagesVisited?: string[]; auth?: RespondentAuth }

export async function saveEdit(formId: string, input: EditInput): Promise<{ submissionId: string; endingId: string; ending: Ending | null }> {
  const live = respondentContext(formId, input.auth ?? {})
  const sub = editableSubmission(live, input.token, input.auth ?? {})
  const ctx = sessionContext(formId, input.versionId ?? live.version.id, null, live)
  const { active, state, pagesInPath } = checkedAnswers(formId, ctx, input.answers, sub)
  const now = repo.nowIso()
  const visited = Array.isArray(input.pagesVisited) ? input.pagesVisited.filter((p): p is string => typeof p === 'string') : []
  const dropped: repo.FileRow[] = []
  repo.transaction(() => {
    const taken = live.ops.duplicates === 'email' ? emailTaken(formId, ctx.definition, active, sub.id) : null
    if (taken) throw taken
    const kept = new Set<string>()
    for (const b of allBlocks(ctx.definition)) {
      if (b.type !== 'upload') continue
      for (const f of (active[b.id] as FileAnswer[] | undefined) ?? []) { kept.add(f.fileId); repo.updateFile(f.fileId, { submissionId: sub.id }) }
    }
    for (const f of repo.listFilesForSubmission(sub.id)) if (!kept.has(f.id)) { dropped.push(f); repo.updateFile(f.id, { status: 'deleted', deletedAt: now }) }
    const far = furthestIndex(ctx.definition, [...visited, ...pagesInPath.map(p => p.id)], null)
    repo.updateSubmission(sub.id, {
      versionId: ctx.version.id, answers: JSON.stringify(active), endingId: state.endingId, endingRuleId: state.endingRuleId,
      furthestPageId: far.id, furthestPageIndex: far.index, pagesVisited: JSON.stringify([...new Set([...visited, ...pagesInPath.map(p => p.id)])]),
      searchText: searchTextFor(ctx.definition, active, sub.id), lastActivityAt: now, editedAt: now,
    })
    repo.replaceAnswerRows(sub.id, answerRows(ctx.definition, active))
    repo.addEvent(sub.id, 'edited', { version: ctx.version.id, filesRemoved: dropped.length || undefined })
  })
  for (const f of dropped) await getStorage().delete(f.storageKey).catch(err => formsLog.warn('file.delete_failed', { file: f.id, error: (err as Error).message }))
  formsLog.info('submission.edited', { form: formId, submission: sub.id, version: ctx.version.id })
  notifySubmission(formId, sub.id, { edited: true })
  return { submissionId: sub.id, endingId: state.endingId, ending: ctx.definition.endings.find(e => e.id === state.endingId) ?? null }
}

// ── Uploads ──────────────────────────────────────────────────────────────────

export interface UploadRequest { token?: string | null; versionId?: string | null; blockId: string; name: string; size: number; mime: string; proxyUrlFor: (fileId: string, uploadToken: string) => string; auth?: RespondentAuth }
export interface UploadGrant { fileId: string; uploadToken: string; url: string; method: 'PUT'; headers: Record<string, string>; transport: 'direct' | 'proxy'; maxBytes: number }

export async function createUpload(formId: string, input: UploadRequest): Promise<UploadGrant> {
  const live = respondentContext(formId, input.auth ?? {})
  const session = input.token ? repo.getSubmissionByTokenHash(sha256(input.token)) : undefined
  const ctx = sessionContext(formId, input.versionId, session && session.formId === formId && session.status === 'partial' ? session.versionId : null, live)
  const block = allBlocks(ctx.definition).find(b => b.id === input.blockId)
  if (!block || block.type !== 'upload') throw new ServiceError(400, 'unknown upload field')
  const name = String(input.name ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 255) || 'file'
  const size = Number(input.size)
  if (!Number.isFinite(size) || size <= 0) throw new ServiceError(400, 'size required')
  const gate = fileGate(block, { name, size })
  if (gate) throw new ServiceError(422, gate, { error: gate })
  const submissionId: string | null = session && session.formId === formId && session.status === 'partial' ? session.id : null
  const fileId = longId('fil')
  const uploadToken = secretToken()
  const key = fileKey(formId, fileId, extensionOf(name))
  const mime = String(input.mime ?? '').slice(0, 120) || 'application/octet-stream'
  repo.insertFile({ id: fileId, formId, submissionId, blockId: block.id, storageKey: key, originalName: name, mime, size: Math.floor(size), uploadTokenHash: sha256(uploadToken) })
  const target = await getStorage().uploadTarget(key, { contentType: mime, contentLength: Math.floor(size), proxyUrl: input.proxyUrlFor(fileId, uploadToken) })
  formsLog.info('upload.created', { form: formId, file: fileId, size: Math.floor(size), transport: target.transport })
  return { fileId, uploadToken, url: target.url, method: 'PUT', headers: target.headers, transport: target.transport, maxBytes: uploadSettings(block.settings).maxSizeMb * 1024 * 1024 }
}

function fileWithToken(fileId: string, uploadToken: string): repo.FileRow {
  const f = repo.getFile(fileId)
  if (!f || !f.uploadTokenHash || f.uploadTokenHash !== sha256(uploadToken)) throw new ServiceError(404, 'upload not found')
  return f
}

/** transport=proxy: the bytes arrive here (via the dashboard) and go to storage. */
export async function receiveUploadBytes(fileId: string, uploadToken: string, body: Readable, contentType: string | undefined): Promise<{ size: number }> {
  const f = fileWithToken(fileId, uploadToken)
  if (f.status === 'uploaded') return { size: f.size }
  const ctx = liveContext(f.formId)
  const block = allBlocks(ctx.definition).find(b => b.id === f.blockId)
  const maxBytes = block ? uploadSettings(block.settings).maxSizeMb * 1024 * 1024 : 25 * 1024 * 1024
  try {
    const info = await getStorage().putStream(f.storageKey, body, { contentType: contentType || f.mime, maxBytes })
    repo.updateFile(fileId, { size: info.size, mime: contentType || f.mime })
    return { size: info.size }
  } catch (err) {
    if (err instanceof BytesLimitError) { repo.updateFile(fileId, { status: 'failed' }); throw new ServiceError(413, 'file too large') }
    repo.updateFile(fileId, { status: 'failed' })
    formsLog.error('upload.receive_failed', err, { file: fileId })
    throw new ServiceError(502, 'storage unavailable')
  }
}

/** Marks a file usable only after storage confirms the bytes are there. */
export async function completeUpload(fileId: string, uploadToken: string): Promise<{ fileId: string; size: number; mime: string; name: string; status: 'uploaded' }> {
  const f = fileWithToken(fileId, uploadToken)
  if (f.status === 'uploaded') return { fileId, size: f.size, mime: f.mime, name: f.originalName, status: 'uploaded' }
  const ctx = liveContext(f.formId)
  const block = allBlocks(ctx.definition).find(b => b.id === f.blockId)
  const head = await getStorage().head(f.storageKey)
  if (!head || head.size <= 0) { repo.updateFile(fileId, { status: 'failed' }); throw new ServiceError(409, 'the file never arrived — try again', { error: 'This file didn’t upload. Retry or remove it.' }) }
  if (block) {
    const gate = fileGate(block, { name: f.originalName, size: head.size })
    if (gate) { repo.updateFile(fileId, { status: 'failed' }); await getStorage().delete(f.storageKey).catch(() => undefined); throw new ServiceError(422, gate, { error: gate }) }
  }
  repo.updateFile(fileId, { status: 'uploaded', size: head.size, uploadedAt: repo.nowIso() })
  formsLog.info('upload.completed', { form: f.formId, file: fileId, size: head.size })
  return { fileId, size: head.size, mime: f.mime, name: f.originalName, status: 'uploaded' }
}

export async function cancelUpload(fileId: string, uploadToken: string): Promise<void> {
  const f = fileWithToken(fileId, uploadToken)
  if (f.submissionId) { const sub = repo.getSubmission(f.submissionId); if (sub && sub.status !== 'partial') throw new ServiceError(409, 'submitted files can’t be removed here') }
  repo.updateFile(fileId, { status: 'deleted', deletedAt: repo.nowIso() })
  await getStorage().delete(f.storageKey).catch(err => formsLog.warn('upload.delete_failed', { file: fileId, error: (err as Error).message }))
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface ResponseSummary {
  id: string; status: repo.SubmissionStatus; startedAt: string; submittedAt: string | null; lastActivityAt: string; durationMs: number | null
  versionId: string; versionNumber: number; endingId: string | null; endingName: string | null; furthestPageIndex: number; furthestPageName: string | null
  device: string; flags: string[]; cells: Record<string, string>
  readAt: string | null; editedAt: string | null; respondent: string | null
}

const versionCache = new Map<string, { number: number; definition: FormDefinition }>()
/**
 * The email a respondent gave in a form shown inside a GRYD video, for that one
 * view: the player opens the form with `gryd_view=<viewId>` and the form sends
 * it back as `meta.source` (dashboard/app/f/[slug]). Completed responses only,
 * to one of `formIds`, the latest first; the answer to the form's first email
 * question. The video module names the view with it (video/hubspot.ts).
 */
export function emailForVideoView(formIds: string[], viewId: string): { email: string; submissionId: string } | null {
  if (!formIds.length || !viewId) return null
  for (const r of repo.completedForVideoView(formIds, viewId)) {
    let definition: FormDefinition
    try { definition = versionDef(r.versionId).definition } catch { continue }
    const block = allBlocks(definition).find(b => b.type === 'email')
    const answers = JSON.parse(r.answers || '{}') as Record<string, unknown>
    const email = block && typeof answers[block.id] === 'string' ? String(answers[block.id]).trim().toLowerCase() : ''
    if (email && isEmail(email)) return { email, submissionId: r.id }
  }
  return null
}

function versionDef(versionId: string): { number: number; definition: FormDefinition } {
  const cached = versionCache.get(versionId)
  if (cached) return cached
  const v = repo.getVersion(versionId)
  if (!v) throw new ServiceError(500, 'version missing')
  const out = { number: v.number, definition: loadDefinition(v.definition) }
  if (versionCache.size > 200) versionCache.clear()
  versionCache.set(versionId, out)
  return out
}

function summarize(row: repo.SubmissionRow, columnIds: string[]): ResponseSummary {
  const { number, definition } = versionDef(row.versionId)
  const answers = JSON.parse(row.answers || '{}') as AnswerMap
  const blocks = new Map(allBlocks(definition).map(b => [b.id, b]))
  const cells: Record<string, string> = {}
  for (const id of columnIds) {
    const b = blocks.get(id)
    if (!b || answers[id] === undefined) continue
    cells[id] = componentDef(b.type).display(b, answers[id])
  }
  const meta = JSON.parse(row.metadata || '{}') as Record<string, unknown>
  const ending = row.endingId ? definition.endings.find(e => e.id === row.endingId) : undefined
  const pages = answerPages(definition)
  return {
    id: row.id, status: row.status, startedAt: row.startedAt, submittedAt: row.submittedAt, lastActivityAt: row.lastActivityAt, durationMs: row.durationMs,
    versionId: row.versionId, versionNumber: number, endingId: row.endingId, endingName: ending?.name ?? null, furthestPageIndex: row.furthestPageIndex,
    furthestPageName: pages[row.furthestPageIndex]?.name ?? null, device: typeof meta.device === 'string' ? meta.device : '', flags: Array.isArray(meta.flags) ? (meta.flags as string[]) : [], cells,
    readAt: row.readAt, editedAt: row.editedAt, respondent: row.respondent,
  }
}

export interface ColumnDef { id: string; label: string; type: string }

/** Columns for the table: the current draft's questions first, then anything
 *  only older versions had, so a renamed question keeps its column. */
export function responseColumns(formId: string): ColumnDef[] {
  const row = repo.getForm(formId)
  if (!row) throw new ServiceError(404, 'form not found')
  const seen = new Map<string, ColumnDef>()
  const add = (def: FormDefinition) => { for (const b of allBlocks(def)) if (isInputBlock(b) && b.type !== 'hidden' && !seen.has(b.id)) seen.set(b.id, { id: b.id, label: b.label || componentDef(b.type).label, type: b.type }) }
  add(loadDefinition(row.draftDefinition))
  for (const v of repo.listVersions(formId)) add(versionDef(v.id).definition)
  return [...seen.values()]
}

export function listResponses(formId: string, q: repo.SubmissionQuery): { rows: ResponseSummary[]; total: number; counts: ReturnType<typeof repo.submissionCounts>; columns: ColumnDef[] } {
  if (!repo.getForm(formId)) throw new ServiceError(404, 'form not found')
  const columns = responseColumns(formId)
  const { rows, total } = repo.listSubmissions(formId, q)
  return { rows: rows.map(r => summarize(r, columns.map(c => c.id))), total, counts: repo.submissionCounts(formId), columns }
}

export interface ResponseDetail {
  summary: ResponseSummary
  answers: AnswerMap
  definition: FormDefinition
  endingRuleSentence: string | null
  files: Array<{ id: string; blockId: string; name: string; size: number; mime: string; status: repo.FileStatus }>
  events: Array<{ kind: string; at: string; detail: Record<string, unknown> }>
  pagesVisited: string[]
  metadata: Record<string, unknown>
  neighbours: { prev: string | null; next: string | null; index: number; total: number }
}

export function getResponse(formId: string, id: string, q: repo.SubmissionQuery): ResponseDetail {
  const row = repo.getSubmission(id)
  if (!row || row.formId !== formId || row.deletedAt) throw new ServiceError(404, 'response not found')
  const { definition } = versionDef(row.versionId)
  const columns = responseColumns(formId)
  const summary = summarize(row, columns.map(c => c.id))
  const rule = row.endingRuleId ? definition.rules.find(r => r.id === row.endingRuleId) : undefined
  return {
    summary, answers: JSON.parse(row.answers || '{}'), definition,
    endingRuleSentence: rule ? ruleSentence(definition, rule) : null,
    files: repo.listFilesForSubmission(id).map(f => ({ id: f.id, blockId: f.blockId, name: f.originalName, size: f.size, mime: f.mime, status: f.status })),
    events: repo.listEvents(id).map(e => ({ kind: e.kind, at: e.at, detail: JSON.parse(e.detail || '{}') })),
    pagesVisited: JSON.parse(row.pagesVisited || '[]'), metadata: JSON.parse(row.metadata || '{}'),
    neighbours: repo.neighbourSubmissionIds(formId, q, id),
  }
}

export async function deleteResponse(formId: string, id: string, by: string | null): Promise<void> {
  const row = repo.getSubmission(id)
  if (!row || row.formId !== formId || row.deletedAt) throw new ServiceError(404, 'response not found')
  const files = repo.listFilesForSubmission(id)
  repo.transaction(() => {
    repo.softDeleteSubmission(id)
    for (const f of files) repo.updateFile(f.id, { status: 'deleted', deletedAt: repo.nowIso() })
    repo.eraseSubmissionContent(id)
    repo.addEvent(id, 'deleted', { by })
  })
  // Storage cleanup is best effort and after the row is gone; a stranded object
  // is a cost, a stranded row pointing at nothing is a lie.
  for (const f of files) await getStorage().delete(f.storageKey).catch(err => formsLog.warn('file.delete_failed', { file: f.id, error: (err as Error).message }))
  formsLog.info('response.deleted', { form: formId, submission: id, files: files.length, by })
}

export async function fileDownload(formId: string, fileId: string): Promise<{ redirect: string } | { stream: Readable; size: number; contentType: string; filename: string }> {
  const f = repo.getFile(fileId)
  if (!f || f.formId !== formId || f.status !== 'uploaded' || f.deletedAt) throw new ServiceError(404, 'file not found')
  const storage = getStorage()
  const url = await storage.downloadUrl(f.storageKey, { filename: f.originalName, contentType: f.mime, expiresSec: 300 })
  if (url) return { redirect: url }
  const got = await storage.getStream(f.storageKey)
  if (!got) throw new ServiceError(404, 'file not found')
  return { stream: got.stream, size: got.info.size, contentType: f.mime || got.info.contentType, filename: f.originalName }
}

// ── Responses across forms ───────────────────────────────────────────────────

export interface InboxItem {
  id: string; formId: string; formTitle: string; formArchived: boolean
  submittedAt: string | null; readAt: string | null; editedAt: string | null; device: string
  /** The first few answers, labelled, to tell responses apart in a list. */
  preview: Array<{ label: string; text: string }>
}

export function listInbox(q: repo.InboxQuery): { rows: InboxItem[]; total: number; unread: number } {
  const { rows, total } = repo.listInbox(q)
  return {
    rows: rows.map(r => {
      let preview: InboxItem['preview'] = []
      try {
        const { definition } = versionDef(r.versionId)
        const answers = JSON.parse(r.answers || '{}') as AnswerMap
        for (const b of allBlocks(definition)) {
          if (preview.length >= 3) break
          if (!isInputBlock(b) || b.type === 'hidden' || answers[b.id] === undefined) continue
          const d = componentDef(b.type)
          if (d.isEmpty(answers[b.id])) continue
          preview.push({ label: b.label || d.label, text: d.display(b, answers[b.id]).slice(0, 200) })
        }
      } catch { preview = [] }
      const meta = JSON.parse(r.metadata || '{}') as Record<string, unknown>
      return { id: r.id, formId: r.formId, formTitle: r.formName || r.formTitle, formArchived: !!r.formArchivedAt, submittedAt: r.submittedAt, readAt: r.readAt, editedAt: r.editedAt, device: typeof meta.device === 'string' ? meta.device : '', preview }
    }),
    total,
    unread: repo.unreadCount(q.formId),
  }
}

export function unreadResponses(): { unread: number } {
  return { unread: repo.unreadCount() }
}

/** Mark responses read or unread: by id, a whole form, or everything. */
export function markResponsesRead(input: { ids?: unknown; formId?: unknown; all?: unknown; read?: unknown }): { changed: number; unread: number } {
  const read = input.read !== false
  let changed = 0
  if (Array.isArray(input.ids)) changed = repo.markRead(input.ids.filter((x): x is string => typeof x === 'string').slice(0, 500), read)
  else if (read && typeof input.formId === 'string') changed = repo.markFormRead(input.formId)
  else if (read && input.all === true) changed = repo.markFormRead(null)
  else throw new ServiceError(400, 'say which responses: ids, formId or all')
  return { changed, unread: repo.unreadCount() }
}

// ── Data: delete in bulk, and the retention sweep ────────────────────────────

/** Delete every response to a form, or those older than `olderThanDays`.
 *  Works in batches; `more` says a second call has work left. */
export async function purgeResponses(formId: string, input: { olderThanDays?: number | null }, by: string | null): Promise<{ deleted: number; more: boolean }> {
  if (!repo.getForm(formId)) throw new ServiceError(404, 'form not found')
  const days = input.olderThanDays
  if (days !== undefined && days !== null && (!Number.isInteger(days) || days < 1)) throw new ServiceError(400, 'olderThanDays is a whole number of days')
  const before = days ? new Date(Date.now() - days * 86400_000).toISOString() : null
  const BATCH = 500
  const ids = repo.listSubmissionIdsBefore(formId, before, BATCH + 1)
  let deleted = 0
  for (const id of ids.slice(0, BATCH)) if (await deleteIfPresent(formId, id, by)) deleted++
  formsLog.info('responses.purged', { form: formId, deleted, olderThanDays: days ?? undefined, by })
  return { deleted, more: ids.length > BATCH }
}

async function retentionSweep(now: number): Promise<number> {
  let deleted = 0
  for (const f of repo.listFormOps()) {
    const days = parseOps(f.ops).retentionDays
    if (!days) continue
    const ids = repo.listSubmissionIdsBefore(f.id, new Date(now - days * 86400_000).toISOString(), 500)
    for (const id of ids) if (await deleteIfPresent(f.id, id, 'retention')) deleted++
  }
  return deleted
}

/** The bulk paths: the sweep, a purge or a person may have deleted a row after it was listed. */
async function deleteIfPresent(formId: string, id: string, by: string | null): Promise<boolean> {
  try { await deleteResponse(formId, id, by); return true } catch (err) {
    if (err instanceof ServiceError && err.status === 404) return false
    throw err
  }
}

export function* csvExport(formId: string, q: repo.SubmissionQuery): Generator<string> {
  if (!repo.getForm(formId)) throw new ServiceError(404, 'form not found')
  const columns = responseColumns(formId)
  yield CSV_BOM + csvLine(['Response ID', 'Status', 'Started', 'Submitted', 'Duration (s)', 'Form version', 'Ending', 'Page reached', ...columns.map(c => c.label)])
  for (const row of repo.iterateSubmissions(formId, q)) {
    const s = summarize(row, columns.map(c => c.id))
    yield csvLine([s.id, s.status, s.startedAt, s.submittedAt ?? '', s.durationMs === null ? '' : Math.round(s.durationMs / 1000), `v${s.versionNumber}`, s.endingName ?? '', s.furthestPageName ?? '', ...columns.map(c => s.cells[c.id] ?? '')])
  }
}

// ── Assets (builder uploads: images, logos) ─────────────────────────────────

const ASSET_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
export const ASSET_MAX_BYTES = 8 * 1024 * 1024

export async function uploadAsset(formId: string, input: { name: string; body: Readable; by: string | null }): Promise<{ id: string; url: string; name: string; size: number; mime: string }> {
  if (!repo.getForm(formId)) throw new ServiceError(404, 'form not found')
  const ext = extensionOf(input.name)
  const mime = ASSET_TYPES[ext]
  if (!mime) throw new ServiceError(422, 'images only (PNG, JPG, GIF or WebP)')
  const id = longId('ast')
  const key = assetKey(formId, id, ext)
  let info
  try { info = await getStorage().putStream(key, input.body, { contentType: mime, maxBytes: ASSET_MAX_BYTES }) } catch (err) {
    if (err instanceof BytesLimitError) throw new ServiceError(413, 'images need to be under 8 MB')
    formsLog.error('asset.store_failed', err, { form: formId }); throw new ServiceError(502, 'storage unavailable')
  }
  repo.insertAsset({ id, formId, storageKey: key, originalName: input.name.slice(0, 255), mime, size: info.size, createdBy: input.by })
  return { id, url: `/api/public/forms/assets/${id}`, name: input.name, size: info.size, mime }
}

export async function assetStream(assetId: string): Promise<{ stream: Readable; size: number; contentType: string } | { redirect: string } | null> {
  const a = repo.getAsset(assetId) ?? repo.getWorkspaceAsset(assetId)
  if (!a) return null
  const storage = getStorage()
  const got = await storage.getStream(a.storageKey)
  if (!got) return null
  return { stream: got.stream, size: got.info.size, contentType: a.mime || got.info.contentType }
}

// ── Maintenance ──────────────────────────────────────────────────────────────

/** Sweep abandoned pending uploads and empty partials, and delete responses
 *  past a form's retention period. Never throws. */
export async function sweep(now = Date.now()): Promise<{ files: number; partials: number; expired: number }> {
  let files = 0, partials = 0, expired = 0
  try {
    const cutoff = new Date(now - 24 * 3600 * 1000).toISOString()
    for (const f of repo.listStalePendingFiles(cutoff)) {
      repo.updateFile(f.id, { status: 'deleted', deletedAt: repo.nowIso() })
      await getStorage().delete(f.storageKey).catch(() => undefined)
      files++
    }
    for (const s of repo.listStalePartials(new Date(now - 7 * 24 * 3600 * 1000).toISOString())) { repo.softDeleteSubmission(s.id); partials++ }
    expired = await retentionSweep(now)
    if (files || partials || expired) formsLog.info('sweep', { files, partials, expired })
  } catch (err) { formsLog.error('sweep_failed', err) }
  return { files, partials, expired }
}

let sweeper: NodeJS.Timeout | null = null
export function startFormsMaintenance(): void {
  if (sweeper || process.env.FORMS_MAINTENANCE === '0') return
  sweeper = setInterval(() => { void sweep() }, 60 * 60 * 1000)
  sweeper.unref()
  setTimeout(() => { void sweep() }, 30_000).unref()
}

export function renderEndingForResponse(def: FormDefinition, ending: Ending, answers: AnswerMap): { title: string; body: string } {
  return { title: renderTemplate(ending.title, def, answers), body: renderTemplate(ending.body, def, answers) }
}

export type { Block }
