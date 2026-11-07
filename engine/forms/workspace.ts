// The Forms workspace: what every new form starts from (branding, notification
// defaults, language, time zone, progress bar, thank-you message), the folders
// in the sidebar, saved templates, and which connected Google account sends
// form email. Defaults apply to forms made after they change; bringing
// existing forms along is its own explicit action (library.ts).

import type { Readable } from 'node:stream'
import * as repo from './repo'
import { ServiceError } from './errors'
import { formsLog } from './log'
import { getStorage, assetKey, BytesLimitError } from './storage'
import { emailFrom } from '../integrations/email.js'
import {
  DEFAULT_THEME, parseTheme, isFormLanguage, longId, extensionOf, isStockThanks, uiFor,
  type Theme, type FormLanguage, type ProgressStyle, type FormDefinition,
} from './core/index'
import { DEFAULT_TIMEZONE, defaultOps, isEmail, isValidTimezone, type FormOps } from './ops'

export interface WorkspaceSettings {
  /** The theme new forms start with: colours, fonts, logo, footer. */
  theme: Theme
  notifications: {
    /** Credential owner key whose Gmail sends form email (an agent id or user:<email>). Null: nothing sends. */
    sender: string | null
    recipients: string[]
    owner: boolean
    confirmation: boolean
    subject: string
    message: string
  }
  defaults: { language: FormLanguage; timezone: string; progress: ProgressStyle; thankYouTitle: string; thankYouBody: string }
}

export const DEFAULT_THANKS = 'Thanks, we got it.'
const PROGRESS: ProgressStyle[] = ['none', 'bar', 'pages', 'stages']
const KEY = 'settings'

export function defaultWorkspace(): WorkspaceSettings {
  return {
    theme: { ...DEFAULT_THEME },
    notifications: { sender: null, recipients: [], owner: true, confirmation: false, subject: '', message: '' },
    defaults: { language: 'en', timezone: DEFAULT_TIMEZONE, progress: 'bar', thankYouTitle: DEFAULT_THANKS, thankYouBody: '' },
  }
}

function parseWorkspace(json: string | null): WorkspaceSettings {
  const d = defaultWorkspace()
  let r: Record<string, unknown> = {}
  try { const v = JSON.parse(json || '{}'); if (v && typeof v === 'object') r = v as Record<string, unknown> } catch { /* defaults */ }
  const n = (r.notifications && typeof r.notifications === 'object' ? r.notifications : {}) as Record<string, unknown>
  const f = (r.defaults && typeof r.defaults === 'object' ? r.defaults : {}) as Record<string, unknown>
  return {
    theme: r.theme ? parseTheme(r.theme) : d.theme,
    notifications: {
      sender: typeof n.sender === 'string' && n.sender ? n.sender : null,
      recipients: Array.isArray(n.recipients) ? n.recipients.filter((e): e is string => typeof e === 'string' && isEmail(e)).slice(0, 10) : [],
      owner: typeof n.owner === 'boolean' ? n.owner : d.notifications.owner,
      confirmation: n.confirmation === true,
      subject: typeof n.subject === 'string' ? n.subject.slice(0, 200) : '',
      message: typeof n.message === 'string' ? n.message.slice(0, 5000) : '',
    },
    defaults: {
      language: isFormLanguage(f.language) ? f.language : d.defaults.language,
      timezone: typeof f.timezone === 'string' && isValidTimezone(f.timezone) ? f.timezone : d.defaults.timezone,
      progress: PROGRESS.includes(f.progress as ProgressStyle) ? (f.progress as ProgressStyle) : d.defaults.progress,
      thankYouTitle: typeof f.thankYouTitle === 'string' ? f.thankYouTitle.slice(0, 300) : d.defaults.thankYouTitle,
      thankYouBody: typeof f.thankYouBody === 'string' ? f.thankYouBody.slice(0, 2000) : '',
    },
  }
}

export function getWorkspace(): WorkspaceSettings {
  return parseWorkspace(repo.getWorkspaceValue(KEY))
}

export interface WorkspacePatch {
  theme?: unknown
  notifications?: Partial<WorkspaceSettings['notifications']>
  defaults?: Partial<WorkspaceSettings['defaults']>
}

export async function saveWorkspace(patch: WorkspacePatch, by: string | null): Promise<WorkspaceSettings> {
  const cur = getWorkspace()
  const bad = (msg: string): never => { throw new ServiceError(400, msg) }
  const next: WorkspaceSettings = { theme: cur.theme, notifications: { ...cur.notifications }, defaults: { ...cur.defaults } }
  if (patch.theme !== undefined) next.theme = parseTheme(patch.theme)
  const n = patch.notifications
  if (n) {
    if (n.sender !== undefined) {
      if (n.sender === null || n.sender === '') next.notifications.sender = null
      else if (!(await listSenders()).some(s => s.owner === n.sender && s.canSend)) bad('Email isn’t set up — set FORMS_SMTP_URL and FORMS_EMAIL_FROM first')
      else next.notifications.sender = n.sender
    }
    if (n.recipients !== undefined) {
      const list = [...new Set((Array.isArray(n.recipients) ? n.recipients : []).map(e => String(e).trim().toLowerCase()).filter(Boolean))]
      const wrong = list.find(e => !isEmail(e))
      if (wrong) bad(`${wrong} is not an email address`)
      if (list.length > 10) bad('Up to 10 recipients')
      next.notifications.recipients = list
    }
    if (n.owner !== undefined) next.notifications.owner = !!n.owner
    if (n.confirmation !== undefined) next.notifications.confirmation = !!n.confirmation
    if (n.subject !== undefined) next.notifications.subject = String(n.subject).replace(/[\r\n]+/g, ' ').slice(0, 200)
    if (n.message !== undefined) next.notifications.message = String(n.message).slice(0, 5000)
  }
  const f = patch.defaults
  if (f) {
    if (f.language !== undefined) { if (!isFormLanguage(f.language)) bad('Unknown language'); next.defaults.language = f.language }
    if (f.timezone !== undefined) { if (!isValidTimezone(f.timezone)) bad('Unknown time zone'); next.defaults.timezone = f.timezone }
    if (f.progress !== undefined) { if (!PROGRESS.includes(f.progress)) bad('Unknown progress style'); next.defaults.progress = f.progress }
    if (f.thankYouTitle !== undefined) next.defaults.thankYouTitle = String(f.thankYouTitle).slice(0, 300)
    if (f.thankYouBody !== undefined) next.defaults.thankYouBody = String(f.thankYouBody).slice(0, 2000)
  }
  repo.setWorkspaceValue(KEY, JSON.stringify(next), by)
  formsLog.info('workspace.saved', { by, sender: next.notifications.sender ?? undefined })
  return next
}

/** A new form's document gets the workspace's language, progress bar and
 *  thank-you message, and — unless it brings its own design — its theme. */
export function withWorkspaceDefaults(def: FormDefinition, opts: { theme: boolean; ws?: WorkspaceSettings }): FormDefinition {
  const ws = opts.ws ?? getWorkspace()
  const out: FormDefinition = { ...def, settings: { ...def.settings, language: ws.defaults.language, progress: ws.defaults.progress } }
  if (opts.theme) out.theme = { ...ws.theme }
  if (out.endings.length === 1 && out.endings[0].kind === 'message' && isStockThanks(out.endings[0].title) && !out.endings[0].body) {
    const title = ws.defaults.thankYouTitle && !isStockThanks(ws.defaults.thankYouTitle) ? ws.defaults.thankYouTitle : uiFor(ws.defaults.language).thanks
    out.endings = [{ ...out.endings[0], title, body: ws.defaults.thankYouBody }]
  }
  return out
}

/** Operational settings a new form starts with. */
export function opsForNewForm(ws: WorkspaceSettings = getWorkspace()): FormOps {
  const ops = defaultOps()
  ops.timezone = ws.defaults.timezone
  ops.notify = { ...ops.notify, owner: ws.notifications.owner, recipients: [...ws.notifications.recipients], confirmation: ws.notifications.confirmation, subject: ws.notifications.subject, message: ws.notifications.message }
  return ops
}

// ── Senders ──────────────────────────────────────────────────────────────────

export interface Sender { owner: string; email: string; label: string; canSend: boolean }

/** Who form email can send as: the SMTP sender, when email is set up. */
export async function listSenders(): Promise<Sender[]> {
  const from = emailFrom()
  return from ? [{ owner: 'smtp', email: from, label: from, canSend: true }] : []
}

// ── Workspace logo ───────────────────────────────────────────────────────────

const LOGO_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const LOGO_MAX = 4 * 1024 * 1024

export async function uploadWorkspaceAsset(input: { name: string; body: Readable; by: string | null }): Promise<{ id: string; url: string; name: string; size: number; mime: string }> {
  const ext = extensionOf(input.name)
  const mime = LOGO_TYPES[ext]
  if (!mime) throw new ServiceError(422, 'images only (PNG, JPG, GIF or WebP)')
  const id = longId('ast')
  const key = assetKey('workspace', id, ext)
  let info
  try { info = await getStorage().putStream(key, input.body, { contentType: mime, maxBytes: LOGO_MAX }) } catch (err) {
    if (err instanceof BytesLimitError) throw new ServiceError(413, 'logos need to be under 4 MB')
    formsLog.error('workspace_asset.store_failed', err); throw new ServiceError(502, 'storage unavailable')
  }
  repo.insertWorkspaceAsset({ id, storageKey: key, originalName: input.name.slice(0, 255), mime, size: info.size, createdBy: input.by })
  return { id, url: `/api/public/forms/assets/${id}`, name: input.name, size: info.size, mime }
}

// ── Folders ──────────────────────────────────────────────────────────────────

/** A folder's color: its forms carry it in All forms, and the
 *  sidebar and the folder's own page show it. One of a fixed palette. */
export const FOLDER_COLORS = ['blue', 'lime', 'gold', 'coral', 'purple', 'teal', 'pink', 'grey'] as const
export type FolderColor = typeof FOLDER_COLORS[number]
const isFolderColor = (v: unknown): v is FolderColor => typeof v === 'string' && (FOLDER_COLORS as readonly string[]).includes(v)

/** A folder from before colors keeps a steady one, picked from its id. */
function colorOf(row: { id: string; color: string | null }): FolderColor {
  if (isFolderColor(row.color)) return row.color
  let h = 0
  for (const ch of row.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FOLDER_COLORS[h % FOLDER_COLORS.length]
}

export interface Folder { id: string; name: string; color: FolderColor; formCount: number }

const toFolder = (f: repo.FolderRow): Folder => ({ id: f.id, name: f.name, color: colorOf(f), formCount: f.formCount })

const folderName = (v: unknown): string => {
  const name = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  if (!name) throw new ServiceError(400, 'folder name required')
  return name
}

const folderColor = (v: unknown): FolderColor => {
  if (!isFolderColor(v)) throw new ServiceError(400, `color must be one of ${FOLDER_COLORS.join(', ')}`)
  return v
}

export function listFolders(): Folder[] {
  return repo.listFolders().map(toFolder)
}

/** A new folder takes the color asked for, else the first one no folder wears yet. */
export function createFolder(name: unknown, by: string | null, color?: unknown): Folder {
  const n = folderName(name)
  const existing = repo.listFolders()
  if (existing.some(f => f.name.toLowerCase() === n.toLowerCase())) throw new ServiceError(409, 'there is already a folder with that name')
  const worn = new Set(existing.map(colorOf))
  const c = color !== undefined ? folderColor(color) : FOLDER_COLORS.find(x => !worn.has(x)) ?? FOLDER_COLORS[existing.length % FOLDER_COLORS.length]
  const row = repo.insertFolder(longId('fld'), n, c)
  formsLog.info('folder.created', { folder: row.id, by })
  return toFolder(row)
}

/** Rename a folder, recolor it, or both. */
export function updateFolder(id: string, patch: { name?: unknown; color?: unknown }): Folder {
  if (patch.name === undefined && patch.color === undefined) throw new ServiceError(400, 'nothing to change: send a name or a color')
  const name = patch.name !== undefined ? folderName(patch.name) : undefined
  const color = patch.color !== undefined ? folderColor(patch.color) : undefined
  if (name !== undefined && repo.listFolders().some(f => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) throw new ServiceError(409, 'there is already a folder with that name')
  if (!repo.updateFolder(id, { name, color })) throw new ServiceError(404, 'folder not found')
  return toFolder(repo.getFolder(id)!)
}

export function renameFolder(id: string, name: unknown): Folder {
  return updateFolder(id, { name })
}

export function reorderFolders(ids: string[]): Folder[] {
  repo.transaction(() => ids.forEach((id, i) => repo.updateFolder(id, { position: i })))
  return listFolders()
}

export function deleteFolder(id: string, by: string | null): void {
  if (!repo.deleteFolder(id)) throw new ServiceError(404, 'folder not found')
  formsLog.info('folder.deleted', { folder: id, by })
}
