import { register, requiredMessage, numOr, type FileStatus } from '../registry'
import type { Block } from '../schema'
import { ERR } from '../errors'
import { errorsFor } from '../i18n'
import type { FileAnswer } from '../answers'

export type AcceptKind = 'docs-images' | 'docs' | 'images' | 'any'

const DOCS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'rtf', 'odt', 'ods', 'key', 'numbers', 'pages']
const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const BLOCKED = new Set(['exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'msi', 'dmg', 'apk', 'com', 'scr', 'ps1', 'vbs', 'jar', 'dll', 'so', 'html', 'htm', 'svg', 'php'])

export const ACCEPT_EXTENSIONS: Record<AcceptKind, string[] | null> = {
  'docs-images': [...DOCS, ...IMAGES],
  docs: DOCS,
  images: IMAGES,
  any: null,
}
export const ACCEPT_LABEL: Record<AcceptKind, string> = {
  'docs-images': 'PDF, DOCX, PNG', docs: 'PDF or DOCX', images: 'PNG or JPG', any: 'a different file',
}

export interface UploadSettings { accept: AcceptKind; maxSizeMb: number; maxFiles: number }
export function uploadSettings(raw: Record<string, unknown>): UploadSettings {
  const accept = (['docs-images', 'docs', 'images', 'any'] as const).includes(raw.accept as AcceptKind) ? (raw.accept as AcceptKind) : 'docs-images'
  return { accept, maxSizeMb: Math.min(100, Math.max(1, Math.round(numOr(raw.maxSizeMb, 25) ?? 25))), maxFiles: Math.min(10, Math.max(1, Math.round(numOr(raw.maxFiles, 1) ?? 1))) }
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim())
  return m ? m[1].toLowerCase() : ''
}

/** Server- and client-side gate for a pick: type and size. Null when allowed. */
export function fileGate(block: Block, file: { name: string; size: number }): string | null {
  const s = uploadSettings(block.settings)
  const ext = extensionOf(file.name)
  const label = errorsFor().acceptLabel[s.accept]
  if (!ext || BLOCKED.has(ext)) return ERR.fileType(label)
  const allowed = ACCEPT_EXTENSIONS[s.accept]
  if (allowed && !allowed.includes(ext)) return ERR.fileType(label)
  if (file.size <= 0 || file.size > s.maxSizeMb * 1024 * 1024) return ERR.fileSize(s.maxSizeMb)
  return null
}

export function acceptAttribute(block: Block): string {
  const s = uploadSettings(block.settings)
  const allowed = ACCEPT_EXTENSIONS[s.accept]
  return allowed ? allowed.map(e => `.${e}`).join(',') : ''
}

register<UploadSettings>({
  type: 'upload', label: 'File upload', icon: 'upload', category: 'Media', keywords: 'attach document pdf image file', kind: 'input', hasDescription: true,
  defaults: () => ({ label: 'File upload', settings: { accept: 'docs-images', maxSizeMb: 25, maxFiles: 1 } }),
  settings: uploadSettings,
  normalize: (_b, raw) => {
    if (raw === '' || raw === null || raw === undefined) return []
    if (!Array.isArray(raw)) return undefined
    const out: FileAnswer[] = []
    for (const f of raw) {
      if (!f || typeof f !== 'object') continue
      const r = f as Record<string, unknown>
      if (typeof r.fileId !== 'string' || !/^fil_[0-9a-z]{6,40}$/.test(r.fileId)) continue
      out.push({ fileId: r.fileId, name: typeof r.name === 'string' ? r.name.slice(0, 255) : 'file', size: typeof r.size === 'number' && Number.isFinite(r.size) ? Math.max(0, Math.floor(r.size)) : 0, mime: typeof r.mime === 'string' ? r.mime.slice(0, 120) : '' })
    }
    return out.slice(0, 10)
  },
  isEmpty: v => !Array.isArray(v) || v.length === 0,
  validate: (block, value, ctx) => {
    const files = Array.isArray(value) ? (value as FileAnswer[]) : []
    const s = uploadSettings(block.settings)
    if (files.length === 0) return block.required ? ERR.uploadRequired : null
    if (files.length > s.maxFiles) return ERR.tooManyFiles(s.maxFiles)
    for (const f of files) {
      const gate = fileGate(block, f)
      if (gate) return gate
      const st: FileStatus = ctx.fileStatus ? ctx.fileStatus(f.fileId) : { status: 'uploaded' }
      if (st.status === 'pending') return ERR.uploadBusy
      if (st.status === 'failed' || st.status === 'missing') return ERR.uploadFailed
    }
    return null
  },
  logic: { ops: ['empty', 'not_empty'], valueKind: 'none' },
  logicValue: (_b, v) => (Array.isArray(v) && v.length ? (v as FileAnswer[]).map(f => f.fileId) : null),
  display: (_b, v) => (Array.isArray(v) ? (v as FileAnswer[]).map(f => f.name).join(', ') : ''),
})
