// The component registry. Every field and content type registers ONE object
// that says what it is, what it stores, how it validates, how it takes part in
// logic and how its answer reads back as text. Nothing else in the codebase
// switches on a component type; add a type by adding a definition.

import type { Block, ChoiceOption, ComponentType, ConditionOp } from './schema'
import type { AnswerValue } from './answers'
import { activeLanguage, errorsFor } from './i18n'

export type Category = 'Text' | 'Choices' | 'Date and time' | 'Rating' | 'Media' | 'Display content' | 'Layout'

export type LogicValueKind = 'text' | 'number' | 'boolean' | 'option' | 'options' | 'date' | 'none'

export type Primitive = string | number | boolean

export interface FileStatus { status: 'pending' | 'uploaded' | 'failed' | 'missing'; size?: number; mime?: string; name?: string }

export interface ValidationContext {
  /** Server or client view of upload state. */
  fileStatus?: (fileId: string) => FileStatus
  /** Today, YYYY-MM-DD, injected so tests are deterministic. */
  today?: string
}

export interface ComponentDef<S = Record<string, unknown>> {
  type: ComponentType
  label: string
  icon: string
  category: Category
  keywords: string
  kind: 'input' | 'display' | 'layout'
  /** Secondary field types ship after the core is stable; still fully real. */
  secondary?: boolean
  hasOptions?: boolean
  hasPlaceholder?: boolean
  hasDescription?: boolean
  /** Library defaults for a fresh block of this type. */
  defaults: () => Partial<Block>
  /** Typed settings with defaults applied; unknown keys dropped. */
  settings: (raw: Record<string, unknown>) => S
  /** Coerce untrusted input into a stored value; undefined = not an answer. */
  normalize: (block: Block, raw: unknown) => AnswerValue | undefined
  isEmpty: (value: AnswerValue | undefined) => boolean
  /** Message per the handoff copy, or null when the answer is fine. */
  validate: (block: Block, value: AnswerValue | undefined, ctx: ValidationContext) => string | null
  logic: { ops: ConditionOp[]; valueKind: LogicValueKind }
  /** Comparable form for the logic engine. */
  logicValue: (block: Block, value: AnswerValue | undefined) => Primitive | Primitive[] | null
  /** Plain-text rendering with labels resolved (results, CSV, interpolation). */
  display: (block: Block, value: AnswerValue | undefined) => string
  /** Browser hints for the public renderer. */
  input?: { inputMode?: string; autoComplete?: string; type?: string }
}

const defs = new Map<ComponentType, ComponentDef<any>>()

export function register<S>(def: ComponentDef<S>): ComponentDef<S> {
  if (defs.has(def.type)) throw new Error(`component "${def.type}" registered twice`)
  defs.set(def.type, def)
  return def
}

export function componentDef(type: ComponentType): ComponentDef {
  const d = defs.get(type)
  if (!d) throw new Error(`unknown component type "${type}"`)
  return d
}

export function hasComponent(type: string): type is ComponentType {
  return defs.has(type as ComponentType)
}

export function allComponents(): ComponentDef[] {
  return [...defs.values()]
}

export function isInputBlock(block: Pick<Block, 'type'>): boolean {
  return componentDef(block.type).kind === 'input'
}

export function blockSettings<S = Record<string, unknown>>(block: Block): S {
  return componentDef(block.type).settings(block.settings ?? {}) as S
}

// ── Library ──────────────────────────────────────────────────────────────────

export const CATEGORY_ORDER: Category[] = ['Text', 'Choices', 'Date and time', 'Rating', 'Media', 'Display content', 'Layout']
export const FREQUENT: ComponentType[] = ['short', 'email', 'choice', 'long', 'dropdown', 'upload']

export interface LibraryPreset {
  key: string
  label: string
  type: ComponentType
  icon: string
  keywords: string
  block: Partial<Block>
}

/** Presets are ordinary field types with a prefilled label and autocomplete —
 *  not separate component systems. */
export const PRESETS: LibraryPreset[] = [
  { key: 'first_name', label: 'First name', type: 'short', icon: 'type', keywords: 'given name person', block: { label: 'First name', placeholder: 'Ada', settings: { autoComplete: 'given-name' } } },
  { key: 'last_name', label: 'Last name', type: 'short', icon: 'type', keywords: 'family surname person', block: { label: 'Last name', placeholder: 'Lovelace', settings: { autoComplete: 'family-name' } } },
  { key: 'company', label: 'Company name', type: 'short', icon: 'type', keywords: 'organisation organization business', block: { label: 'Company', placeholder: 'Company name', settings: { autoComplete: 'organization' } } },
]

export interface LibraryItem {
  key: string
  type: ComponentType
  label: string
  icon: string
  category: Category | 'Frequently used' | 'Presets'
  preset?: LibraryPreset
}

export interface LibraryGroup { category: string; items: LibraryItem[] }

function itemFor(def: ComponentDef, category: LibraryItem['category']): LibraryItem {
  return { key: def.type, type: def.type, label: def.label, icon: def.icon, category }
}

/** Grouped library, or a flat search result when there is a query. Matching is
 *  on label, keywords and category, the way the prototype did it. */
export function libraryItems(query: string, opts: { displayOnly?: boolean } = {}): { groups: LibraryGroup[]; flat: LibraryItem[] } {
  const q = query.trim().toLowerCase()
  const visible = allComponents().filter(d => d.type !== 'slot' && (!opts.displayOnly || d.kind !== 'input'))
  const presetItems: LibraryItem[] = opts.displayOnly ? [] : PRESETS.map(p => ({ key: `preset:${p.key}`, type: p.type, label: p.label, icon: p.icon, category: 'Presets', preset: p }))
  if (q) {
    const flat = [
      ...visible.filter(d => `${d.label} ${d.keywords} ${d.category}`.toLowerCase().includes(q)).map(d => itemFor(d, d.category)),
      ...presetItems.filter(p => `${p.label} ${p.preset!.keywords}`.toLowerCase().includes(q)),
    ]
    return { groups: [{ category: flat.length ? 'Results' : 'No fields match', items: flat }], flat }
  }
  const groups: LibraryGroup[] = []
  if (!opts.displayOnly) groups.push({ category: 'Frequently used', items: FREQUENT.map(t => itemFor(componentDef(t), 'Frequently used')) })
  for (const cat of CATEGORY_ORDER) {
    const items = visible.filter(d => d.category === cat).map(d => itemFor(d, cat))
    if (cat === 'Text' && presetItems.length) items.push(...presetItems)
    if (items.length) groups.push({ category: cat, items })
  }
  return { groups, flat: groups.flatMap(g => g.items) }
}

// ── Shared helpers for definitions ──────────────────────────────────────────

export function str(v: unknown, fallback = '', max = 5000): string {
  return typeof v === 'string' ? (v.length > max ? v.slice(0, max) : v) : fallback
}
export function numOr(v: unknown, fallback: number | null): number | null {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
export function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
export function optionLabel(block: Block, id: string): string {
  return block.options.find(o => o.id === id)?.label ?? ''
}
export function optionIds(block: Block): Set<string> {
  return new Set(block.options.map(o => o.id))
}
export function defaultOptions(labels: string[], make: (label: string) => ChoiceOption): ChoiceOption[] {
  return labels.map(make)
}

/** Required-answer copy from the handoff, keyed by type. A label is used the
 *  way the author wrote it: only an ordinary capitalised first word is
 *  lowered ("Company" → "Enter your company."), so "QA-TEST Name", "URL" or
 *  "McDonald's order" keep their capitals (QA 2026-09-24 P3: "qA-TEST Name").
 *  A label that is a question, or carries an answer token, gets the plain
 *  "This one needs an answer." rather than "Enter your what should…". */
export function requiredMessage(block: Block): string {
  const t = block.type
  const raw = block.label.trim()
  const lang = activeLanguage()
  const c = errorsFor(lang)
  if (c.requiredByType[t]) return c.requiredByType[t] as string
  // Only English builds the message from the label; other languages keep to plain copy.
  if (lang !== 'en' || !raw) return c.requiredGeneric
  if (raw.includes('{{') || /\?\s*$/.test(raw) || /^(what|which|who|whom|whose|when|where|why|how|do|does|did|is|are|was|were|can|could|would|will|should|have|has|may)\b/i.test(raw)) return c.requiredQuestion
  const label = raw.replace(/[?.:]+$/g, '').replace(/^your\s+/i, '').trim()
  if (!label) return c.requiredGeneric
  const first = label.split(/\s+/)[0]
  return `Enter your ${/^[A-Z][a-z'’-]*$/.test(first) ? first.charAt(0).toLowerCase() + label.slice(1) : label}.`
}
