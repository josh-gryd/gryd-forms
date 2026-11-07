import { register, requiredMessage, numOr, boolOr, optionLabel, optionIds, str } from '../registry'
import type { Block, MatrixRow } from '../schema'
import { isBlank, type MatrixValue } from '../answers'
import { ERR } from '../errors'
import { shortId } from '../ids'

const SINGLE_OPS = ['eq', 'neq', 'in', 'not_in', 'empty', 'not_empty'] as const
const MULTI_OPS = ['contains', 'not_contains', 'in', 'not_in', 'empty', 'not_empty'] as const

export function makeOptions(labels: string[]) {
  return labels.map(label => ({ id: shortId('o'), label }))
}

function singleNormalize(block: Block, raw: unknown) {
  if (raw === '' || raw === null || raw === undefined) return ''
  if (typeof raw !== 'string') return undefined
  return raw.slice(0, 64)
}
function singleValidate(block: Block, value: unknown): string | null {
  if (isBlank(value)) return block.required ? requiredMessage(block) : null
  return optionIds(block).has(String(value)) ? null : ERR.invalidOption
}
const singleLogic = (_b: Block, v: unknown) => (isBlank(v) ? null : String(v))
const singleDisplay = (b: Block, v: unknown) => (isBlank(v) ? '' : optionLabel(b, String(v)))

function multiNormalize(block: Block, raw: unknown) {
  if (raw === '' || raw === null || raw === undefined) return []
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null
  if (!arr) return undefined
  const ids = optionIds(block)
  const chosen = new Set(arr.filter((x): x is string => typeof x === 'string'))
  // Stored in option order, so two answers with the same selection are equal.
  return block.options.filter(o => chosen.has(o.id)).map(o => o.id).concat([...chosen].filter(id => !ids.has(id)).slice(0, 50))
}
function multiValidate(block: Block, value: unknown, minKey = 'min', maxKey = 'max'): string | null {
  const arr = Array.isArray(value) ? (value as string[]) : []
  if (arr.length === 0) return block.required ? requiredMessage(block) : null
  const ids = optionIds(block)
  if (arr.some(id => !ids.has(id))) return ERR.invalidOption
  const min = numOr(block.settings[minKey], null), max = numOr(block.settings[maxKey], null)
  if (min !== null && min > 0 && arr.length < min) return ERR.minSelections(min)
  if (max !== null && max > 0 && arr.length > max) return ERR.maxSelections(max)
  return null
}
const multiLogic = (_b: Block, v: unknown) => (Array.isArray(v) ? (v as string[]) : [])
const multiDisplay = (b: Block, v: unknown) => (Array.isArray(v) ? (v as string[]).map(id => optionLabel(b, id)).filter(Boolean).join(', ') : '')

/** layout 'inline' is drawn as pills; indicator 'fill' hides the pill's dot or box and shows a pick by fill alone. */
export type ChoiceIndicator = 'mark' | 'fill'
const indicatorOf = (v: unknown): ChoiceIndicator => (v === 'fill' ? 'fill' : 'mark')
interface ChoiceSettings { layout: 'list' | 'inline'; other: boolean; indicator: ChoiceIndicator }
const choiceSettings = (raw: Record<string, unknown>): ChoiceSettings => ({ layout: raw.layout === 'inline' ? 'inline' : 'list', other: boolOr(raw.other, false), indicator: indicatorOf(raw.indicator) })

register<ChoiceSettings>({
  type: 'dropdown', label: 'Dropdown', icon: 'chevrons', category: 'Choices', keywords: 'select list menu', kind: 'input', hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Dropdown', options: makeOptions(['Option 1', 'Option 2', 'Option 3']) }),
  settings: choiceSettings, normalize: singleNormalize, isEmpty: isBlank, validate: singleValidate,
  logic: { ops: [...SINGLE_OPS], valueKind: 'option' }, logicValue: singleLogic, display: singleDisplay,
})

register<ChoiceSettings>({
  type: 'choice', label: 'Multiple choice', icon: 'circle-dot', category: 'Choices', keywords: 'radio single select one', kind: 'input', hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Multiple choice', options: makeOptions(['Option 1', 'Option 2', 'Option 3']) }),
  settings: choiceSettings, normalize: singleNormalize, isEmpty: isBlank, validate: singleValidate,
  logic: { ops: [...SINGLE_OPS], valueKind: 'option' }, logicValue: singleLogic, display: singleDisplay,
})

interface ChecksSettings { min: number | null; max: number | null; layout: 'list' | 'inline'; indicator: ChoiceIndicator }
register<ChecksSettings>({
  type: 'checks', label: 'Checkboxes', icon: 'check-square', category: 'Choices', keywords: 'multi select many checkbox group', kind: 'input', hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Checkboxes', options: makeOptions(['Option 1', 'Option 2', 'Option 3']) }),
  settings: raw => ({ min: numOr(raw.min, null), max: numOr(raw.max, null), layout: raw.layout === 'inline' ? 'inline' : 'list', indicator: indicatorOf(raw.indicator) }),
  normalize: multiNormalize, isEmpty: v => !Array.isArray(v) || v.length === 0, validate: (b, v) => multiValidate(b, v),
  logic: { ops: [...MULTI_OPS], valueKind: 'options' }, logicValue: multiLogic, display: multiDisplay,
})

interface YesNoSettings { yesLabel: string; noLabel: string }
function normalizeBool(_b: Block, raw: unknown) {
  if (raw === '' || raw === null || raw === undefined) return ''
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 'Yes' || raw === 'yes' || raw === 1 || raw === '1') return true
  if (raw === 'false' || raw === 'No' || raw === 'no' || raw === 0 || raw === '0') return false
  return undefined
}
register<YesNoSettings>({
  type: 'yesno', label: 'Yes / No', icon: 'toggle', category: 'Choices', keywords: 'boolean consent', kind: 'input', hasDescription: true,
  defaults: () => ({ label: 'Yes / No' }),
  settings: raw => ({ yesLabel: str(raw.yesLabel, 'Yes', 60) || 'Yes', noLabel: str(raw.noLabel, 'No', 60) || 'No' }),
  normalize: normalizeBool, isEmpty: v => typeof v !== 'boolean',
  validate: (block, value) => (typeof value === 'boolean' ? null : block.required ? requiredMessage(block) : null),
  logic: { ops: ['is_true', 'is_false', 'empty', 'not_empty'], valueKind: 'boolean' },
  logicValue: (_b, v) => (typeof v === 'boolean' ? v : null),
  display: (b, v) => (typeof v === 'boolean' ? (v ? String(b.settings.yesLabel || 'Yes') : String(b.settings.noLabel || 'No')) : ''),
})

interface SwitchSettings { onLabel: string }
register<SwitchSettings>({
  type: 'switch', label: 'Switch', icon: 'toggle', category: 'Choices', keywords: 'toggle opt-in agree consent', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'I agree' }),
  settings: raw => ({ onLabel: str(raw.onLabel, '', 100) }),
  normalize: (b, raw) => { const v = normalizeBool(b, raw); return v === '' ? false : v },
  isEmpty: v => v !== true,
  validate: (block, value) => (block.required && value !== true ? requiredMessage(block) : null),
  logic: { ops: ['is_true', 'is_false'], valueKind: 'boolean' },
  logicValue: (_b, v) => (typeof v === 'boolean' ? v : false),
  display: (_b, v) => (v === true ? 'On' : 'Off'),
})

interface PictureSettings { multiple: boolean; min: number | null; max: number | null }
register<PictureSettings>({
  type: 'picture', label: 'Picture choice', icon: 'image', category: 'Choices', keywords: 'image cards visual', kind: 'input', secondary: true, hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Picture choice', options: makeOptions(['Option 1', 'Option 2']) }),
  settings: raw => ({ multiple: boolOr(raw.multiple, false), min: numOr(raw.min, null), max: numOr(raw.max, null) }),
  normalize: (b, raw) => (b.settings.multiple === true ? multiNormalize(b, raw) : singleNormalize(b, raw)),
  isEmpty: isBlank,
  validate: (b, v) => (b.settings.multiple === true ? multiValidate(b, v) : singleValidate(b, v)),
  logic: { ops: ['eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'empty', 'not_empty'], valueKind: 'option' },
  logicValue: (b, v) => (b.settings.multiple === true ? multiLogic(b, v) : singleLogic(b, v)),
  display: (b, v) => (b.settings.multiple === true ? multiDisplay(b, v) : singleDisplay(b, v)),
})

register<Record<string, never>>({
  type: 'ranking', label: 'Ranking', icon: 'list-ordered', category: 'Choices', keywords: 'order rank sort priority', kind: 'input', secondary: true, hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Rank these', options: makeOptions(['Option 1', 'Option 2', 'Option 3']) }),
  settings: () => ({}),
  normalize: (b, raw) => {
    if (raw === '' || raw === null || raw === undefined) return []
    if (!Array.isArray(raw)) return undefined
    const ids = optionIds(b); const seen = new Set<string>()
    return raw.filter((x): x is string => typeof x === 'string' && ids.has(x) && !seen.has(x) && (seen.add(x), true))
  },
  isEmpty: v => !Array.isArray(v) || v.length === 0,
  validate: (b, v) => {
    const arr = Array.isArray(v) ? (v as string[]) : []
    if (arr.length === 0) return b.required ? requiredMessage(b) : null
    return arr.length === b.options.length ? null : requiredMessage(b)
  },
  logic: { ops: ['empty', 'not_empty'], valueKind: 'options' },
  logicValue: multiLogic,
  display: (b, v) => (Array.isArray(v) ? (v as string[]).map((id, i) => `${i + 1}. ${optionLabel(b, id)}`).join(', ') : ''),
})

interface MatrixSettings { rows: MatrixRow[]; multiple: boolean }
register<MatrixSettings>({
  type: 'matrix', label: 'Choice matrix', icon: 'table', category: 'Choices', keywords: 'grid table rows columns likert', kind: 'input', secondary: true, hasOptions: true, hasDescription: true,
  defaults: () => ({ label: 'Choice matrix', options: makeOptions(['Poor', 'OK', 'Great']), settings: { rows: [{ id: shortId('row'), label: 'Row 1' }, { id: shortId('row'), label: 'Row 2' }], multiple: false } }),
  settings: raw => ({
    rows: Array.isArray(raw.rows) ? raw.rows.filter((r): r is MatrixRow => !!r && typeof r === 'object' && typeof (r as MatrixRow).id === 'string').map(r => ({ id: r.id, label: str(r.label, '', 300) })) : [],
    multiple: boolOr(raw.multiple, false),
  }),
  normalize: (b, raw) => {
    if (raw === '' || raw === null || raw === undefined) return {}
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const ids = optionIds(b); const rows = new Set(((b.settings.rows as MatrixRow[]) ?? []).map(r => r.id))
    const out: MatrixValue = {}
    for (const [rowId, val] of Object.entries(raw as Record<string, unknown>)) {
      if (!rows.has(rowId)) continue
      if (b.settings.multiple === true) { if (Array.isArray(val)) out[rowId] = val.filter((x): x is string => typeof x === 'string' && ids.has(x)) }
      else if (typeof val === 'string' && ids.has(val)) out[rowId] = val
    }
    return out
  },
  isEmpty: v => !v || typeof v !== 'object' || Object.values(v as MatrixValue).every(isBlank),
  validate: (b, v) => {
    const val = (v && typeof v === 'object' ? v : {}) as MatrixValue
    const rows = (b.settings.rows as MatrixRow[]) ?? []
    const answered = rows.filter(r => !isBlank(val[r.id])).length
    if (answered === 0) return b.required ? requiredMessage(b) : null
    if (b.required && answered < rows.length) return ERR.minSelections(rows.length).replace('Choose', 'Answer').replace(/\.$/, ' rows.')
    return null
  },
  logic: { ops: ['empty', 'not_empty'], valueKind: 'none' },
  logicValue: (b, v) => (isBlank(v) ? null : Object.values((v ?? {}) as MatrixValue).flat()),
  display: (b, v) => {
    const val = (v && typeof v === 'object' ? v : {}) as MatrixValue
    const rows = (b.settings.rows as MatrixRow[]) ?? []
    return rows.filter(r => !isBlank(val[r.id])).map(r => `${r.label}: ${([] as string[]).concat(val[r.id]).map(id => optionLabel(b, id)).join(', ')}`).join('; ')
  },
})
