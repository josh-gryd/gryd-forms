// Every SQL statement for forms lives here. Rows come back camel-cased and
// JSON columns stay as strings — the service layer parses them, because it is
// the layer that knows which schema version a document is.

import type { Database } from 'better-sqlite3'
import { getDb } from '../db/index.js'

export type FormStatus = 'draft' | 'published' | 'closed'
export type SubmissionStatus = 'partial' | 'completed' | 'spam'
export type FileStatus = 'pending' | 'uploaded' | 'failed' | 'deleted'

export interface FormRow {
  id: string; slug: string; title: string; status: FormStatus
  draftDefinition: string; draftRevision: number; draftHash: string; draftUpdatedAt: string; draftUpdatedBy: string | null
  liveVersionId: string | null; publishedAt: string | null; closedAt: string | null; closedMessage: string
  createdBy: string | null; createdAt: string; updatedAt: string; deletedAt: string | null
  /** Internal name; '' means the title. */
  name: string; owner: string | null; folderId: string | null; archivedAt: string | null
  /** JSON FormOps (ops.ts). */
  ops: string
}
export interface FormListRow extends FormRow { completedCount: number; partialCount: number; unreadCount: number; lastResponseAt: string | null; versionCount: number; liveHash: string | null; liveNumber: number | null }
export interface VersionRow { id: string; formId: string; number: number; schemaVersion: number; definition: string; definitionHash: string; publishedBy: string | null; publishedAt: string }
export interface SubmissionRow {
  id: string; formId: string; versionId: string; status: SubmissionStatus; resumeTokenHash: string; idempotencyKey: string | null
  answers: string; endingId: string | null; endingRuleId: string | null; currentPageId: string | null; furthestPageId: string | null; furthestPageIndex: number
  pagesVisited: string; metadata: string; searchText: string; startedAt: string; lastActivityAt: string; submittedAt: string | null; durationMs: number | null; deletedAt: string | null
  readAt: string | null; editTokenHash: string | null; editedAt: string | null; respondent: string | null; deviceHash: string | null
}
export interface FileRow {
  id: string; formId: string; submissionId: string | null; blockId: string; storageKey: string; originalName: string; mime: string; size: number
  status: FileStatus; uploadTokenHash: string | null; createdAt: string; uploadedAt: string | null; deletedAt: string | null
}
export interface AssetRow { id: string; formId: string; storageKey: string; originalName: string; mime: string; size: number; createdBy: string | null; createdAt: string }
export interface EventRow { id: number; submissionId: string; kind: string; at: string; detail: string }
export interface FolderRow { id: string; name: string; color: string | null; position: number; createdAt: string; updatedAt: string; formCount: number }
export interface TemplateRow { id: string; name: string; description: string; category: string; definition: string; sourceFormId: string | null; createdBy: string | null; createdAt: string; updatedAt: string }
export interface WorkspaceAssetRow { id: string; storageKey: string; originalName: string; mime: string; size: number; createdBy: string | null; createdAt: string }
export type NotificationKind = 'owner' | 'confirmation' | 'slack'
export type NotificationStatus = 'sent' | 'failed' | 'skipped'
export interface NotificationRow { id: number; formId: string; submissionId: string | null; kind: NotificationKind; recipient: string; status: NotificationStatus; detail: string; createdAt: string }

function db(): Database { return getDb() }

const formCols = (p: string) => `${p}id, ${p}slug, ${p}title, ${p}status, ${p}draft_definition AS draftDefinition, ${p}draft_revision AS draftRevision, ${p}draft_hash AS draftHash, ${p}draft_updated_at AS draftUpdatedAt,
  ${p}draft_updated_by AS draftUpdatedBy, ${p}live_version_id AS liveVersionId, ${p}published_at AS publishedAt, ${p}closed_at AS closedAt, ${p}closed_message AS closedMessage, ${p}created_by AS createdBy, ${p}created_at AS createdAt, ${p}updated_at AS updatedAt, ${p}deleted_at AS deletedAt,
  ${p}name, ${p}owner, ${p}folder_id AS folderId, ${p}archived_at AS archivedAt, ${p}ops`
const FORM_COLS = formCols('')
const VERSION_COLS = `id, form_id AS formId, number, schema_version AS schemaVersion, definition, definition_hash AS definitionHash, published_by AS publishedBy, published_at AS publishedAt`
const subCols = (p: string) => `${p}id, ${p}form_id AS formId, ${p}version_id AS versionId, ${p}status, ${p}resume_token_hash AS resumeTokenHash, ${p}idempotency_key AS idempotencyKey, ${p}answers, ${p}ending_id AS endingId, ${p}ending_rule_id AS endingRuleId,
  ${p}current_page_id AS currentPageId, ${p}furthest_page_id AS furthestPageId, ${p}furthest_page_index AS furthestPageIndex, ${p}pages_visited AS pagesVisited, ${p}metadata, ${p}search_text AS searchText,
  ${p}started_at AS startedAt, ${p}last_activity_at AS lastActivityAt, ${p}submitted_at AS submittedAt, ${p}duration_ms AS durationMs, ${p}deleted_at AS deletedAt,
  ${p}read_at AS readAt, ${p}edit_token_hash AS editTokenHash, ${p}edited_at AS editedAt, ${p}respondent, ${p}device_hash AS deviceHash`
const SUB_COLS = subCols('')
const FILE_COLS = `id, form_id AS formId, submission_id AS submissionId, block_id AS blockId, storage_key AS storageKey, original_name AS originalName, mime, size, status, upload_token_hash AS uploadTokenHash, created_at AS createdAt, uploaded_at AS uploadedAt, deleted_at AS deletedAt`
const ASSET_COLS = `id, form_id AS formId, storage_key AS storageKey, original_name AS originalName, mime, size, created_by AS createdBy, created_at AS createdAt`

export const nowIso = (): string => new Date().toISOString()

// ── Forms ────────────────────────────────────────────────────────────────────

export function insertForm(row: { id: string; slug: string; title: string; draftDefinition: string; draftHash: string; createdBy: string | null; ops?: string; folderId?: string | null; name?: string }): FormRow {
  db().prepare(`INSERT INTO forms (id, slug, title, status, draft_definition, draft_revision, draft_hash, draft_updated_by, created_by, owner, ops, folder_id, name) VALUES (?, ?, ?, 'draft', ?, 1, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.slug, row.title, row.draftDefinition, row.draftHash, row.createdBy, row.createdBy, row.createdBy, row.ops ?? '{}', row.folderId ?? null, row.name ?? '')
  return getForm(row.id)!
}

export function getForm(id: string): FormRow | undefined {
  return db().prepare(`SELECT ${FORM_COLS} FROM forms WHERE id = ? AND deleted_at IS NULL`).get(id) as FormRow | undefined
}

export function getFormBySlug(slug: string): FormRow | undefined {
  return db().prepare(`SELECT ${FORM_COLS} FROM forms WHERE slug = ? AND deleted_at IS NULL`).get(slug) as FormRow | undefined
}

export function slugTaken(slug: string, exceptId?: string): boolean {
  const row = db().prepare(`SELECT id FROM forms WHERE slug = ?`).get(slug) as { id: string } | undefined
  return !!row && row.id !== exceptId
}

export function listForms(opts: { archived?: boolean } = {}): FormListRow[] {
  return db().prepare(`
    SELECT ${formCols('f.')},
      (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL AND s.status = 'completed') AS completedCount,
      (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL AND s.status = 'partial') AS partialCount,
      (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL AND s.status = 'completed' AND s.read_at IS NULL) AS unreadCount,
      (SELECT MAX(COALESCE(s.submitted_at, s.last_activity_at)) FROM form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL AND s.status IN ('completed','partial')) AS lastResponseAt,
      (SELECT COUNT(*) FROM form_versions v WHERE v.form_id = f.id) AS versionCount,
      (SELECT v.definition_hash FROM form_versions v WHERE v.id = f.live_version_id) AS liveHash,
      (SELECT v.number FROM form_versions v WHERE v.id = f.live_version_id) AS liveNumber
    FROM forms f WHERE f.deleted_at IS NULL AND f.archived_at IS ${opts.archived ? 'NOT NULL' : 'NULL'} ORDER BY ${opts.archived ? 'f.archived_at' : 'f.updated_at'} DESC
  `).all() as FormListRow[]
}

export function completedCount(formId: string): number {
  return (db().prepare(`SELECT COUNT(*) AS n FROM form_submissions WHERE form_id = ? AND deleted_at IS NULL AND status = 'completed'`).get(formId) as { n: number }).n
}

/** Every live form's id and ops, for the retention sweep. */
export function listFormOps(): Array<{ id: string; ops: string }> {
  return db().prepare(`SELECT id, ops FROM forms WHERE deleted_at IS NULL AND ops != '{}'`).all() as Array<{ id: string; ops: string }>
}

export type DraftUpdateResult = { ok: true; revision: number; updatedAt: string } | { ok: false; conflict: true; current: FormRow }

/** Optimistic concurrency: the write only lands when the caller's base
 *  revision is still the stored one. A stale tab gets the current row back
 *  instead of overwriting newer work. */
export function updateDraft(id: string, expectedRevision: number, definition: string, hash: string, title: string, by: string | null): DraftUpdateResult {
  const at = nowIso()
  const res = db().prepare(`UPDATE forms SET draft_definition = ?, draft_hash = ?, draft_revision = draft_revision + 1, draft_updated_at = ?, draft_updated_by = ?, title = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND draft_revision = ?`).run(definition, hash, at, by, title, at, id, expectedRevision)
  if (res.changes === 1) return { ok: true, revision: expectedRevision + 1, updatedAt: at }
  const current = getForm(id)
  if (!current) throw new Error('form not found')
  return { ok: false, conflict: true, current }
}

export function updateFormMeta(id: string, patch: Partial<{ slug: string; title: string; status: FormStatus; liveVersionId: string | null; publishedAt: string | null; closedAt: string | null; closedMessage: string; draftDefinition: string; draftHash: string; name: string; owner: string | null; folderId: string | null; archivedAt: string | null; ops: string }>): void {
  const sets: string[] = []
  const vals: unknown[] = []
  const map: Record<string, string> = { slug: 'slug', title: 'title', status: 'status', liveVersionId: 'live_version_id', publishedAt: 'published_at', closedAt: 'closed_at', closedMessage: 'closed_message', draftDefinition: 'draft_definition', draftHash: 'draft_hash', name: 'name', owner: 'owner', folderId: 'folder_id', archivedAt: 'archived_at', ops: 'ops' }
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || !map[k]) continue; sets.push(`${map[k]} = ?`); vals.push(v) }
  if (!sets.length) return
  sets.push('updated_at = ?'); vals.push(nowIso())
  vals.push(id)
  db().prepare(`UPDATE forms SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function touchForm(id: string): void {
  db().prepare(`UPDATE forms SET updated_at = ? WHERE id = ?`).run(nowIso(), id)
}

export function softDeleteForm(id: string): boolean {
  const res = db().prepare(`UPDATE forms SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(nowIso(), nowIso(), id)
  return res.changes === 1
}

// ── Versions ─────────────────────────────────────────────────────────────────

export function insertVersion(row: { id: string; formId: string; number: number; schemaVersion: number; definition: string; definitionHash: string; publishedBy: string | null }): VersionRow {
  db().prepare(`INSERT INTO form_versions (id, form_id, number, schema_version, definition, definition_hash, published_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.formId, row.number, row.schemaVersion, row.definition, row.definitionHash, row.publishedBy)
  return getVersion(row.id)!
}

export function getVersion(id: string): VersionRow | undefined {
  return db().prepare(`SELECT ${VERSION_COLS} FROM form_versions WHERE id = ?`).get(id) as VersionRow | undefined
}

export function versionCount(formId: string): number {
  return (db().prepare(`SELECT COUNT(*) AS n FROM form_versions WHERE form_id = ?`).get(formId) as { n: number }).n
}

export function listVersions(formId: string): VersionRow[] {
  return db().prepare(`SELECT ${VERSION_COLS} FROM form_versions WHERE form_id = ? ORDER BY number DESC`).all(formId) as VersionRow[]
}

export function nextVersionNumber(formId: string): number {
  const row = db().prepare(`SELECT COALESCE(MAX(number), 0) AS n FROM form_versions WHERE form_id = ?`).get(formId) as { n: number }
  return row.n + 1
}

// ── Submissions ──────────────────────────────────────────────────────────────

/** Completed responses a GRYD video's player opened for one view (`meta.source.gryd_view`), newest first. */
export function completedForVideoView(formIds: string[], viewId: string): Array<{ id: string; versionId: string; answers: string }> {
  return db().prepare(`SELECT id, version_id AS versionId, answers FROM form_submissions
    WHERE form_id IN (${formIds.map(() => '?').join(',')}) AND status = 'completed' AND deleted_at IS NULL
      AND json_extract(metadata, '$.source.gryd_view') = ?
    ORDER BY submitted_at DESC LIMIT 3`).all(...formIds, viewId) as Array<{ id: string; versionId: string; answers: string }>
}

export function insertSubmission(row: { id: string; formId: string; versionId: string; resumeTokenHash: string; idempotencyKey: string | null; answers: string; metadata: string; currentPageId: string | null; startedAt?: string }): SubmissionRow {
  const at = row.startedAt ?? nowIso()
  db().prepare(`INSERT INTO form_submissions (id, form_id, version_id, status, resume_token_hash, idempotency_key, answers, metadata, current_page_id, furthest_page_id, started_at, last_activity_at)
    VALUES (?, ?, ?, 'partial', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.formId, row.versionId, row.resumeTokenHash, row.idempotencyKey, row.answers, row.metadata, row.currentPageId, row.currentPageId, at, at)
  return getSubmission(row.id)!
}

export function getSubmission(id: string): SubmissionRow | undefined {
  return db().prepare(`SELECT ${SUB_COLS} FROM form_submissions WHERE id = ?`).get(id) as SubmissionRow | undefined
}

export function getSubmissionByTokenHash(hash: string): SubmissionRow | undefined {
  return db().prepare(`SELECT ${SUB_COLS} FROM form_submissions WHERE resume_token_hash = ?`).get(hash) as SubmissionRow | undefined
}

export function getSubmissionByIdempotency(formId: string, key: string): SubmissionRow | undefined {
  return db().prepare(`SELECT ${SUB_COLS} FROM form_submissions WHERE form_id = ? AND idempotency_key = ?`).get(formId, key) as SubmissionRow | undefined
}

export function updateSubmission(id: string, patch: Partial<{ versionId: string; status: SubmissionStatus; idempotencyKey: string | null; answers: string; endingId: string | null; endingRuleId: string | null; currentPageId: string | null; furthestPageId: string | null; furthestPageIndex: number; pagesVisited: string; metadata: string; searchText: string; lastActivityAt: string; submittedAt: string | null; durationMs: number | null; deletedAt: string | null; readAt: string | null; editTokenHash: string | null; editedAt: string | null; respondent: string | null; deviceHash: string | null }>): void {
  const map: Record<string, string> = { versionId: 'version_id', status: 'status', idempotencyKey: 'idempotency_key', answers: 'answers', endingId: 'ending_id', endingRuleId: 'ending_rule_id', currentPageId: 'current_page_id', furthestPageId: 'furthest_page_id', furthestPageIndex: 'furthest_page_index', pagesVisited: 'pages_visited', metadata: 'metadata', searchText: 'search_text', lastActivityAt: 'last_activity_at', submittedAt: 'submitted_at', durationMs: 'duration_ms', deletedAt: 'deleted_at', readAt: 'read_at', editTokenHash: 'edit_token_hash', editedAt: 'edited_at', respondent: 'respondent', deviceHash: 'device_hash' }
  const sets: string[] = []; const vals: unknown[] = []
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || !map[k]) continue; sets.push(`${map[k]} = ?`); vals.push(v) }
  if (!sets.length) return
  vals.push(id)
  db().prepare(`UPDATE form_submissions SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function replaceAnswerRows(submissionId: string, rows: Array<{ blockId: string; value: string; text: string }>): void {
  const d = db()
  d.prepare(`DELETE FROM form_submission_answers WHERE submission_id = ?`).run(submissionId)
  const ins = d.prepare(`INSERT INTO form_submission_answers (submission_id, block_id, value, text) VALUES (?, ?, ?, ?)`)
  for (const r of rows) ins.run(submissionId, r.blockId, r.value, r.text)
}

export function addEvent(submissionId: string, kind: string, detail: Record<string, unknown> = {}): void {
  db().prepare(`INSERT INTO form_submission_events (submission_id, kind, detail) VALUES (?, ?, ?)`).run(submissionId, kind, JSON.stringify(detail))
}

export function listEvents(submissionId: string): EventRow[] {
  return db().prepare(`SELECT id, submission_id AS submissionId, kind, at, detail FROM form_submission_events WHERE submission_id = ? ORDER BY id`).all(submissionId) as EventRow[]
}

export interface SubmissionQuery {
  status?: 'all' | 'completed' | 'partial' | 'spam'
  q?: string
  since?: string
  until?: string
  /** block id → text to match (case-insensitive contains). */
  answerFilters?: Array<{ blockId: string; value: string }>
  sort?: 'submitted_desc' | 'submitted_asc' | 'started_desc'
  offset?: number
  limit?: number
  /** Restrict to these submission ids (bulk export). */
  ids?: string[]
}

function whereFor(formId: string, q: SubmissionQuery): { sql: string; args: unknown[] } {
  const parts = ['s.form_id = ?', 's.deleted_at IS NULL']
  const args: unknown[] = [formId]
  const status = q.status ?? 'all'
  if (status === 'all') parts.push(`s.status IN ('completed', 'partial')`)
  else parts.push('s.status = ?'), args.push(status)
  if (q.q && q.q.trim()) { parts.push(`(s.search_text LIKE ? ESCAPE '\\' OR s.id LIKE ? ESCAPE '\\')`); const like = `%${q.q.trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m)}%`; args.push(like, like) }
  if (q.since) parts.push(`COALESCE(s.submitted_at, s.last_activity_at) >= ?`), args.push(q.since)
  if (q.until) parts.push(`COALESCE(s.submitted_at, s.last_activity_at) <= ?`), args.push(q.until)
  if (q.ids && q.ids.length) { parts.push(`s.id IN (${q.ids.map(() => '?').join(',')})`); args.push(...q.ids) }
  for (const f of q.answerFilters ?? []) {
    parts.push(`EXISTS (SELECT 1 FROM form_submission_answers a WHERE a.submission_id = s.id AND a.block_id = ? AND LOWER(a.text) LIKE ? ESCAPE '\\')`)
    args.push(f.blockId, `%${f.value.toLowerCase().replace(/[\\%_]/g, m => '\\' + m)}%`)
  }
  return { sql: parts.join(' AND '), args }
}

/** One ordering for the table, its pages, the sheet's prev/next and the CSV. The
 *  rowid breaks ties (two responses in the same millisecond), so a page never
 *  repeats or skips a row and prev/next always agree with the list. */
function orderFor(q: SubmissionQuery): string {
  if (q.sort === 'submitted_asc') return 'COALESCE(s.submitted_at, s.last_activity_at) ASC, s.rowid ASC'
  if (q.sort === 'started_desc') return 's.started_at DESC, s.rowid DESC'
  return 'COALESCE(s.submitted_at, s.last_activity_at) DESC, s.rowid DESC'
}

export function listSubmissions(formId: string, q: SubmissionQuery = {}): { rows: SubmissionRow[]; total: number } {
  const { sql, args } = whereFor(formId, q)
  const order = orderFor(q)
  const limit = Math.min(500, Math.max(1, q.limit ?? 50)), offset = Math.max(0, q.offset ?? 0)
  const rows = db().prepare(`SELECT ${subCols('s.')} FROM form_submissions s WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset) as SubmissionRow[]
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM form_submissions s WHERE ${sql}`).get(...args) as { n: number }).n
  return { rows, total }
}

export function iterateSubmissions(formId: string, q: SubmissionQuery = {}): SubmissionRow[] {
  const { sql, args } = whereFor(formId, q)
  return db().prepare(`SELECT ${subCols('s.')} FROM form_submissions s WHERE ${sql} ORDER BY ${orderFor(q)}`).all(...args) as SubmissionRow[]
}

export function submissionCounts(formId: string): { total: number; completed: number; partial: number; spam: number; medianDurationMs: number | null } {
  const d = db()
  const c = d.prepare(`SELECT
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial,
    SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS spam
    FROM form_submissions WHERE form_id = ? AND deleted_at IS NULL`).get(formId) as { completed: number | null; partial: number | null; spam: number | null }
  const durations = d.prepare(`SELECT duration_ms AS d FROM form_submissions WHERE form_id = ? AND deleted_at IS NULL AND status = 'completed' AND duration_ms IS NOT NULL ORDER BY duration_ms`).all(formId) as { d: number }[]
  const median = durations.length ? durations[Math.floor(durations.length / 2)].d : null
  const completed = c.completed ?? 0, partial = c.partial ?? 0
  return { total: completed + partial, completed, partial, spam: c.spam ?? 0, medianDurationMs: median }
}

export function neighbourSubmissionIds(formId: string, q: SubmissionQuery, id: string): { prev: string | null; next: string | null; index: number; total: number } {
  const all = iterateSubmissions(formId, q).map(r => r.id)
  const i = all.indexOf(id)
  return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null, index: i, total: all.length }
}

export function softDeleteSubmission(id: string): boolean {
  const res = db().prepare(`UPDATE form_submissions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(nowIso(), id)
  return res.changes === 1
}

/** What a deleted response keeps is its tombstone: the answers, their search text, what we
 *  knew about the device and account, and its file names all go. */
export function eraseSubmissionContent(id: string): void {
  const d = db()
  d.prepare(`UPDATE form_submissions SET answers = '{}', search_text = '', metadata = '{}', respondent = NULL, device_hash = NULL, edit_token_hash = NULL WHERE id = ?`).run(id)
  d.prepare(`DELETE FROM form_submission_answers WHERE submission_id = ?`).run(id)
  d.prepare(`UPDATE form_files SET original_name = '' WHERE submission_id = ?`).run(id)
}

/** Partial responses nobody touched for a while are swept so Results doesn't
 *  fill with abandoned sessions. Returns the swept rows for file cleanup. */
export function listStalePartials(olderThanIso: string, limit = 200): SubmissionRow[] {
  return db().prepare(`SELECT ${SUB_COLS} FROM form_submissions WHERE status = 'partial' AND deleted_at IS NULL AND last_activity_at < ? AND answers = '{}' LIMIT ?`).all(olderThanIso, limit) as SubmissionRow[]
}

export function getSubmissionByEditHash(hash: string): SubmissionRow | undefined {
  return db().prepare(`SELECT ${SUB_COLS} FROM form_submissions WHERE edit_token_hash = ?`).get(hash) as SubmissionRow | undefined
}

/** A completed response already made by this device, account or email address. */
export function findCompletedBy(formId: string, by: { deviceHash?: string; respondent?: string; email?: { blockId: string; value: string } }, exceptId: string | null): string | null {
  const base = `s.form_id = ? AND s.deleted_at IS NULL AND s.status = 'completed' AND s.id != ?`
  const args: unknown[] = [formId, exceptId ?? '']
  let row: { id: string } | undefined
  const latest = 'ORDER BY s.submitted_at DESC LIMIT 1'
  if (by.deviceHash) row = db().prepare(`SELECT s.id FROM form_submissions s WHERE ${base} AND s.device_hash = ? ${latest}`).get(...args, by.deviceHash) as { id: string } | undefined
  else if (by.respondent) row = db().prepare(`SELECT s.id FROM form_submissions s WHERE ${base} AND s.respondent = ? ${latest}`).get(...args, by.respondent) as { id: string } | undefined
  else if (by.email) row = db().prepare(`SELECT s.id FROM form_submissions s JOIN form_submission_answers a ON a.submission_id = s.id WHERE ${base} AND a.block_id = ? AND LOWER(TRIM(a.text)) = ? ${latest}`).get(...args, by.email.blockId, by.email.value.trim().toLowerCase()) as { id: string } | undefined
  return row?.id ?? null
}

export function markRead(ids: string[], read: boolean): number {
  if (!ids.length) return 0
  const res = db().prepare(`UPDATE form_submissions SET read_at = ${read ? 'COALESCE(read_at, ?)' : '?'} WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'completed'`).run(read ? nowIso() : null, ...ids)
  return res.changes
}

export function markFormRead(formId: string | null): number {
  const res = formId
    ? db().prepare(`UPDATE form_submissions SET read_at = ? WHERE form_id = ? AND status = 'completed' AND read_at IS NULL AND deleted_at IS NULL`).run(nowIso(), formId)
    : db().prepare(`UPDATE form_submissions SET read_at = ? WHERE status = 'completed' AND read_at IS NULL AND deleted_at IS NULL AND form_id IN (SELECT id FROM forms WHERE deleted_at IS NULL)`).run(nowIso())
  return res.changes
}

export interface InboxQuery { formId?: string; since?: string; until?: string; unread?: boolean; q?: string; offset?: number; limit?: number }
export interface InboxRow extends SubmissionRow { formTitle: string; formName: string; formArchivedAt: string | null }

function inboxWhere(q: InboxQuery): { sql: string; args: unknown[] } {
  const parts = [`s.status = 'completed'`, 's.deleted_at IS NULL', 'f.deleted_at IS NULL']
  const args: unknown[] = []
  if (q.formId) parts.push('s.form_id = ?'), args.push(q.formId)
  if (q.unread) parts.push('s.read_at IS NULL')
  if (q.since) parts.push('s.submitted_at >= ?'), args.push(q.since)
  if (q.until) parts.push('s.submitted_at <= ?'), args.push(q.until)
  if (q.q && q.q.trim()) { parts.push(`(s.search_text LIKE ? ESCAPE '\\' OR LOWER(f.title) LIKE ? ESCAPE '\\')`); const like = `%${q.q.trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m)}%`; args.push(like, like) }
  return { sql: parts.join(' AND '), args }
}

/** Completed responses across every form, newest first. */
export function listInbox(q: InboxQuery): { rows: InboxRow[]; total: number } {
  const { sql, args } = inboxWhere(q)
  const limit = Math.min(200, Math.max(1, q.limit ?? 50)), offset = Math.max(0, q.offset ?? 0)
  const rows = db().prepare(`SELECT ${subCols('s.')}, f.title AS formTitle, f.name AS formName, f.archived_at AS formArchivedAt FROM form_submissions s JOIN forms f ON f.id = s.form_id
    WHERE ${sql} ORDER BY s.submitted_at DESC, s.rowid DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as InboxRow[]
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE ${sql}`).get(...args) as { n: number }).n
  return { rows, total }
}

export function unreadCount(formId?: string): number {
  const { sql, args } = inboxWhere({ formId, unread: true })
  return (db().prepare(`SELECT COUNT(*) AS n FROM form_submissions s JOIN forms f ON f.id = s.form_id WHERE ${sql}`).get(...args) as { n: number }).n
}

/** Responses (any status) last touched before a cutoff: the retention sweep and "delete older than". */
export function listSubmissionIdsBefore(formId: string, beforeIso: string | null, limit: number): string[] {
  const rows = beforeIso
    ? db().prepare(`SELECT id FROM form_submissions WHERE form_id = ? AND deleted_at IS NULL AND COALESCE(submitted_at, last_activity_at) < ? LIMIT ?`).all(formId, beforeIso, limit)
    : db().prepare(`SELECT id FROM form_submissions WHERE form_id = ? AND deleted_at IS NULL LIMIT ?`).all(formId, limit)
  return (rows as { id: string }[]).map(r => r.id)
}

// ── Files ────────────────────────────────────────────────────────────────────

export function insertFile(row: { id: string; formId: string; submissionId: string | null; blockId: string; storageKey: string; originalName: string; mime: string; size: number; uploadTokenHash: string | null }): FileRow {
  db().prepare(`INSERT INTO form_files (id, form_id, submission_id, block_id, storage_key, original_name, mime, size, status, upload_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(row.id, row.formId, row.submissionId, row.blockId, row.storageKey, row.originalName, row.mime, row.size, row.uploadTokenHash)
  return getFile(row.id)!
}

export function getFile(id: string): FileRow | undefined {
  return db().prepare(`SELECT ${FILE_COLS} FROM form_files WHERE id = ?`).get(id) as FileRow | undefined
}

export function updateFile(id: string, patch: Partial<{ status: FileStatus; size: number; mime: string; submissionId: string | null; uploadedAt: string | null; deletedAt: string | null; uploadTokenHash: string | null }>): void {
  const map: Record<string, string> = { status: 'status', size: 'size', mime: 'mime', submissionId: 'submission_id', uploadedAt: 'uploaded_at', deletedAt: 'deleted_at', uploadTokenHash: 'upload_token_hash' }
  const sets: string[] = []; const vals: unknown[] = []
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || !map[k]) continue; sets.push(`${map[k]} = ?`); vals.push(v) }
  if (!sets.length) return
  vals.push(id)
  db().prepare(`UPDATE form_files SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function listFilesForSubmission(submissionId: string): FileRow[] {
  return db().prepare(`SELECT ${FILE_COLS} FROM form_files WHERE submission_id = ? AND status != 'deleted'`).all(submissionId) as FileRow[]
}

export function listStalePendingFiles(olderThanIso: string, limit = 200): FileRow[] {
  return db().prepare(`SELECT ${FILE_COLS} FROM form_files WHERE status = 'pending' AND created_at < ? LIMIT ?`).all(olderThanIso, limit) as FileRow[]
}

// ── Assets ───────────────────────────────────────────────────────────────────

export function insertAsset(row: { id: string; formId: string; storageKey: string; originalName: string; mime: string; size: number; createdBy: string | null }): AssetRow {
  db().prepare(`INSERT INTO form_assets (id, form_id, storage_key, original_name, mime, size, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.formId, row.storageKey, row.originalName, row.mime, row.size, row.createdBy)
  return getAsset(row.id)!
}

export function getAsset(id: string): AssetRow | undefined {
  return db().prepare(`SELECT ${ASSET_COLS} FROM form_assets WHERE id = ?`).get(id) as AssetRow | undefined
}

export function insertWorkspaceAsset(row: { id: string; storageKey: string; originalName: string; mime: string; size: number; createdBy: string | null }): WorkspaceAssetRow {
  db().prepare(`INSERT INTO form_workspace_assets (id, storage_key, original_name, mime, size, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.storageKey, row.originalName, row.mime, row.size, row.createdBy)
  return getWorkspaceAsset(row.id)!
}

export function getWorkspaceAsset(id: string): WorkspaceAssetRow | undefined {
  return db().prepare(`SELECT id, storage_key AS storageKey, original_name AS originalName, mime, size, created_by AS createdBy, created_at AS createdAt FROM form_workspace_assets WHERE id = ?`).get(id) as WorkspaceAssetRow | undefined
}

// ── Folders ──────────────────────────────────────────────────────────────────

export function listFolders(): FolderRow[] {
  return db().prepare(`SELECT d.id, d.name, d.color, d.position, d.created_at AS createdAt, d.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM forms f WHERE f.folder_id = d.id AND f.deleted_at IS NULL AND f.archived_at IS NULL) AS formCount
    FROM form_folders d ORDER BY d.position, d.created_at`).all() as FolderRow[]
}

export function getFolder(id: string): FolderRow | undefined {
  return listFolders().find(f => f.id === id)
}

export function insertFolder(id: string, name: string, color: string | null = null): FolderRow {
  const pos = (db().prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM form_folders`).get() as { n: number }).n
  db().prepare(`INSERT INTO form_folders (id, name, color, position) VALUES (?, ?, ?, ?)`).run(id, name, color, pos)
  return getFolder(id)!
}

export function updateFolder(id: string, patch: { name?: string; color?: string; position?: number }): boolean {
  const sets: string[] = [], vals: unknown[] = []
  if (patch.name !== undefined) sets.push('name = ?'), vals.push(patch.name)
  if (patch.color !== undefined) sets.push('color = ?'), vals.push(patch.color)
  if (patch.position !== undefined) sets.push('position = ?'), vals.push(patch.position)
  if (!sets.length) return !!getFolder(id)
  sets.push('updated_at = ?'); vals.push(nowIso())
  return db().prepare(`UPDATE form_folders SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id).changes === 1
}

/** The folder goes; its forms stay, in no folder. */
export function deleteFolder(id: string): boolean {
  return transaction(() => {
    db().prepare(`UPDATE forms SET folder_id = NULL WHERE folder_id = ?`).run(id)
    return db().prepare(`DELETE FROM form_folders WHERE id = ?`).run(id).changes === 1
  })
}

// ── Templates ────────────────────────────────────────────────────────────────

const TEMPLATE_COLS = `id, name, description, category, definition, source_form_id AS sourceFormId, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt`

export function listTemplates(): TemplateRow[] {
  return db().prepare(`SELECT ${TEMPLATE_COLS} FROM form_templates ORDER BY updated_at DESC`).all() as TemplateRow[]
}

export function getTemplate(id: string): TemplateRow | undefined {
  return db().prepare(`SELECT ${TEMPLATE_COLS} FROM form_templates WHERE id = ?`).get(id) as TemplateRow | undefined
}

export function insertTemplate(row: { id: string; name: string; description: string; category: string; definition: string; sourceFormId: string | null; createdBy: string | null }): TemplateRow {
  db().prepare(`INSERT INTO form_templates (id, name, description, category, definition, source_form_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.name, row.description, row.category, row.definition, row.sourceFormId, row.createdBy)
  return getTemplate(row.id)!
}

export function updateTemplate(id: string, patch: { name?: string; description?: string; category?: string }): boolean {
  const sets: string[] = [], vals: unknown[] = []
  for (const k of ['name', 'description', 'category'] as const) if (patch[k] !== undefined) sets.push(`${k} = ?`), vals.push(patch[k])
  if (!sets.length) return !!getTemplate(id)
  sets.push('updated_at = ?'); vals.push(nowIso())
  return db().prepare(`UPDATE form_templates SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id).changes === 1
}

export function deleteTemplate(id: string): boolean {
  return db().prepare(`DELETE FROM form_templates WHERE id = ?`).run(id).changes === 1
}

// ── Workspace ────────────────────────────────────────────────────────────────

export function getWorkspaceValue(key: string): string | null {
  const row = db().prepare(`SELECT value FROM forms_workspace WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setWorkspaceValue(key: string, value: string, by: string | null): void {
  db().prepare(`INSERT INTO forms_workspace (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(key, value, by, nowIso())
}

// ── Notifications ────────────────────────────────────────────────────────────

export function insertNotification(row: { formId: string; submissionId: string | null; kind: NotificationKind; recipient: string; recipientKey?: string; status: NotificationStatus; detail: string }): number {
  return Number(db().prepare(`INSERT INTO form_notifications (form_id, submission_id, kind, recipient, recipient_key, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.formId, row.submissionId, row.kind, row.recipient, row.recipientKey ?? '', row.status, row.detail.slice(0, 500), nowIso()).lastInsertRowid)
}

export function updateNotification(id: number, status: NotificationStatus, detail: string): void {
  db().prepare(`UPDATE form_notifications SET status = ?, detail = ? WHERE id = ?`).run(status, detail.slice(0, 500), id)
}

export function listNotifications(formId: string, limit = 20): NotificationRow[] {
  return db().prepare(`SELECT id, form_id AS formId, submission_id AS submissionId, kind, recipient, status, detail, created_at AS createdAt FROM form_notifications WHERE form_id = ? ORDER BY id DESC LIMIT ?`).all(formId, limit) as NotificationRow[]
}

/** Emails sent (or attempted) since a time, for the caps. */
export function countNotifications(q: { formId?: string; kind: NotificationKind; recipientKey?: string; since: string }): number {
  const parts = ['kind = ?', 'created_at >= ?', `status != 'skipped'`]
  const args: unknown[] = [q.kind, q.since]
  if (q.formId) parts.push('form_id = ?'), args.push(q.formId)
  if (q.recipientKey) parts.push('recipient_key = ?'), args.push(q.recipientKey)
  return (db().prepare(`SELECT COUNT(*) AS n FROM form_notifications WHERE ${parts.join(' AND ')}`).get(...args) as { n: number }).n
}

export function transaction<T>(fn: () => T): T {
  return db().transaction(fn)()
}
