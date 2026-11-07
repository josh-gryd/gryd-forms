// Changing a field's type in place. The block keeps its id, label, description,
// required flag and width, so answers, rules and anything else that addresses
// it by id keep pointing at it. Published versions and past responses are
// never rewritten: a response is read with the version it was answered on
// (service.ts), and the Summary carries an older answer across with
// carryAnswer() below.

import { componentDef } from './registry'
import { makeOptions } from './components/choices'
import { cloneDefinition, isGroup, type Block, type ComponentType, type ConditionGroup, type ConditionOp, type FormDefinition } from './schema'
import type { AnswerValue } from './answers'

const TEXT_TYPES: ComponentType[] = ['short', 'long', 'email', 'phone', 'url', 'number']
const FREE_TEXT: ComponentType[] = ['short', 'long']
const CHOICE_TYPES: ComponentType[] = ['choice', 'checks', 'dropdown', 'picture']

/** The types a field can become without being deleted, in library order. */
export function conversionTargets(type: ComponentType): ComponentType[] {
  if (FREE_TEXT.includes(type)) return [...TEXT_TYPES, 'choice', 'checks', 'dropdown'].filter(t => t !== type) as ComponentType[]
  if (TEXT_TYPES.includes(type)) return TEXT_TYPES.filter(t => t !== type)
  if (CHOICE_TYPES.includes(type)) return [...CHOICE_TYPES, ...FREE_TEXT].filter(t => t !== type)
  return []
}

export function canConvert(from: ComponentType, to: ComponentType): boolean {
  return conversionTargets(from).includes(to)
}

/** What an answer of this block looks like when stored. */
type Shape = 'text' | 'number' | 'phone' | 'option' | 'options' | 'other'
function shapeOf(block: Pick<Block, 'type' | 'settings'>): Shape {
  switch (block.type) {
    case 'short': case 'long': case 'email': case 'url': return 'text'
    case 'number': return 'number'
    case 'phone': return 'phone'
    case 'choice': case 'dropdown': return 'option'
    case 'checks': return 'options'
    case 'picture': return block.settings?.multiple === true ? 'options' : 'option'
    default: return 'other'
  }
}
const isMulti = (b: Pick<Block, 'type' | 'settings'>) => shapeOf(b) === 'options'

// Settings that only change how the field looks, never what it accepts.
const COSMETIC = new Set(['rows'])
const SETTING_LABELS: Record<string, string> = {
  minLength: 'the character limits', maxLength: 'the character limits', autoComplete: 'the autofill hint',
  workOnly: 'the work-emails-only rule', httpsOnly: 'the https-only rule', defaultCountry: 'the default country',
  integer: 'the whole-numbers-only rule', layout: 'the pills layout', indicator: 'the fill-only pill style', other: 'the "Other" option',
}
function settingLabel(type: ComponentType, key: string): string {
  if ((key === 'min' || key === 'max') && type === 'number') return 'the minimum and maximum'
  if (key === 'min' || key === 'max') return 'the minimum and maximum selections'
  return SETTING_LABELS[key] ?? `the "${key}" setting`
}

export interface ConversionPlan {
  def: FormDefinition
  block: Block
  /** Plain sentences, one per thing the change drops. Empty = lossless. */
  losses: string[]
  /** Rule conditions rewritten to the new type's equivalent (is → includes…). */
  rulesAdjusted: number
}

const MULTI_OF: Partial<Record<ConditionOp, ConditionOp>> = { eq: 'contains', neq: 'not_contains' }
const SINGLE_OF: Partial<Record<ConditionOp, ConditionOp>> = { contains: 'eq', not_contains: 'neq' }

/** Change one field's type. Returns null when the field is missing or the
 *  conversion isn't offered. The input definition is never mutated. */
export function planConversion(def: FormDefinition, blockId: string, to: ComponentType): ConversionPlan | null {
  const next = cloneDefinition(def)
  let block: Block | undefined
  for (const c of [...next.pages, ...next.endings]) { block = c.blocks.find(b => b.id === blockId); if (block) break }
  if (!block || !canConvert(block.type, to)) return null
  const old: Block = JSON.parse(JSON.stringify(block))
  const fromDef = componentDef(old.type), toDef = componentDef(to)
  const toDefaults = toDef.defaults()
  const losses: string[] = []

  // Settings: keep every key the new type understands, report the meaningful rest.
  const kept = toDef.settings(old.settings)
  const oldDefaults = fromDef.settings({}) as Record<string, unknown>
  const settings: Record<string, unknown> = { ...(toDefaults.settings ?? {}) }
  const dropped = new Set<string>()
  for (const [k, v] of Object.entries(old.settings)) {
    if (k in (kept as Record<string, unknown>)) { settings[k] = v; continue }
    if (COSMETIC.has(k) || v === null || v === undefined || v === '' || v === false || JSON.stringify(v) === JSON.stringify(oldDefaults[k])) continue
    dropped.add(settingLabel(old.type, k))
  }
  if (to === 'picture') settings.multiple = isMulti(old)
  else delete settings.multiple
  for (const l of dropped) losses.push(`Drops ${l}.`)

  // Options: choice ↔ choice keeps them (ids and all); text ↔ choice can't.
  let options = old.options
  if (toDef.hasOptions && !fromDef.hasOptions) options = (toDefaults.options ?? makeOptions(['Option 1', 'Option 2', 'Option 3'])).map(o => ({ ...o }))
  else if (!toDef.hasOptions && old.options.length) {
    losses.push(`Removes its ${old.options.length} option${old.options.length === 1 ? '' : 's'} (${old.options.slice(0, 3).map(o => o.label || 'untitled').join(', ')}${old.options.length > 3 ? '…' : ''}).`)
    options = []
  } else if (to !== 'picture' && old.options.some(o => o.imageUrl)) {
    losses.push('Removes the option pictures.')
    options = old.options.map(({ imageUrl: _drop, ...o }) => o)
  }

  // A label or placeholder still at the old type's default follows the new type.
  const fromDefaults = fromDef.defaults()
  const label = old.label === (fromDefaults.label ?? fromDef.label) ? (toDefaults.label ?? toDef.label) : old.label
  const placeholder = old.placeholder === (fromDefaults.placeholder ?? '') ? (toDefaults.placeholder ?? '') : old.placeholder

  Object.assign(block, { type: to, label, placeholder, options, settings })

  if (old.type === 'email') losses.push('It stops counting as an email question: confirmation emails and the one-response-per-email check won’t use it.')

  // Rules that test this field: rewrite to the new type's equivalent where one exists.
  const ops = toDef.logic.ops
  const choiceOld = shapeOf(old) === 'option' || shapeOf(old) === 'options', choiceNew = shapeOf(block) === 'option' || shapeOf(block) === 'options'
  const sameFamily = choiceOld === choiceNew
  let adjusted = 0, broken = 0
  const visit = (g: ConditionGroup) => {
    for (const it of g.items) {
      if (isGroup(it)) { visit(it); continue }
      if (it.field !== blockId) continue
      const valueless = it.op === 'empty' || it.op === 'not_empty'
      if (ops.includes(it.op) && (valueless || sameFamily)) continue
      const mapped = (isMulti(block!) ? MULTI_OF : SINGLE_OF)[it.op]
      if (mapped && ops.includes(mapped) && choiceOld && choiceNew) { it.op = mapped; adjusted++; continue }
      broken++
    }
  }
  for (const r of next.rules) visit(r.when)
  const setValues = next.rules.filter(r => r.then.type === 'set_value' && r.then.target === blockId).length
  if (!sameFamily) broken += setValues
  if (broken) losses.push(`${broken} logic condition${broken === 1 ? '' : 's'} won’t work with ${toDef.label} and will show as broken in Logic until you fix ${broken === 1 ? 'it' : 'them'}.`)

  return { def: next, block, losses, rulesAdjusted: adjusted }
}

/** An answer given while the field was another type, as the field's current
 *  type would read it — or undefined when it can't be read that way. Used by
 *  the Summary, which groups every response under today's question. */
export function carryAnswer(from: Block, to: Block, value: AnswerValue | undefined): AnswerValue | undefined {
  if (value === undefined) return undefined
  const a = shapeOf(from), b = shapeOf(to)
  if (a === b && from.type === to.type) return value
  if (a === 'option' && b === 'options') return typeof value === 'string' && value ? [value] : undefined
  // Several picks stay several: the Summary tallies each one under today's single choice.
  if (a === 'options' && b === 'option') return Array.isArray(value) && value.length === 1 ? (value[0] as string) : value
  if (a === b && (a === 'option' || a === 'options')) return value
  if (a === b && a !== 'other') return value
  if (b === 'text') { const t = componentDef(from.type).display(from, value); return t === '' ? undefined : t }
  if (b === 'number') {
    const t = typeof value === 'number' ? value : Number(String(componentDef(from.type).display(from, value)).replace(/[,\s_]/g, ''))
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}
