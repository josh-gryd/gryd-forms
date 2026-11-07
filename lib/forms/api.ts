// Typed client for the dashboard's forms proxy routes. One place knows the
// paths and the error shape, so the builder, home and results never parse a
// response body twice differently.

import type { FormDefinition, FormLanguage, ProgressStyle, Theme } from '@/lib/forms-core/index'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body: Record<string, unknown> = {}) { super(message) }
}

export interface FormSummary {
  id: string; slug: string; title: string; status: 'draft' | 'published' | 'closed'; publishState: 'draft' | 'live' | 'dirty' | 'closed'
  /** The draft differs from what the link serves — true for a closed form with edits too. */
  unpublishedChanges: boolean
  pages: number; fields: number; completedCount: number; partialCount: number; lastResponseAt: string | null
  updatedAt: string; updatedBy: string | null; createdBy: string | null; liveNumber: number | null
  /** Internal name; '' shows the title. */
  name: string; owner: string | null; folderId: string | null; archivedAt: string | null
  unreadCount: number
  availability: 'open' | 'scheduled' | 'closed'; closedReason: 'manual' | 'date' | 'limit' | null
}

export type AccessMode = 'public' | 'restricted'
export type DuplicateMode = 'allow' | 'device' | 'email' | 'account'
export interface NotifySettings { owner: boolean; recipients: string[]; confirmation: boolean; subject: string; message: string; includeAnswers: boolean }
export interface SlackTarget { kind: 'channel' | 'user'; id: string; label: string }
/** fields: the questions a post includes, by block id; null is every answered one. */
export interface SlackSettings { on: boolean; target: SlackTarget | null; message: string; fields: string[] | null }
export interface SlackOption extends SlackTarget { sub?: string }
/** A form's operational settings: saved and live at once (engine ops.ts). */
export interface FormOps {
  opensAt: string | null; closesAt: string | null; maxResponses: number | null; timezone: string
  access: AccessMode; hasPassword: boolean; duplicates: DuplicateMode; notify: NotifySettings; slack: SlackSettings; retentionDays: number | null
}
export interface OpsPatch {
  opensAt?: string | null; closesAt?: string | null; maxResponses?: number | null; timezone?: string
  access?: AccessMode; password?: string | null; duplicates?: DuplicateMode; notify?: Partial<NotifySettings>; slack?: Partial<SlackSettings>; retentionDays?: number | null
}
export interface SettingsPatch { name?: string; owner?: string | null; folderId?: string | null; closedMessage?: string; acceptingResponses?: boolean; ops?: OpsPatch }

export type FolderColor = 'blue' | 'lime' | 'gold' | 'coral' | 'purple' | 'teal' | 'pink' | 'grey'
export interface Folder { id: string; name: string; color: FolderColor; formCount: number }
export interface TemplateSummary { id: string; name: string; description: string; category: string; builtIn: boolean; pages: number; questions: number; updatedAt: string | null; createdBy: string | null }
export interface WorkspaceSettings {
  theme: Theme
  notifications: { sender: string | null; recipients: string[]; owner: boolean; confirmation: boolean; subject: string; message: string }
  defaults: { language: FormLanguage; timezone: string; progress: ProgressStyle; thankYouTitle: string; thankYouBody: string }
}
export interface Sender { owner: string; email: string; label: string; canSend: boolean }
export interface InboxItem { id: string; formId: string; formTitle: string; formArchived: boolean; submittedAt: string | null; readAt: string | null; editedAt: string | null; device: string; preview: Array<{ label: string; text: string }> }
export interface NotificationLog { id: number; kind: 'owner' | 'confirmation' | 'slack'; recipient: string; status: 'sent' | 'failed' | 'skipped'; detail: string; createdAt: string; submissionId: string | null }
export type QuestionSummary = { id: string; label: string; type: string; answered: number } & (
  | { kind: 'options'; multi: boolean; options: Array<{ id: string; label: string; count: number }> }
  | { kind: 'numbers'; min: number | null; max: number | null; average: number | null; distribution: Array<{ value: number; count: number }> | null }
  | { kind: 'text'; samples: string[] }
  | { kind: 'count' }
)
export interface FormReport { completed: number; partial: number; spam: number; completionRate: number | null; medianDurationMs: number | null; lastResponseAt: string | null; perDay: Array<{ day: string; count: number }>; timezone: string; questions: QuestionSummary[] }
export interface ApplyResult { updated: number; published: number; needsPublish: Array<{ id: string; title: string }>; skipped: Array<{ id: string; title: string; reason: string }> }

export interface FormDetail {
  id: string; slug: string; title: string; status: 'draft' | 'published' | 'closed'; publishState: 'draft' | 'live' | 'dirty' | 'closed'; unpublishedChanges: boolean
  draft: FormDefinition; revision: number; draftUpdatedAt: string; draftUpdatedBy: string | null
  live: { versionId: string; number: number; publishedAt: string; hash: string } | null
  versions: Array<{ id: string; number: number; publishedAt: string; publishedBy: string | null }>
  closedMessage: string; createdAt: string
  name: string; owner: string | null; folderId: string | null; archivedAt: string | null
  ops: FormOps
  availability: 'open' | 'scheduled' | 'closed'; closedReason: 'manual' | 'date' | 'limit' | null; opensAt: string | null
  completedCount: number; unreadCount: number
}

export type SaveDraftResult =
  | { ok: true; revision: number; updatedAt: string; publishState: FormDetail['publishState']; unpublishedChanges: boolean; slug?: string }
  | { ok: false; conflict: true; revision: number; definition: FormDefinition; updatedAt: string; updatedBy: string | null }

async function call<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', ...init })
  } catch (err) {
    throw new ApiError(0, (err as Error).message || 'network error')
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok && !(res.status === 409 && json.conflict === true)) throw new ApiError(res.status, String(json.error ?? `HTTP ${res.status}`), json)
  return json as T
}

const enc = encodeURIComponent

export const formsApi = {
  list: (opts: { archived?: boolean } = {}) => call<{ forms: FormSummary[] }>('GET', `/api/forms${opts.archived ? '?archived=1' : ''}`).then(r => r.forms),
  create: (input: { title?: string; definition?: FormDefinition; folderId?: string | null }) => call<FormDetail>('POST', '/api/forms', input),
  settings: (id: string, patch: SettingsPatch) => call<FormDetail>('PATCH', `/api/forms/${enc(id)}/settings`, patch),
  archive: (id: string) => call<FormDetail>('POST', `/api/forms/${enc(id)}/archive`),
  restore: (id: string) => call<FormDetail>('POST', `/api/forms/${enc(id)}/restore`),
  saveAsTemplate: (id: string, input: { name?: string; description?: string; category?: string }) => call<TemplateSummary>('POST', `/api/forms/${enc(id)}/template`, input),
  report: (id: string) => call<FormReport>('GET', `/api/forms/${enc(id)}/report`),
  notifications: (id: string) => call<{ notifications: NotificationLog[] }>('GET', `/api/forms/${enc(id)}/notifications`).then(r => r.notifications),
  slackTargets: (q: string) => call<{ options: SlackOption[]; unavailable?: string }>('GET', `/api/forms/slack/targets?q=${enc(q)}`),
  slackTest: (id: string) => call<{ ok: true; target: string }>('POST', `/api/forms/${enc(id)}/slack/test`),
  folders: () => call<{ folders: Folder[] }>('GET', '/api/forms/folders').then(r => r.folders),
  createFolder: (name: string, color?: FolderColor) => call<Folder>('POST', '/api/forms/folders', color ? { name, color } : { name }),
  renameFolder: (id: string, name: string) => call<Folder>('PATCH', `/api/forms/folders/${enc(id)}`, { name }),
  recolorFolder: (id: string, color: FolderColor) => call<Folder>('PATCH', `/api/forms/folders/${enc(id)}`, { color }),
  deleteFolder: (id: string) => call<{ ok: true }>('DELETE', `/api/forms/folders/${enc(id)}`),
  templates: () => call<{ templates: TemplateSummary[] }>('GET', '/api/forms/templates').then(r => r.templates),
  template: (id: string) => call<TemplateSummary & { definition: FormDefinition }>('GET', `/api/forms/templates/${enc(id)}`),
  useTemplate: (id: string, input: { title?: string; folderId?: string | null } = {}) => call<FormDetail>('POST', `/api/forms/templates/${enc(id)}/use`, input),
  updateTemplate: (id: string, patch: { name?: string; description?: string; category?: string }) => call<TemplateSummary>('PATCH', `/api/forms/templates/${enc(id)}`, patch),
  deleteTemplate: (id: string) => call<{ ok: true }>('DELETE', `/api/forms/templates/${enc(id)}`),
  workspace: () => call<{ settings: WorkspaceSettings; senders: Sender[] }>('GET', '/api/forms/workspace'),
  saveWorkspace: (patch: { theme?: Theme; notifications?: Partial<WorkspaceSettings['notifications']>; defaults?: Partial<WorkspaceSettings['defaults']> }) => call<{ settings: WorkspaceSettings }>('PUT', '/api/forms/workspace', patch).then(r => r.settings),
  applyWorkspace: (input: { parts: Array<'theme' | 'notifications' | 'defaults'>; formIds?: string[]; publish: boolean }) => call<ApplyResult>('POST', '/api/forms/workspace/apply', input),
  uploadWorkspaceLogo: async (file: File) => {
    const res = await fetch('/api/forms/workspace/assets', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, String(json.error ?? 'upload failed'), json)
    return json as { id: string; url: string }
  },
  inbox: (query: string) => call<{ rows: InboxItem[]; total: number; unread: number }>('GET', `/api/forms/responses?${query}`),
  unread: () => call<{ unread: number }>('GET', '/api/forms/responses/unread').then(r => r.unread),
  markRead: (input: { ids?: string[]; formId?: string; all?: boolean; read?: boolean }) => call<{ changed: number; unread: number }>('POST', '/api/forms/responses/read', input),
  get: (id: string) => call<FormDetail>('GET', `/api/forms/${encodeURIComponent(id)}`),
  saveDraft: (id: string, definition: FormDefinition, baseRevision: number) => call<SaveDraftResult>('PUT', `/api/forms/${encodeURIComponent(id)}/draft`, { definition, baseRevision }),
  patch: (id: string, patch: { title?: string; slug?: string; closedMessage?: string }) => call<FormDetail>('PATCH', `/api/forms/${encodeURIComponent(id)}`, patch),
  duplicate: (id: string) => call<FormDetail>('POST', `/api/forms/${encodeURIComponent(id)}/duplicate`),
  remove: (id: string) => call<{ ok: true }>('DELETE', `/api/forms/${encodeURIComponent(id)}`),
  publish: (id: string, baseRevision?: number) => call<{ ok: true; version: { id: string; number: number; publishedAt: string }; slug: string; publishState: 'live' | 'closed'; created: boolean }>('POST', `/api/forms/${encodeURIComponent(id)}/publish`, { baseRevision }),
  close: (id: string) => call<FormDetail>('POST', `/api/forms/${encodeURIComponent(id)}/close`),
  reopen: (id: string) => call<FormDetail>('POST', `/api/forms/${encodeURIComponent(id)}/reopen`),
  unpublish: (id: string) => call<FormDetail>('POST', `/api/forms/${encodeURIComponent(id)}/unpublish`),
  version: (id: string, versionId: string) => call<{ id: string; number: number; publishedAt: string; definition: FormDefinition }>('GET', `/api/forms/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
  responses: (id: string, query: string) => call<ResponseList>('GET', `/api/forms/${encodeURIComponent(id)}/responses?${query}`),
  response: (id: string, rid: string, query: string) => call<ResponseDetail>('GET', `/api/forms/${encodeURIComponent(id)}/responses/${encodeURIComponent(rid)}?${query}`),
  deleteResponse: (id: string, rid: string) => call<{ ok: true }>('DELETE', `/api/forms/${encodeURIComponent(id)}/responses/${encodeURIComponent(rid)}`),
  deleteResponses: (id: string, ids: string[]) => call<{ ok: true; deleted: number }>('POST', `/api/forms/${encodeURIComponent(id)}/responses/delete`, { ids }),
  uploadAsset: async (id: string, file: File) => {
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}/assets`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, String(json.error ?? 'upload failed'), json)
    return json as { id: string; url: string; name: string; size: number; mime: string }
  },
  csvUrl: (id: string, query: string) => `/api/forms/${encodeURIComponent(id)}/responses.csv?${query}`,
  fileUrl: (id: string, fileId: string) => `/api/forms/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
}

export interface ResponseSummary {
  id: string; status: 'partial' | 'completed' | 'spam'; startedAt: string; submittedAt: string | null; lastActivityAt: string; durationMs: number | null
  versionId: string; versionNumber: number; endingId: string | null; endingName: string | null; furthestPageIndex: number; furthestPageName: string | null
  device: string; flags: string[]; cells: Record<string, string>
  readAt: string | null; editedAt: string | null; respondent: string | null
}
export interface ColumnDef { id: string; label: string; type: string }
export interface ResponseList { rows: ResponseSummary[]; total: number; counts: { total: number; completed: number; partial: number; spam: number; medianDurationMs: number | null }; columns: ColumnDef[] }
export interface ResponseDetail {
  summary: ResponseSummary
  answers: Record<string, unknown>
  definition: FormDefinition
  endingRuleSentence: string | null
  files: Array<{ id: string; blockId: string; name: string; size: number; mime: string; status: string }>
  events: Array<{ kind: string; at: string; detail: Record<string, unknown> }>
  pagesVisited: string[]
  metadata: Record<string, unknown>
  neighbours: { prev: string | null; next: string | null; index: number; total: number }
}

export function publicFormUrl(slug: string): string {
  if (typeof window === 'undefined') return `/f/${slug}`
  const host = (process.env.NEXT_PUBLIC_FORMS_PUBLIC_HOST || '').trim()
  return host ? `https://${host}/${slug}` : `${window.location.origin}/f/${slug}`
}

export function embedSnippet(slug: string): string {
  const url = publicFormUrl(slug)
  return `<iframe src="${url}?embed=1" title="Form" style="width:100%;min-height:640px;border:0" loading="lazy" allow="clipboard-write"></iframe>\n<script>window.addEventListener('message',function(e){var d=e.data;if(!d||d.source!=='gryd-forms'||d.type!=='height'||!d.height)return;document.querySelectorAll('iframe[src^="${url}"]').forEach(function(f){if(f.contentWindow===e.source)f.style.height=d.height+'px'})});</script>`
}

/** Tell the Forms sidebar its counts or folders changed (unread, folders). */
export function formsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gryd:forms-changed'))
}
