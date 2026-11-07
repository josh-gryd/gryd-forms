// Templates (the four built in, plus forms someone saved as a template) and
// bringing existing forms in line with the workspace settings. Both make or
// change forms, so they sit on top of the service rather than inside it.

import * as repo from './repo'
import * as svc from './service'
import { ServiceError } from './errors'
import { formsLog } from './log'
import { loadDefinition } from './definitions'
import { getWorkspace } from './workspace'
import { parseOps } from './ops'
import { BUILT_IN_TEMPLATES, builtInTemplate, cloneDefinition, allBlocks, isInputBlock, answerPages, longId, definitionHash, isStockThanks, uiFor, type FormDefinition } from './core/index'

export interface TemplateSummary {
  id: string; name: string; description: string; category: string; builtIn: boolean
  pages: number; questions: number; updatedAt: string | null; createdBy: string | null
}

const shape = (def: FormDefinition) => ({ pages: answerPages(def).length, questions: allBlocks(def).filter(isInputBlock).length })

export function listTemplates(): TemplateSummary[] {
  const builtIn = BUILT_IN_TEMPLATES.map(t => ({ id: t.id, name: t.name, description: t.description, category: t.category, builtIn: true, ...shape(t.build()), updatedAt: null, createdBy: null }))
  const saved = repo.listTemplates().map(t => {
    let s = { pages: 0, questions: 0 }
    try { s = shape(loadDefinition(t.definition)) } catch { /* counted as empty */ }
    return { id: t.id, name: t.name, description: t.description, category: t.category, builtIn: false, ...s, updatedAt: t.updatedAt, createdBy: t.createdBy }
  })
  return [...builtIn, ...saved]
}

export function getTemplate(id: string): TemplateSummary & { definition: FormDefinition } {
  const b = builtInTemplate(id)
  if (b) { const def = b.build(); return { id: b.id, name: b.name, description: b.description, category: b.category, builtIn: true, ...shape(def), updatedAt: null, createdBy: null, definition: def } }
  const t = repo.getTemplate(id)
  if (!t) throw new ServiceError(404, 'template not found')
  const def = loadDefinition(t.definition)
  return { id: t.id, name: t.name, description: t.description, category: t.category, builtIn: false, ...shape(def), updatedAt: t.updatedAt, createdBy: t.createdBy, definition: def }
}

/** A new form from a template. A built-in one takes the workspace's look and
 *  defaults; a saved one keeps the design it was saved with. */
export function useTemplate(id: string, input: { title?: string; folderId?: string | null; by: string | null }): svc.FormDetail {
  const b = builtInTemplate(id)
  if (b) return svc.createForm({ definition: b.build(), title: input.title, folderId: input.folderId, createdBy: input.by, defaults: 'all' })
  const t = repo.getTemplate(id)
  if (!t) throw new ServiceError(404, 'template not found')
  const def = cloneDefinition(loadDefinition(t.definition))
  const detail = svc.createForm({ definition: def, title: input.title || t.name, folderId: input.folderId, createdBy: input.by, defaults: 'none' })
  formsLog.info('template.used', { template: id, form: detail.id, by: input.by })
  return detail
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function saveAsTemplate(formId: string, input: { name?: unknown; description?: unknown; category?: unknown; by: string | null }): TemplateSummary {
  const row = repo.getForm(formId)
  if (!row) throw new ServiceError(404, 'form not found')
  const def = loadDefinition(row.draftDefinition)
  const name = text(input.name, 120) || def.title
  const t = repo.insertTemplate({ id: longId('tpl'), name, description: text(input.description, 300), category: text(input.category, 40), definition: JSON.stringify(def), sourceFormId: formId, createdBy: input.by })
  formsLog.info('template.saved', { template: t.id, form: formId, by: input.by })
  return { id: t.id, name: t.name, description: t.description, category: t.category, builtIn: false, ...shape(def), updatedAt: t.updatedAt, createdBy: t.createdBy }
}

export function updateTemplate(id: string, patch: { name?: unknown; description?: unknown; category?: unknown }): TemplateSummary {
  if (builtInTemplate(id)) throw new ServiceError(400, 'built-in templates can’t be changed')
  const name = patch.name === undefined ? undefined : text(patch.name, 120)
  if (name === '') throw new ServiceError(400, 'template name required')
  if (!repo.updateTemplate(id, { name, description: patch.description === undefined ? undefined : text(patch.description, 300), category: patch.category === undefined ? undefined : text(patch.category, 40) })) throw new ServiceError(404, 'template not found')
  const { definition: _d, ...summary } = getTemplate(id)
  return summary
}

export function deleteTemplate(id: string, by: string | null): void {
  if (builtInTemplate(id)) throw new ServiceError(400, 'built-in templates can’t be deleted')
  if (!repo.deleteTemplate(id)) throw new ServiceError(404, 'template not found')
  formsLog.info('template.deleted', { template: id, by })
}

// ── Apply workspace settings to existing forms ───────────────────────────────

export type ApplyPart = 'theme' | 'notifications' | 'defaults'
export interface ApplyResult { updated: number; published: number; needsPublish: Array<{ id: string; title: string }>; skipped: Array<{ id: string; title: string; reason: string }> }

/** The explicit "update existing forms" action. The design and defaults go
 *  into each draft; with `publish`, a form whose draft matched its live
 *  version is published again so respondents see it, and a form with other
 *  unpublished edits is left for its owner (listed in needsPublish).
 *  Notification defaults and the time zone take effect at once. */
export function applyWorkspace(input: { parts: unknown; formIds?: unknown; publish?: unknown }, by: string | null): ApplyResult {
  const parts = new Set((Array.isArray(input.parts) ? input.parts : []).filter((p): p is ApplyPart => p === 'theme' || p === 'notifications' || p === 'defaults'))
  if (!parts.size) throw new ServiceError(400, 'choose what to apply: theme, notifications or defaults')
  const only = Array.isArray(input.formIds) ? new Set(input.formIds.filter((x): x is string => typeof x === 'string')) : null
  const ws = getWorkspace()
  const out: ApplyResult = { updated: 0, published: 0, needsPublish: [], skipped: [] }
  for (const f of repo.listForms({ archived: false })) {
    if (only && !only.has(f.id)) continue
    const row = repo.getForm(f.id)
    if (!row) continue
    const live = row.liveVersionId ? repo.getVersion(row.liveVersionId) : undefined
    const wasClean = !!live && live.definitionHash === row.draftHash
    let def = loadDefinition(row.draftDefinition)
    if (parts.has('theme')) def = { ...def, theme: { ...ws.theme } }
    if (parts.has('defaults')) def = { ...def, settings: { ...def.settings, language: ws.defaults.language, progress: ws.defaults.progress }, endings: def.endings.map(en => isStockThanks(en.title) ? { ...en, title: uiFor(ws.defaults.language).thanks } : en) }
    const docChanged = definitionHash(def) !== row.draftHash
    if (docChanged) {
      const res = svc.saveDraft(row.id, { definition: def, baseRevision: row.draftRevision, by })
      if (!res.ok) { out.skipped.push({ id: row.id, title: row.title, reason: 'it was being edited — try again' }); continue }
    }
    if (parts.has('notifications') || parts.has('defaults')) {
      const ops = parseOps(row.ops)
      if (parts.has('notifications')) ops.notify = { ...ops.notify, owner: ws.notifications.owner, recipients: [...ws.notifications.recipients], confirmation: ws.notifications.confirmation, subject: ws.notifications.subject, message: ws.notifications.message }
      if (parts.has('defaults')) ops.timezone = ws.defaults.timezone
      repo.updateFormMeta(row.id, { ops: JSON.stringify(ops) })
    }
    out.updated++
    if (docChanged && live) {
      let published = false
      if (input.publish === true && wasClean) {
        try { svc.publishForm(row.id, { by }); published = true; out.published++ } catch (err) { if (!(err instanceof ServiceError)) throw err }
      }
      if (!published) out.needsPublish.push({ id: row.id, title: row.name || row.title })
    }
  }
  formsLog.info('workspace.applied', { parts: [...parts].join(','), updated: out.updated, published: out.published, by })
  return out
}
