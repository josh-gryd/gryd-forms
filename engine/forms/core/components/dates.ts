import { register, requiredMessage, str } from '../registry'
import type { Block } from '../schema'
import { isBlank, type DateRangeValue } from '../answers'
import { ERR } from '../errors'
import { isIsoDate, isIsoDateTime, isTime, todayIso, formatIsoDate, formatIsoDateTime } from '../dates'

interface DateSettings { min: string; max: string; allow: 'any' | 'future' | 'past' }
const dateSettings = (raw: Record<string, unknown>): DateSettings => ({
  min: isIsoDate(String(raw.min ?? '')) ? String(raw.min) : '',
  max: isIsoDate(String(raw.max ?? '')) ? String(raw.max) : '',
  allow: raw.allow === 'future' || raw.allow === 'past' ? raw.allow : 'any',
})

function dateBounds(block: Block, v: string, today: string): string | null {
  const s = dateSettings(block.settings)
  const day = v.slice(0, 10)
  if (s.allow === 'future' && day <= today) return ERR.futureOnly
  if (s.allow === 'past' && day >= today) return ERR.pastOnly
  if (s.min && day < s.min) return ERR.minDate(formatIsoDate(s.min))
  if (s.max && day > s.max) return ERR.maxDate(formatIsoDate(s.max))
  return null
}

const DATE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'] as const

register<DateSettings>({
  type: 'date', label: 'Date', icon: 'calendar', category: 'Date and time', keywords: 'day birthday when calendar', kind: 'input', hasDescription: true,
  defaults: () => ({ label: 'Date' }),
  settings: dateSettings,
  normalize: (_b, raw) => (typeof raw === 'string' ? raw.trim().slice(0, 10) : undefined),
  isEmpty: isBlank,
  validate: (b, v, ctx) => {
    if (isBlank(v)) return b.required ? requiredMessage(b) : null
    if (!isIsoDate(String(v))) return ERR.invalidDate
    return dateBounds(b, String(v), ctx.today ?? todayIso())
  },
  logic: { ops: [...DATE_OPS], valueKind: 'date' },
  logicValue: (_b, v) => (isBlank(v) ? null : String(v)),
  display: (_b, v) => (isBlank(v) ? '' : formatIsoDate(String(v))),
  input: { type: 'date' },
})

register<DateSettings>({
  type: 'datetime', label: 'Date and time', icon: 'calendar-clock', category: 'Date and time', keywords: 'appointment schedule when', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'Date and time' }),
  settings: dateSettings,
  normalize: (_b, raw) => (typeof raw === 'string' ? raw.trim().slice(0, 16) : undefined),
  isEmpty: isBlank,
  validate: (b, v, ctx) => {
    if (isBlank(v)) return b.required ? requiredMessage(b) : null
    if (!isIsoDateTime(String(v))) return ERR.invalidDate
    return dateBounds(b, String(v), ctx.today ?? todayIso())
  },
  logic: { ops: [...DATE_OPS], valueKind: 'date' },
  logicValue: (_b, v) => (isBlank(v) ? null : String(v)),
  display: (_b, v) => (isBlank(v) ? '' : formatIsoDateTime(String(v))),
  input: { type: 'datetime-local' },
})

register<Record<string, never>>({
  type: 'time', label: 'Time', icon: 'clock', category: 'Date and time', keywords: 'hour minute clock', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'Time' }),
  settings: () => ({}),
  normalize: (_b, raw) => (typeof raw === 'string' ? raw.trim().slice(0, 5) : undefined),
  isEmpty: isBlank,
  validate: (b, v) => {
    if (isBlank(v)) return b.required ? requiredMessage(b) : null
    return isTime(String(v)) ? null : ERR.invalidTime
  },
  logic: { ops: [...DATE_OPS], valueKind: 'text' },
  logicValue: (_b, v) => (isBlank(v) ? null : String(v)),
  display: (_b, v) => (isBlank(v) ? '' : String(v)),
  input: { type: 'time' },
})

register<DateSettings>({
  type: 'daterange', label: 'Date range', icon: 'calendar-range', category: 'Date and time', keywords: 'from to between period stay', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'Date range' }),
  settings: dateSettings,
  normalize: (_b, raw) => {
    if (raw === '' || raw === null || raw === undefined) return { start: '', end: '' }
    if (!raw || typeof raw !== 'object') return undefined
    const r = raw as Record<string, unknown>
    return { start: str(r.start, '', 10).trim(), end: str(r.end, '', 10).trim() }
  },
  isEmpty: v => isBlank(v),
  validate: (b, v, ctx) => {
    const r = (v && typeof v === 'object' ? v : { start: '', end: '' }) as DateRangeValue
    if (!r.start && !r.end) return b.required ? requiredMessage(b) : null
    if (!r.start || !r.end) return ERR.invalidDate
    if (!isIsoDate(r.start) || !isIsoDate(r.end)) return ERR.invalidDate
    if (r.end < r.start) return ERR.rangeOrder
    return dateBounds(b, r.start, ctx.today ?? todayIso()) ?? dateBounds(b, r.end, ctx.today ?? todayIso())
  },
  logic: { ops: ['empty', 'not_empty'], valueKind: 'none' },
  logicValue: (_b, v) => (isBlank(v) ? null : `${(v as DateRangeValue).start}/${(v as DateRangeValue).end}`),
  display: (_b, v) => (isBlank(v) ? '' : `${formatIsoDate((v as DateRangeValue).start)} – ${formatIsoDate((v as DateRangeValue).end)}`),
})
