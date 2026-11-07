import { register, requiredMessage, numOr, str } from '../registry'
import { isBlank } from '../answers'
import { ERR } from '../errors'

const NUM_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'] as const

interface ScaleSettings { min: number; max: number; minLabel: string; maxLabel: string }
register<ScaleSettings>({
  type: 'scale', label: 'Scale', icon: 'sliders', category: 'Rating', keywords: 'nps 1 to 10 opinion likert number', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'How likely are you to recommend us?', settings: { min: 1, max: 10 } }),
  settings: raw => {
    const min = Math.round(numOr(raw.min, 1) ?? 1), max = Math.round(numOr(raw.max, 10) ?? 10)
    const lo = Math.max(0, Math.min(min, max)), hi = Math.min(lo + 10, Math.max(min, max, lo + 1))
    return { min: lo, max: hi, minLabel: str(raw.minLabel, '', 60), maxLabel: str(raw.maxLabel, '', 60) }
  },
  normalize: (_b, raw) => { if (raw === '' || raw === null || raw === undefined) return ''; const n = Number(raw); return Number.isInteger(n) ? n : undefined },
  isEmpty: v => typeof v !== 'number',
  validate: (b, v) => {
    if (typeof v !== 'number') return b.required ? requiredMessage(b) : null
    const s = b.settings; const min = numOr(s.min, 1) ?? 1, max = numOr(s.max, 10) ?? 10
    return v >= min && v <= max ? null : ERR.invalidOption
  },
  logic: { ops: [...NUM_OPS], valueKind: 'number' },
  logicValue: (_b, v) => (typeof v === 'number' ? v : null),
  display: (_b, v) => (typeof v === 'number' ? String(v) : ''),
})

interface RatingSettings { max: number; icon: 'star' | 'heart' | 'thumb' }
register<RatingSettings>({
  type: 'rating', label: 'Rating', icon: 'star', category: 'Rating', keywords: 'stars score satisfaction', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'How would you rate this?', settings: { max: 5 } }),
  settings: raw => ({ max: Math.min(10, Math.max(3, Math.round(numOr(raw.max, 5) ?? 5))), icon: raw.icon === 'heart' || raw.icon === 'thumb' ? raw.icon : 'star' }),
  normalize: (_b, raw) => { if (raw === '' || raw === null || raw === undefined) return ''; const n = Number(raw); return Number.isInteger(n) ? n : undefined },
  isEmpty: v => typeof v !== 'number',
  validate: (b, v) => {
    if (typeof v !== 'number') return b.required ? requiredMessage(b) : null
    const max = numOr(b.settings.max, 5) ?? 5
    return v >= 1 && v <= max ? null : ERR.invalidOption
  },
  logic: { ops: [...NUM_OPS], valueKind: 'number' },
  logicValue: (_b, v) => (typeof v === 'number' ? v : null),
  display: (b, v) => (typeof v === 'number' ? `${v} of ${numOr(b.settings.max, 5) ?? 5}` : ''),
})
