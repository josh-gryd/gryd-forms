// The form document. One versioned JSON shape shared by the builder (draft),
// the immutable published versions, the public renderer and Results.
//
// Identity rules (never relax them):
//   - every page, block, option, ending, rule and condition carries a stable id
//   - nothing is ever addressed by array position or by its visible label
//   - a choice answer stores option ids, so renaming or reordering options
//     changes nothing about existing answers, rules or published versions

import { isFormLanguage, type FormLanguage } from './i18n'

export const SCHEMA_VERSION = 2

export type BlockWidth = 'full' | 'half' | 'third'

export type ComponentType =
  // inputs (MVP)
  | 'short' | 'long' | 'email' | 'phone' | 'number' | 'url' | 'date'
  | 'dropdown' | 'choice' | 'checks' | 'yesno' | 'upload' | 'hidden'
  // inputs (secondary)
  | 'datetime' | 'time' | 'daterange' | 'picture' | 'matrix' | 'scale' | 'rating' | 'ranking' | 'switch' | 'address' | 'signature'
  // display
  | 'heading' | 'paragraph' | 'banner' | 'divider' | 'image' | 'video' | 'button' | 'section'
  // layout placeholder (an empty column slot)
  | 'slot'

export interface ChoiceOption {
  id: string
  label: string
  /** Picture choice only. */
  imageUrl?: string
}

export interface MatrixRow { id: string; label: string }

export interface Block {
  id: string
  type: ComponentType
  /** Question label, heading text, paragraph text, button text… */
  label: string
  description: string
  required: boolean
  width: BlockWidth
  placeholder: string
  options: ChoiceOption[]
  /** Per-type configuration, validated by the component registry. */
  settings: Record<string, unknown>
}

export type PageKind = 'page' | 'cover'

export interface Page {
  id: string
  kind: PageKind
  name: string
  buttonLabel: string
  /** Optional named stage for stage-style progress. */
  stage: string
  blocks: Block[]
}

export type EndingKind = 'message' | 'redirect' | 'restart'

export interface Ending {
  id: string
  name: string
  kind: EndingKind
  title: string
  body: string
  buttonLabel: string
  buttonUrl: string
  redirectUrl: string
  confetti: boolean
  /** Display-only blocks rendered under the message. */
  blocks: Block[]
}

export type ConditionOp =
  | 'eq' | 'neq' | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'empty' | 'not_empty' | 'in' | 'not_in'
  | 'is_true' | 'is_false'

export type ConditionValue = string | number | boolean | string[] | null

export interface Condition {
  id: string
  field: string
  op: ConditionOp
  value: ConditionValue
}

export type Join = 'and' | 'or'

export interface ConditionGroup {
  id: string
  join: Join
  items: Array<Condition | ConditionGroup>
}

export type ActionType =
  | 'show_field' | 'hide_field' | 'show_section' | 'hide_section'
  | 'require_field' | 'optional_field'
  | 'show_page' | 'skip_page' | 'go_to_page' | 'go_to_ending' | 'set_value'

export interface RuleAction {
  type: ActionType
  /** Block id, page id or ending id depending on the action. */
  target: string
  /** set_value only. */
  value?: ConditionValue
}

export interface Rule {
  id: string
  when: ConditionGroup
  then: RuleAction
}

export type ThemeSpacing = 'compact' | 'comfortable' | 'airy'
export type ThemeContainer = 'card' | 'outline' | 'flat'
export type ThemeAlign = 'left' | 'center'
export type ThemeFont = 'Plus Jakarta Sans' | 'Syne' | 'Serif' | 'System'

export interface Theme {
  preset: string
  bg: string
  content: string
  text: string
  muted: string
  primary: string
  accent: string
  input: string
  line: string
  font: ThemeFont
  headFont: ThemeFont
  radius: number
  container: ThemeContainer
  width: number
  spacing: ThemeSpacing
  align: ThemeAlign
  logo: boolean
  logoUrl: string
  bgImage: boolean
  /** The line under the form; empty shows nothing. */
  footer: string
  /** The required star's colour. Absent: the star is the question's own colour. */
  star?: string
}

export type ProgressStyle = 'none' | 'bar' | 'pages' | 'stages'

export interface FormSettings {
  progress: ProgressStyle
  honeypot: boolean
  /** Respondents can step back a page. */
  backButton: boolean
  /** Answers are kept on the device and the server so a respondent can come back. */
  saveResume: boolean
  /** After submitting, a respondent gets a private link to change their answers. */
  allowEdits: boolean
  /** The language of the built-in copy: buttons, banners, validation messages (i18n.ts). */
  language: FormLanguage
  /** Shown in link previews. */
  description: string
}

export interface FormDefinition {
  schemaVersion: typeof SCHEMA_VERSION
  title: string
  settings: FormSettings
  pages: Page[]
  endings: Ending[]
  rules: Rule[]
  theme: Theme
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_THEME: Theme = {
  preset: 'paper', bg: '#f3ebcb', content: '#faf5e1', text: '#161616', muted: '#3f3d33', primary: '#8dc63f', accent: '#ffc72c',
  input: '#fffbea', line: '#161616', font: 'Plus Jakarta Sans', headFont: 'Syne', radius: 10, container: 'card', width: 680,
  spacing: 'comfortable', align: 'left', logo: true, logoUrl: '', bgImage: false, footer: 'Made with GRYD Forms',
}

export const DEFAULT_SETTINGS: FormSettings = {
  progress: 'bar',
  honeypot: true,
  backButton: true,
  saveResume: true,
  allowEdits: false,
  language: 'en',
  description: '',
}

export const DEFAULT_CLOSED_MESSAGE = 'This form is closed. Thanks for your interest.'

export function isCondition(item: Condition | ConditionGroup): item is Condition {
  return !('items' in item)
}

export function isGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'items' in item
}

// ── Validation ───────────────────────────────────────────────────────────────
// A persisted definition is untrusted input (it came over HTTP). parse() turns
// unknown JSON into a well-typed document or a list of reasons it can't be one.
// Unknown keys are dropped, missing optional fields get defaults, identity
// fields (ids, types, references) are strict.

export interface ValidationIssue { path: string; message: string }

export interface ParseResult {
  ok: boolean
  definition: FormDefinition | null
  issues: ValidationIssue[]
}

const WIDTHS: BlockWidth[] = ['full', 'half', 'third']
const OPS: ConditionOp[] = ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty', 'in', 'not_in', 'is_true', 'is_false']
const ACTIONS: ActionType[] = ['show_field', 'hide_field', 'show_section', 'hide_section', 'require_field', 'optional_field', 'show_page', 'skip_page', 'go_to_page', 'go_to_ending', 'set_value']
const ENDING_KINDS: EndingKind[] = ['message', 'redirect', 'restart']
const FONTS: ThemeFont[] = ['Plus Jakarta Sans', 'Syne', 'Serif', 'System']
const SPACINGS: ThemeSpacing[] = ['compact', 'comfortable', 'airy']
const CONTAINERS: ThemeContainer[] = ['card', 'outline', 'flat']
const PROGRESS: ProgressStyle[] = ['none', 'bar', 'pages', 'stages']

export const COMPONENT_TYPES: ComponentType[] = [
  'short', 'long', 'email', 'phone', 'number', 'url', 'date', 'dropdown', 'choice', 'checks', 'yesno', 'upload', 'hidden',
  'datetime', 'time', 'daterange', 'picture', 'matrix', 'scale', 'rating', 'ranking', 'switch', 'address', 'signature',
  'heading', 'paragraph', 'banner', 'divider', 'image', 'video', 'button', 'section', 'slot',
]

const MAX_TEXT = 5000
const MAX_LABEL = 2000

function str(v: unknown, fallback = '', max = MAX_TEXT): string {
  if (typeof v !== 'string') return fallback
  return v.length > max ? v.slice(0, max) : v
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  // A numeric string is a number that came through a form control ("18" from a
  // segmented choice). Dropping it for the default silently lost the author's
  // corner radius and form width (QA 2026-09-24 P2), so take it.
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function isIdLike(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_\-:.]{1,64}$/.test(v)
}

function conditionValue(v: unknown): ConditionValue {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.slice(0, MAX_LABEL)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, MAX_LABEL)).slice(0, 500)
  return null
}

function parseOption(raw: unknown, path: string, issues: ValidationIssue[]): ChoiceOption | null {
  if (!isRecord(raw)) { issues.push({ path, message: 'option must be an object' }); return null }
  if (!isIdLike(raw.id)) { issues.push({ path: `${path}.id`, message: 'option id is required' }); return null }
  const out: ChoiceOption = { id: raw.id, label: str(raw.label, '', MAX_LABEL) }
  if (typeof raw.imageUrl === 'string' && raw.imageUrl) out.imageUrl = raw.imageUrl.slice(0, 2048)
  return out
}

function parseSettings(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {}
  // Settings are validated per type by the registry (normalizeSettings); here
  // we only guarantee the container is a plain object of JSON-safe values.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
    out[k] = v
  }
  return out
}

function parseBlock(raw: unknown, path: string, issues: ValidationIssue[], displayOnly: boolean): Block | null {
  if (!isRecord(raw)) { issues.push({ path, message: 'block must be an object' }); return null }
  if (!isIdLike(raw.id)) { issues.push({ path: `${path}.id`, message: 'block id is required' }); return null }
  const type = raw.type
  if (typeof type !== 'string' || !COMPONENT_TYPES.includes(type as ComponentType)) {
    issues.push({ path: `${path}.type`, message: `unknown component type "${String(type)}"` })
    return null
  }
  if (displayOnly && !DISPLAY_TYPES.has(type as ComponentType)) {
    issues.push({ path: `${path}.type`, message: `"${type}" is not allowed here (display content only)` })
    return null
  }
  const options: ChoiceOption[] = []
  if (Array.isArray(raw.options)) {
    const seen = new Set<string>()
    raw.options.forEach((o, i) => {
      const opt = parseOption(o, `${path}.options[${i}]`, issues)
      if (!opt) return
      if (seen.has(opt.id)) { issues.push({ path: `${path}.options[${i}].id`, message: `duplicate option id "${opt.id}"` }); return }
      seen.add(opt.id)
      options.push(opt)
    })
  }
  return {
    id: raw.id,
    type: type as ComponentType,
    label: str(raw.label, '', MAX_LABEL),
    description: str(raw.description, ''),
    required: bool(raw.required, false),
    width: oneOf(raw.width, WIDTHS, 'full'),
    placeholder: str(raw.placeholder, '', 500),
    options,
    settings: parseSettings(raw.settings),
  }
}

export const DISPLAY_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>(['heading', 'paragraph', 'banner', 'divider', 'image', 'video', 'button', 'section', 'slot'])

function parseCondition(raw: unknown, path: string, issues: ValidationIssue[], depth: number): Condition | ConditionGroup | null {
  if (!isRecord(raw)) { issues.push({ path, message: 'condition must be an object' }); return null }
  if (Array.isArray(raw.items)) {
    if (depth >= 2) { issues.push({ path, message: 'groups may only nest two levels deep' }); return null }
    const items: Array<Condition | ConditionGroup> = []
    raw.items.forEach((it, i) => { const c = parseCondition(it, `${path}.items[${i}]`, issues, depth + 1); if (c) items.push(c) })
    return { id: isIdLike(raw.id) ? raw.id : `g_${path.replace(/[^A-Za-z0-9]+/g, '_')}`, join: oneOf(raw.join, ['and', 'or'] as const, 'and'), items }
  }
  if (!isIdLike(raw.field)) { issues.push({ path: `${path}.field`, message: 'condition needs a field id' }); return null }
  return {
    id: isIdLike(raw.id) ? raw.id : `c_${path.replace(/[^A-Za-z0-9]+/g, '_')}`,
    field: raw.field,
    op: oneOf(raw.op, OPS, 'eq'),
    value: conditionValue(raw.value),
  }
}

export function parseTheme(raw: unknown): Theme {
  const r = isRecord(raw) ? raw : {}
  const color = (v: unknown, fb: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fb)
  return {
    preset: str(r.preset, 'custom', 40),
    bg: color(r.bg, DEFAULT_THEME.bg), content: color(r.content, DEFAULT_THEME.content), text: color(r.text, DEFAULT_THEME.text),
    muted: color(r.muted, DEFAULT_THEME.muted), primary: color(r.primary, DEFAULT_THEME.primary), accent: color(r.accent, DEFAULT_THEME.accent),
    input: color(r.input, DEFAULT_THEME.input), line: color(r.line, DEFAULT_THEME.line),
    font: oneOf(r.font, FONTS, DEFAULT_THEME.font), headFont: oneOf(r.headFont, FONTS, DEFAULT_THEME.headFont),
    radius: Math.round(num(r.radius, DEFAULT_THEME.radius, 0, 32)), container: oneOf(r.container, CONTAINERS, 'card'),
    width: Math.round(num(r.width, DEFAULT_THEME.width, 320, 1200)), spacing: oneOf(r.spacing, SPACINGS, 'comfortable'),
    align: oneOf(r.align, ['left', 'center'] as const, 'left'), logo: bool(r.logo, true), logoUrl: str(r.logoUrl, '', 2048), bgImage: bool(r.bgImage, false),
    footer: str(r.footer, DEFAULT_THEME.footer, 120),
    // Only when set, so every theme saved before it existed hashes exactly as before.
    ...(typeof r.star === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.star) ? { star: r.star.toLowerCase() } : {}),
  }
}

/** Parse untrusted JSON into a FormDefinition at the CURRENT schema version.
 *  Older versions must be migrated first (see migrations.ts). */
export function parseDefinition(input: unknown): ParseResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(input)) return { ok: false, definition: null, issues: [{ path: '', message: 'definition must be an object' }] }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, definition: null, issues: [{ path: 'schemaVersion', message: `expected schemaVersion ${SCHEMA_VERSION}, got ${String(input.schemaVersion)}` }] }
  }
  const ids = new Set<string>()
  const claim = (id: string, path: string) => {
    if (ids.has(id)) { issues.push({ path, message: `duplicate id "${id}"` }); return false }
    ids.add(id); return true
  }

  const pages: Page[] = []
  if (!Array.isArray(input.pages) || input.pages.length === 0) issues.push({ path: 'pages', message: 'a form needs at least one page' })
  else input.pages.forEach((p, i) => {
    const path = `pages[${i}]`
    if (!isRecord(p) || !isIdLike(p.id)) { issues.push({ path, message: 'page needs an id' }); return }
    if (!claim(p.id, `${path}.id`)) return
    const kind = oneOf(p.kind, ['page', 'cover'] as const, 'page')
    if (kind === 'cover' && i !== 0) issues.push({ path, message: 'the cover page must be first' })
    const blocks: Block[] = []
    if (Array.isArray(p.blocks)) p.blocks.forEach((b, j) => {
      const blk = parseBlock(b, `${path}.blocks[${j}]`, issues, kind === 'cover')
      if (blk && claim(blk.id, `${path}.blocks[${j}].id`)) blocks.push(blk)
    })
    pages.push({ id: p.id, kind, name: str(p.name, `Page ${i + 1}`, 200), buttonLabel: str(p.buttonLabel, '', 100), stage: str(p.stage, '', 100), blocks })
  })

  const endings: Ending[] = []
  if (!Array.isArray(input.endings) || input.endings.length === 0) issues.push({ path: 'endings', message: 'a form needs at least one ending' })
  else input.endings.forEach((e, i) => {
    const path = `endings[${i}]`
    if (!isRecord(e) || !isIdLike(e.id)) { issues.push({ path, message: 'ending needs an id' }); return }
    if (!claim(e.id, `${path}.id`)) return
    const blocks: Block[] = []
    if (Array.isArray(e.blocks)) e.blocks.forEach((b, j) => {
      const blk = parseBlock(b, `${path}.blocks[${j}]`, issues, true)
      if (blk && claim(blk.id, `${path}.blocks[${j}].id`)) blocks.push(blk)
    })
    endings.push({
      id: e.id, name: str(e.name, `Ending ${i + 1}`, 200), kind: oneOf(e.kind, ENDING_KINDS, 'message'),
      title: str(e.title, '', MAX_LABEL), body: str(e.body, ''), buttonLabel: str(e.buttonLabel, '', 200), buttonUrl: str(e.buttonUrl, '', 2048),
      redirectUrl: str(e.redirectUrl, '', 2048), confetti: bool(e.confetti, false), blocks,
    })
  })

  const rules: Rule[] = []
  if (Array.isArray(input.rules)) input.rules.forEach((r, i) => {
    const path = `rules[${i}]`
    if (!isRecord(r) || !isIdLike(r.id)) { issues.push({ path, message: 'rule needs an id' }); return }
    if (!claim(r.id, `${path}.id`)) return
    const when = parseCondition(r.when, `${path}.when`, issues, 0)
    const group: ConditionGroup = when && isGroup(when) ? when : { id: `g_${r.id}`, join: 'and', items: when ? [when] : [] }
    const thenRaw = isRecord(r.then) ? r.then : {}
    const type = oneOf(thenRaw.type, ACTIONS, 'show_page')
    if (!isIdLike(thenRaw.target)) { issues.push({ path: `${path}.then.target`, message: 'rule needs a target' }); return }
    const then: RuleAction = { type, target: thenRaw.target }
    if (type === 'set_value') then.value = conditionValue(thenRaw.value)
    rules.push({ id: r.id, when: group, then })
  })

  const s = isRecord(input.settings) ? input.settings : {}
  const settings: FormSettings = {
    progress: oneOf(s.progress, PROGRESS, DEFAULT_SETTINGS.progress),
    honeypot: bool(s.honeypot, DEFAULT_SETTINGS.honeypot),
    backButton: bool(s.backButton, DEFAULT_SETTINGS.backButton),
    saveResume: bool(s.saveResume, DEFAULT_SETTINGS.saveResume),
    allowEdits: bool(s.allowEdits, DEFAULT_SETTINGS.allowEdits),
    language: isFormLanguage(s.language) ? s.language : DEFAULT_SETTINGS.language,
    description: str(s.description, '', 500),
  }

  const definition: FormDefinition = {
    schemaVersion: SCHEMA_VERSION,
    title: str(input.title, 'Untitled form', 300),
    settings, pages, endings, rules, theme: parseTheme(input.theme),
  }
  return { ok: issues.length === 0, definition: pages.length && endings.length ? definition : null, issues }
}

// ── Helpers every layer uses ─────────────────────────────────────────────────

export function allBlocks(def: FormDefinition): Block[] {
  const out: Block[] = []
  for (const p of def.pages) out.push(...p.blocks)
  for (const e of def.endings) out.push(...e.blocks)
  return out
}

export function findBlock(def: FormDefinition, id: string): { page: Page; index: number; block: Block } | null {
  for (const page of def.pages) {
    const index = page.blocks.findIndex(b => b.id === id)
    if (index >= 0) return { page, index, block: page.blocks[index] }
  }
  return null
}

export function findPage(def: FormDefinition, id: string): Page | undefined {
  return def.pages.find(p => p.id === id)
}

export function findEnding(def: FormDefinition, id: string): Ending | undefined {
  return def.endings.find(e => e.id === id)
}

/** Pages a respondent can answer (the cover is never an answer page). */
export function answerPages(def: FormDefinition): Page[] {
  return def.pages.filter(p => p.kind === 'page')
}

export function cloneDefinition<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Stable, order-independent hash of a definition — used to tell "changes not
 *  published" from "live matches the draft" without comparing whole documents
 *  on every render. FNV-1a over canonical JSON. */
export function definitionHash(def: FormDefinition): string {
  const json = canonicalJson(def)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0') + json.length.toString(36)
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
}
