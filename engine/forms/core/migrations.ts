// Schema migrations. A persisted document says which schemaVersion it is; this
// module walks it forward one version at a time. Each step is deterministic
// (the same input always yields the same output — ids derived from stable
// inputs, never from randomness or the clock), so an immutable FormVersion
// can be migrated on read forever without being rewritten.
//
// v1 — the prototype shape: options were label strings, rules used English
//      operator names and label values, pages had `btn`, blocks had `desc`/`ph`.
// v2 — current: option objects with ids, condition values are option ids,
//      operator/action codes, settings objects, theme + settings blocks.

import { SCHEMA_VERSION } from './schema'

export interface MigrationResult { definition: unknown; from: number; to: number; steps: string[] }

type Step = (doc: Record<string, unknown>) => Record<string, unknown>

function hashId(prefix: string, seed: string): string {
  // FNV-1a 32-bit, twice with different salts, so ids are stable and unlikely to collide.
  const fnv = (s: string, salt: number) => {
    let h = 0x811c9dc5 ^ salt
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(36)
  }
  return `${prefix}_${fnv(seed, 1)}${fnv(seed, 7)}`.slice(0, 24)
}

const V1_OPS: Record<string, string> = { 'is': 'eq', 'is not': 'neq', 'is any of': 'in', 'contains': 'contains', 'is greater than': 'gt', 'is less than': 'lt', 'is empty': 'empty', 'is not empty': 'not_empty' }
const V1_ACTIONS: Record<string, string> = { 'show page': 'show_page', 'end with': 'go_to_ending', 'hide field': 'hide_field', 'show field': 'show_field', 'skip to': 'go_to_page' }

const v1ToV2: Step = doc => {
  const pagesIn = Array.isArray(doc.pages) ? (doc.pages as Record<string, unknown>[]) : []
  const optionIndex = new Map<string, Map<string, string>>() // blockId → label → optionId
  const blockTypes = new Map<string, string>()
  const migrateBlock = (b: Record<string, unknown>) => {
    const id = String(b.id)
    const labels = Array.isArray(b.options) ? (b.options as unknown[]).map(o => (typeof o === 'string' ? o : String((o as Record<string, unknown>)?.label ?? ''))) : []
    const byLabel = new Map<string, string>()
    const options = labels.map((label, i) => {
      const oid = hashId('o', `${id}:${i}:${label}`)
      if (!byLabel.has(label)) byLabel.set(label, oid)
      return { id: oid, label }
    })
    optionIndex.set(id, byLabel)
    const type = String(b.type)
    blockTypes.set(id, type)
    const settings: Record<string, unknown> = {}
    return { id, type, label: String(b.label ?? ''), description: String(b.desc ?? b.description ?? ''), required: b.required === true, width: b.width ?? 'full', placeholder: String(b.ph ?? b.placeholder ?? ''), options, settings }
  }
  const pages = pagesIn.map((p, i) => ({
    id: String(p.id ?? `p${i + 1}`), kind: 'page', name: String(p.name ?? `Page ${i + 1}`), buttonLabel: String(p.btn ?? p.buttonLabel ?? ''), stage: '',
    blocks: Array.isArray(p.blocks) ? (p.blocks as Record<string, unknown>[]).map(migrateBlock) : [],
  }))
  const endings = (Array.isArray(doc.endings) ? (doc.endings as Record<string, unknown>[]) : []).map((e, i) => ({
    id: String(e.id ?? `e${i + 1}`), name: String(e.name ?? `Ending ${i + 1}`), kind: e.kind === 'redirect' ? 'redirect' : 'message', title: String(e.title ?? ''), body: String(e.body ?? ''),
    buttonLabel: String(e.btn ?? ''), buttonUrl: e.kind === 'redirect' ? '' : String(e.url ?? ''), redirectUrl: e.kind === 'redirect' ? String(e.url ?? '') : '', confetti: false, blocks: [],
  }))
  const migrateValue = (field: string, op: string, value: unknown): unknown => {
    const byLabel = optionIndex.get(field)
    const type = blockTypes.get(field)
    const isChoice = type === 'dropdown' || type === 'choice' || type === 'checks'
    if (!isChoice || !byLabel) return typeof value === 'string' && op === 'in' ? value.split(',').map(s => s.trim()).filter(Boolean) : value ?? null
    const labels = op === 'in' ? String(value ?? '').split(',').map(s => s.trim()).filter(Boolean) : [String(value ?? '').trim()]
    const ids = labels.map(l => byLabel.get(l) ?? hashId('o', `${field}:missing:${l}`))
    return op === 'in' ? ids : ids[0] ?? null
  }
  const migrateCond = (c: Record<string, unknown>, path: string): Record<string, unknown> => {
    if (Array.isArray(c.items)) {
      return { id: hashId('c', path), join: String(c.join ?? 'AND').toLowerCase() === 'or' ? 'or' : 'and', items: (c.items as Record<string, unknown>[]).map((x, i) => migrateCond(x, `${path}.${i}`)) }
    }
    const op = V1_OPS[String(c.op ?? 'is')] ?? 'eq'
    return { id: hashId('c', path), field: String(c.field ?? ''), op, value: migrateValue(String(c.field ?? ''), op, c.value) }
  }
  const rules = (Array.isArray(doc.rules) ? (doc.rules as Record<string, unknown>[]) : []).map((r, i) => {
    const when = migrateCond((r.when ?? { join: 'AND', items: [] }) as Record<string, unknown>, `${String(r.id ?? i)}.when`)
    const then = (r.then ?? {}) as Record<string, unknown>
    return { id: String(r.id ?? hashId('r', `rule:${i}`)), when, then: { type: V1_ACTIONS[String(then.action ?? 'show page')] ?? 'show_page', target: String(then.target ?? '') } }
  })
  const themeIn = (doc.theme ?? {}) as Record<string, unknown>
  const { preset: _p, ...rest } = themeIn
  return {
    schemaVersion: 2,
    title: String(doc.name ?? doc.title ?? 'Untitled form'),
    settings: { progress: 'bar', honeypot: true },
    pages, endings, rules,
    theme: { preset: typeof themeIn.preset === 'string' ? themeIn.preset : 'paper', ...rest },
  }
}

const STEPS: Record<number, Step> = { 1: v1ToV2 }

export function detectSchemaVersion(doc: unknown): number {
  if (!doc || typeof doc !== 'object') return 0
  const v = (doc as Record<string, unknown>).schemaVersion
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v
  // The prototype documents never carried a version.
  return 1
}

/** Walk a document up to the current schema. Throws when the version is ahead
 *  of what this build understands (a newer engine wrote it). */
export function migrateDefinition(input: unknown): MigrationResult {
  const from = detectSchemaVersion(input)
  if (from === 0) throw new Error('not a form definition')
  if (from > SCHEMA_VERSION) throw new Error(`form schema ${from} is newer than this build (${SCHEMA_VERSION})`)
  let doc = JSON.parse(JSON.stringify(input)) as Record<string, unknown>
  const steps: string[] = []
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = STEPS[v]
    if (!step) throw new Error(`no migration from schema ${v}`)
    doc = step(doc)
    doc.schemaVersion = v + 1
    steps.push(`${v}→${v + 1}`)
  }
  return { definition: doc, from, to: SCHEMA_VERSION, steps }
}
