// A respondent's session on this device: the answers, the page, the resume
// token and the idempotency key, kept in localStorage per form version so a
// refresh or a flaky connection never costs anyone their answers.
//
// Sessions belong to the version they started on (QA 2026-09-24 P0). When the
// form is published again, the page looks for the newest session this device
// has for the form: if its version is still accepted it resumes there; if it
// has been retired, carryOver() moves the answers onto the live version and
// counts the ones that no longer fit, so the respondent is told, not surprised.

import { allBlocks, componentDef, isInputBlock, isBlank, normalizeAnswers, type AnswerMap, type AnswerValue, type Block, type FormDefinition, type MatrixValue } from '@/lib/forms-core/index'

export interface LocalDraft { v: 1; answers: AnswerMap; pageId: string; visited: string[]; token: string | null; idempotencyKey: string; at: number }

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000

export const sessionKey = (formId: string, versionId: string) => `forms:resp:${formId}:${versionId}`

function valid(d: unknown): d is LocalDraft {
  const x = d as LocalDraft | null
  return !!x && x.v === 1 && typeof x.at === 'number' && Date.now() - x.at <= SESSION_TTL_MS && !!x.answers && typeof x.answers === 'object'
}

export function readDraft(key: string | undefined): LocalDraft | null {
  if (!key) return null
  try { const raw = localStorage.getItem(key); const d = raw ? JSON.parse(raw) : null; return valid(d) ? d : null } catch { return null }
}
export function writeDraft(key: string | undefined, d: LocalDraft): void { if (!key) return; try { localStorage.setItem(key, JSON.stringify(d)) } catch { /* private mode / quota */ } }
export function clearDraft(key: string | undefined): void { if (!key) return; try { localStorage.removeItem(key) } catch { /* ignore */ } }

/** The newest unexpired session this device holds for the form, on any version. */
export function latestSession(formId: string): { versionId: string; key: string; draft: LocalDraft } | null {
  const prefix = sessionKey(formId, '')
  let best: { versionId: string; key: string; draft: LocalDraft } | null = null
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const d = readDraft(key)
      if (!d || !Object.keys(d.answers).length) continue
      if (!best || d.at > best.draft.at) best = { versionId: key.slice(prefix.length), key, draft: d }
    }
  } catch { return null }
  return best
}

/** An answer re-read against `block` as it is now: options that are gone are
 *  removed, and `undefined` means nothing of it still fits. */
function refit(block: Block, value: AnswerValue): AnswerValue | undefined {
  if (isBlank(value)) return undefined
  const ids = new Set(block.options.map(o => o.id))
  if (block.type === 'ranking') {
    const order = Array.isArray(value) ? (value as string[]) : []
    return order.length === ids.size && order.every(id => ids.has(id)) ? value : undefined
  }
  if (block.type === 'matrix') {
    const rows = new Set(((block.settings.rows as Array<{ id: string }> | undefined) ?? []).map(r => r.id))
    const out: MatrixValue = {}
    for (const [row, v] of Object.entries(value as MatrixValue)) {
      if (!rows.has(row)) continue
      const kept = Array.isArray(v) ? v.filter(x => ids.has(x)) : ids.has(String(v)) ? v : undefined
      if (kept !== undefined && !(Array.isArray(kept) && !kept.length)) out[row] = kept
    }
    return Object.keys(out).length ? out : undefined
  }
  if (ids.size && (block.type === 'dropdown' || block.type === 'choice' || block.type === 'checks' || block.type === 'picture')) {
    if (Array.isArray(value)) { const kept = (value as string[]).filter(x => ids.has(x)); return kept.length ? kept : undefined }
    return ids.has(String(value)) ? value : undefined
  }
  return value
}

/** Carry a session onto another version of the form: answers to questions that
 *  still exist come along (re-normalised), answers that no longer fit — a
 *  removed option, a changed matrix — are dropped and counted. */
export function carryOver(d: LocalDraft, def: FormDefinition): { draft: LocalDraft; dropped: number } {
  const blocks = new Map(allBlocks(def).map(b => [b.id, b]))
  const normalized = normalizeAnswers(def, d.answers)
  const answers: AnswerMap = {}
  let dropped = 0
  for (const [id, before] of Object.entries(d.answers)) {
    const block = blocks.get(id)
    if (!block || !isInputBlock(block)) continue // the question itself is gone: nothing to answer again
    const now = normalized[id]
    const kept = now === undefined ? undefined : refit(block, now)
    if (kept === undefined) { if (!componentDef(block.type).isEmpty(before)) dropped++; continue }
    answers[id] = kept
  }
  const pages = new Set(def.pages.map(p => p.id))
  return {
    draft: { ...d, answers, pageId: pages.has(d.pageId) ? d.pageId : def.pages[0]?.id ?? '', visited: (d.visited ?? []).filter(p => pages.has(p)), at: Date.now() },
    dropped,
  }
}
