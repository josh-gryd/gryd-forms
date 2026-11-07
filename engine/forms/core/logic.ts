// The logic engine. Pure functions over a definition and an answer map; no
// React, no DB. The renderer, the builder's preview and the server all call
// the same code so a rule can't mean two different things in two places.

import { withLanguage } from './i18n'
import { componentDef, isInputBlock, type Primitive } from './registry'
import { allBlocks, answerPages, findBlock, isGroup, type Block, type Condition, type ConditionGroup, type ConditionOp, type ConditionValue, type FormDefinition, type Page, type Rule } from './schema'
import { sectionMembers } from './layout'
import type { AnswerMap, AnswerValue } from './answers'

// ── Conditions ───────────────────────────────────────────────────────────────

function toList(v: Primitive | Primitive[] | null): Primitive[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}
function valueList(v: ConditionValue): Primitive[] {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v
  return [v]
}
function num(v: Primitive | undefined): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}
function text(v: Primitive | undefined): string {
  return v === undefined || v === null ? '' : String(v)
}

export function compare(op: ConditionOp, actual: Primitive | Primitive[] | null, expected: ConditionValue, kind: 'text' | 'number' | 'boolean' | 'option' | 'options' | 'date' | 'none'): boolean {
  const list = toList(actual)
  const empty = list.length === 0 || (list.length === 1 && text(list[0]) === '')
  switch (op) {
    case 'empty': return empty
    case 'not_empty': return !empty
    case 'is_true': return list[0] === true
    case 'is_false': return list[0] === false
    default: break
  }
  if (empty) return op === 'neq' || op === 'not_contains' || op === 'not_in' ? true : false
  const want = valueList(expected)
  const first = list[0]
  switch (op) {
    case 'eq':
      if (kind === 'number' || kind === 'date' && typeof first === 'number') return num(first) !== null && want.some(w => num(w) === num(first))
      if (kind === 'options') return list.length === want.length && want.every(w => list.includes(w))
      return want.some(w => text(w) === text(first))
    case 'neq':
      if (kind === 'number') return !want.some(w => num(w) === num(first))
      if (kind === 'options') return !(list.length === want.length && want.every(w => list.includes(w)))
      return !want.some(w => text(w) === text(first))
    case 'contains':
      if (kind === 'options' || kind === 'option') return want.some(w => list.includes(w))
      return want.some(w => text(first).toLowerCase().includes(text(w).toLowerCase()))
    case 'not_contains':
      if (kind === 'options' || kind === 'option') return !want.some(w => list.includes(w))
      return !want.some(w => text(first).toLowerCase().includes(text(w).toLowerCase()))
    case 'in': return list.some(a => want.some(w => w === a || text(w) === text(a)))
    case 'not_in': return !list.some(a => want.some(w => w === a || text(w) === text(a)))
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (kind === 'date' || (typeof first === 'string' && typeof want[0] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first))) {
        const a = text(first), b = text(want[0])
        if (!a || !b) return false
        return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b
      }
      const a = num(first), b = num(want[0])
      if (a === null || b === null) return false
      return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b
    }
    default: return false
  }
}

export function evaluateCondition(c: Condition, def: FormDefinition, answers: AnswerMap, blocks?: Map<string, Block>): boolean {
  const map = blocks ?? blockMap(def)
  const block = map.get(c.field)
  if (!block) return false
  const d = componentDef(block.type)
  return compare(c.op, d.logicValue(block, answers[c.field]), c.value, d.logic.valueKind)
}

export function evaluateGroup(g: ConditionGroup, def: FormDefinition, answers: AnswerMap, blocks?: Map<string, Block>): boolean {
  if (g.items.length === 0) return false
  const map = blocks ?? blockMap(def)
  const results = g.items.map(it => (isGroup(it) ? evaluateGroup(it, def, answers, map) : evaluateCondition(it, def, answers, map)))
  return g.join === 'or' ? results.some(Boolean) : results.every(Boolean)
}

export function blockMap(def: FormDefinition): Map<string, Block> {
  return new Map(allBlocks(def).map(b => [b.id, b]))
}

// ── Rule effects ─────────────────────────────────────────────────────────────

export interface LogicState {
  /** Rules that currently pass, in definition order. */
  passing: Set<string>
  hiddenBlocks: Set<string>
  requiredOverrides: Map<string, boolean>
  hiddenPages: Set<string>
  /** page id → target page id for a passing "jump to" rule. */
  jumps: Map<string, string>
  setValues: Map<string, ConditionValue>
  endingId: string
  endingRuleId: string | null
}

function pageOfBlock(def: FormDefinition, blockId: string): Page | null {
  return findBlock(def, blockId)?.page ?? null
}

/** The page a "jump" rule fires from: the LAST page any of its condition fields sits on. */
export function sourcePageOf(def: FormDefinition, rule: Rule): Page | null {
  const pages = def.pages
  let best: Page | null = null
  const visit = (g: ConditionGroup) => {
    for (const it of g.items) {
      if (isGroup(it)) visit(it)
      else {
        const p = pageOfBlock(def, it.field)
        if (p && (!best || pages.indexOf(p) > pages.indexOf(best))) best = p
      }
    }
  }
  visit(rule.when)
  return best
}

export function defaultEnding(def: FormDefinition): string {
  const targeted = new Set(def.rules.filter(r => r.then.type === 'go_to_ending').map(r => r.then.target))
  return (def.endings.find(e => !targeted.has(e.id)) ?? def.endings[0])?.id ?? ''
}

function evaluateOnce(def: FormDefinition, answers: AnswerMap, blocks: Map<string, Block>): LogicState {
  const state: LogicState = { passing: new Set(), hiddenBlocks: new Set(), requiredOverrides: new Map(), hiddenPages: new Set(), jumps: new Map(), setValues: new Map(), endingId: '', endingRuleId: null }
  const showFieldTargets = new Map<string, boolean>()  // target → any passing show rule
  const showPageTargets = new Map<string, boolean>()
  const showSectionTargets = new Map<string, boolean>()
  for (const rule of def.rules) {
    const pass = evaluateGroup(rule.when, def, answers, blocks)
    if (pass) state.passing.add(rule.id)
    const { type, target } = rule.then
    switch (type) {
      case 'show_field': showFieldTargets.set(target, (showFieldTargets.get(target) ?? false) || pass); break
      case 'hide_field': if (pass) state.hiddenBlocks.add(target); break
      case 'show_section': showSectionTargets.set(target, (showSectionTargets.get(target) ?? false) || pass); break
      case 'hide_section': if (pass) for (const id of sectionIds(def, target)) state.hiddenBlocks.add(id); break
      case 'require_field': if (pass && !state.requiredOverrides.has(target)) state.requiredOverrides.set(target, true); break
      case 'optional_field': if (pass && !state.requiredOverrides.has(target)) state.requiredOverrides.set(target, false); break
      case 'show_page': showPageTargets.set(target, (showPageTargets.get(target) ?? false) || pass); break
      case 'skip_page': if (pass) state.hiddenPages.add(target); break
      case 'go_to_page': if (pass) { const src = sourcePageOf(def, rule); if (src && !state.jumps.has(src.id)) state.jumps.set(src.id, target) } break
      case 'go_to_ending': if (pass && !state.endingRuleId && def.endings.some(e => e.id === target)) { state.endingId = target; state.endingRuleId = rule.id } break
      case 'set_value': if (pass && !state.setValues.has(target)) state.setValues.set(target, rule.then.value ?? null); break
    }
  }
  for (const [id, shown] of showFieldTargets) if (!shown) state.hiddenBlocks.add(id)
  for (const [id, shown] of showSectionTargets) if (!shown) for (const m of sectionIds(def, id)) state.hiddenBlocks.add(m)
  for (const [id, shown] of showPageTargets) if (!shown) state.hiddenPages.add(id)
  if (!state.endingId) state.endingId = defaultEnding(def)
  return state
}

function sectionIds(def: FormDefinition, sectionId: string): string[] {
  const found = findBlock(def, sectionId)
  if (!found) return []
  return [sectionId, ...sectionMembers(found.page, sectionId)]
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/** Evaluate every rule against the ACTIVE answers. Hidden fields (and fields
 *  on hidden pages) don't get a vote: their answers are removed and the rules
 *  re-run until nothing else changes, so a stale answer behind a hidden
 *  question can never route someone. Deterministic — rules run in order. */
export function evaluate(def: FormDefinition, answers: AnswerMap): LogicState {
  const blocks = blockMap(def)
  let active = answers
  let state = evaluateOnce(def, active, blocks)
  for (let i = 0; i < 6; i++) {
    const next = stripInactive(def, active, state)
    const nextState = evaluateOnce(def, next, blocks)
    const same = setsEqual(nextState.hiddenBlocks, state.hiddenBlocks) && setsEqual(nextState.hiddenPages, state.hiddenPages)
    active = next
    state = nextState
    if (same) break
  }
  return state
}

/** Answers minus anything hidden by logic or on a hidden page. */
export function stripInactive(def: FormDefinition, answers: AnswerMap, state: LogicState): AnswerMap {
  const out: AnswerMap = {}
  for (const page of def.pages) {
    if (state.hiddenPages.has(page.id)) continue
    for (const b of page.blocks) {
      if (state.hiddenBlocks.has(b.id)) continue
      if (answers[b.id] !== undefined) out[b.id] = answers[b.id]
    }
  }
  return out
}

/** The canonical active answer map for a set of raw answers. */
export function activeAnswers(def: FormDefinition, answers: AnswerMap): AnswerMap {
  return stripInactive(def, answers, evaluate(def, answers))
}

export function isBlockRequired(block: Block, state: LogicState): boolean {
  const o = state.requiredOverrides.get(block.id)
  return o === undefined ? block.required : o
}

export function visiblePages(def: FormDefinition, state: LogicState): Page[] {
  return answerPages(def).filter(p => !state.hiddenPages.has(p.id))
}

export function visibleBlocks(page: Page, state: LogicState): Block[] {
  return page.blocks.filter(b => !state.hiddenBlocks.has(b.id))
}

/** Where Continue goes from `currentId`, or null when the form submits. */
export function nextPageId(def: FormDefinition, state: LogicState, currentId: string): string | null {
  const pages = visiblePages(def, state)
  const idx = pages.findIndex(p => p.id === currentId)
  const jump = state.jumps.get(currentId)
  if (jump) {
    const j = pages.findIndex(p => p.id === jump)
    if (j > idx) return pages[j].id
  }
  return idx >= 0 && idx < pages.length - 1 ? pages[idx + 1].id : null
}

/** The pages a respondent walks with these answers: the visible pages in
 *  order, honouring jumps. The server validates every page on it at submit,
 *  and so does the runner, so neither preview nor a resumed session can reach
 *  an ending past a required question it skipped. */
export function pagePath(def: FormDefinition, state: LogicState): Page[] {
  const visible = visiblePages(def, state)
  if (!visible.length) return []
  const out: Page[] = []
  let cur: string | null = visible[0].id
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const page = visible.find(p => p.id === cur)
    if (!page) break
    out.push(page)
    cur = nextPageId(def, state, cur)
  }
  return out
}

/** Apply "set value" rules to answers that are still empty. */
export function applySetValues(def: FormDefinition, answers: AnswerMap, state: LogicState): AnswerMap {
  if (state.setValues.size === 0) return answers
  const blocks = blockMap(def)
  const out = { ...answers }
  for (const [id, value] of state.setValues) {
    const block = blocks.get(id)
    if (!block) continue
    const d = componentDef(block.type)
    if (!d.isEmpty(out[id])) continue
    const normalized = d.normalize(block, value as unknown)
    if (normalized !== undefined) out[id] = normalized
  }
  return out
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface PageErrors { [blockId: string]: string }

export function validatePage(def: FormDefinition, page: Page, answers: AnswerMap, state: LogicState, ctx: import('./registry').ValidationContext = {}): PageErrors {
  // Messages come in the form's language, server and browser alike.
  return withLanguage(def.settings.language, () => {
    const errors: PageErrors = {}
    for (const block of visibleBlocks(page, state)) {
      if (!isInputBlock(block)) continue
      const effective: Block = isBlockRequired(block, state) === block.required ? block : { ...block, required: isBlockRequired(block, state) }
      const msg = componentDef(block.type).validate(effective, answers[block.id], ctx)
      if (msg) errors[block.id] = msg
    }
    return errors
  })
}

/** Normalise every submitted value through its component; unknown ids and
 *  unparseable values are dropped rather than stored. */
export function normalizeAnswers(def: FormDefinition, raw: Record<string, unknown>): AnswerMap {
  const out: AnswerMap = {}
  const blocks = blockMap(def)
  for (const [id, value] of Object.entries(raw ?? {})) {
    const block = blocks.get(id)
    if (!block || !isInputBlock(block)) continue
    const v = componentDef(block.type).normalize(block, value)
    if (v !== undefined) out[id] = v as AnswerValue
  }
  return out
}

// ── Reference safety ─────────────────────────────────────────────────────────

export interface LogicIssue { ruleId: string; conditionId?: string; kind: 'missing_field' | 'missing_target' | 'bad_operator' | 'missing_option' | 'backward_jump' | 'empty_rule' | 'self_target'; message: string }

export function checkRules(def: FormDefinition): LogicIssue[] {
  const issues: LogicIssue[] = []
  const blocks = blockMap(def)
  const pageIds = new Set(def.pages.map(p => p.id))
  const endingIds = new Set(def.endings.map(e => e.id))
  const visit = (rule: Rule, g: ConditionGroup) => {
    for (const it of g.items) {
      if (isGroup(it)) { visit(rule, it); continue }
      const block = blocks.get(it.field)
      if (!block) { issues.push({ ruleId: rule.id, conditionId: it.id, kind: 'missing_field', message: 'Field deleted' }); continue }
      const d = componentDef(block.type)
      if (!d.logic.ops.includes(it.op)) issues.push({ ruleId: rule.id, conditionId: it.id, kind: 'bad_operator', message: `"${opLabel(it.op)}" doesn't apply to ${d.label}` })
      if ((d.logic.valueKind === 'option' || d.logic.valueKind === 'options') && !['empty', 'not_empty'].includes(it.op)) {
        const ids = new Set(block.options.map(o => o.id))
        const wanted = Array.isArray(it.value) ? it.value : it.value === null ? [] : [String(it.value)]
        if (wanted.length === 0) issues.push({ ruleId: rule.id, conditionId: it.id, kind: 'missing_option', message: 'Choose at least one option' })
        else if (wanted.some(v => !ids.has(String(v)))) issues.push({ ruleId: rule.id, conditionId: it.id, kind: 'missing_option', message: 'Option deleted' })
      }
    }
  }
  for (const rule of def.rules) {
    if (rule.when.items.length === 0) issues.push({ ruleId: rule.id, kind: 'empty_rule', message: 'Rule has no condition' })
    visit(rule, rule.when)
    const { type, target } = rule.then
    const isPageAction = type === 'show_page' || type === 'skip_page' || type === 'go_to_page'
    const isBlockAction = type === 'show_field' || type === 'hide_field' || type === 'require_field' || type === 'optional_field' || type === 'set_value' || type === 'show_section' || type === 'hide_section'
    if (isPageAction && !pageIds.has(target)) issues.push({ ruleId: rule.id, kind: 'missing_target', message: 'Page deleted' })
    else if (type === 'go_to_ending' && !endingIds.has(target)) issues.push({ ruleId: rule.id, kind: 'missing_target', message: 'Ending deleted' })
    else if (isBlockAction && !blocks.has(target)) issues.push({ ruleId: rule.id, kind: 'missing_target', message: 'Field deleted' })
    if (type === 'go_to_page' && pageIds.has(target)) {
      const src = sourcePageOf(def, rule)
      const from = src ? def.pages.indexOf(src) : -1
      const to = def.pages.findIndex(p => p.id === target)
      if (src && to <= from) issues.push({ ruleId: rule.id, kind: 'backward_jump', message: to === from ? 'A page can’t jump to itself' : 'Jumps only go forward — a backward jump would loop' })
    }
    if (isBlockAction && blocks.has(target)) {
      const usesTarget = conditionFields(rule.when).includes(target)
      if (usesTarget && (type === 'hide_field' || type === 'show_field')) issues.push({ ruleId: rule.id, kind: 'self_target', message: 'A field can’t hide itself' })
    }
  }
  return issues
}

export function conditionFields(g: ConditionGroup): string[] {
  const out: string[] = []
  for (const it of g.items) { if (isGroup(it)) out.push(...conditionFields(it)); else out.push(it.field) }
  return out
}

export function rulesUsingBlock(def: FormDefinition, blockId: string): Rule[] {
  return def.rules.filter(r => conditionFields(r.when).includes(blockId) || r.then.target === blockId)
}
export function rulesTargeting(def: FormDefinition, id: string): Rule[] {
  return def.rules.filter(r => r.then.target === id)
}
export function isConditionalPage(def: FormDefinition, pageId: string): boolean {
  return def.rules.some(r => (r.then.type === 'show_page' || r.then.type === 'skip_page' || r.then.type === 'go_to_page') && r.then.target === pageId)
}

// ── English ──────────────────────────────────────────────────────────────────

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'is', neq: 'is not', contains: 'contains', not_contains: 'does not contain', gt: 'is greater than', gte: 'is at least',
  lt: 'is less than', lte: 'is at most', empty: 'is empty', not_empty: 'is not empty', in: 'is any of', not_in: 'is none of', is_true: 'is yes', is_false: 'is no',
}
export const ACTION_LABELS: Record<Rule['then']['type'], string> = {
  show_field: 'show', hide_field: 'hide', show_section: 'show section', hide_section: 'hide section', require_field: 'require', optional_field: 'make optional',
  show_page: 'show page', skip_page: 'skip page', go_to_page: 'jump to', go_to_ending: 'end with', set_value: 'set',
}
export function opLabel(op: ConditionOp): string { return OP_LABELS[op] }

export function describeValue(def: FormDefinition, c: Condition): string {
  const block = blockMap(def).get(c.field)
  if (!block) return String(c.value ?? '')
  const d = componentDef(block.type)
  if (c.op === 'empty' || c.op === 'not_empty' || c.op === 'is_true' || c.op === 'is_false') return ''
  const vals = Array.isArray(c.value) ? c.value : c.value === null ? [] : [c.value]
  if (d.logic.valueKind === 'option' || d.logic.valueKind === 'options') {
    return vals.map(v => block.options.find(o => o.id === String(v))?.label ?? '(deleted option)').join(', ')
  }
  if (d.logic.valueKind === 'boolean') return vals[0] === true ? 'yes' : 'no'
  return vals.map(v => String(v)).join(', ')
}

export function fieldName(def: FormDefinition, id: string): string {
  const b = blockMap(def).get(id)
  return b ? (b.label || componentDef(b.type).label) : 'a deleted field'
}
export function targetName(def: FormDefinition, id: string): string {
  const p = def.pages.find(x => x.id === id); if (p) return p.name
  const e = def.endings.find(x => x.id === id); if (e) return e.name
  const b = blockMap(def).get(id); if (b) return b.label || componentDef(b.type).label
  return 'something that was deleted'
}

export function conditionText(def: FormDefinition, c: Condition | ConditionGroup): string {
  if (isGroup(c)) return '(' + c.items.map(x => conditionText(def, x)).join(c.join === 'or' ? ' or ' : ' and ') + ')'
  const v = describeValue(def, c)
  return `${fieldName(def, c.field)} ${opLabel(c.op)}${v ? ' ' + v : ''}`
}

/** "When Company size is any of 51–200, 201–1,000, show page Enterprise questions." */
export function ruleSentence(def: FormDefinition, rule: Rule): string {
  const when = rule.when.items.map(c => conditionText(def, c)).join(rule.when.join === 'or' ? ' or ' : ' and ')
  const { type, target } = rule.then
  const t = targetName(def, target)
  const then = type === 'set_value' ? `set ${t} to ${String(rule.then.value ?? '')}` : `${ACTION_LABELS[type]} ${t}`
  return `When ${when || '…'}, ${then}.`
}

/** Short label for flow edges ("Company size is any of 51–200…"). */
export function shortCondition(def: FormDefinition, rule: Rule): string {
  const first = rule.when.items[0]
  if (!first) return ''
  if (isGroup(first)) return fieldName(def, conditionFields(first)[0] ?? '') + '…'
  const s = conditionText(def, first)
  return s.length > 34 ? s.slice(0, 33) + '…' : s
}
