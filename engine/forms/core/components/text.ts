import { register, requiredMessage, str, numOr, boolOr } from '../registry'
import type { Block } from '../schema'
import { isBlank } from '../answers'
import { ERR } from '../errors'
import { normalizePhone, phoneError, formatPhone, type PhoneValue } from '../phone'

const TEXT_OPS = ['eq', 'neq', 'contains', 'not_contains', 'empty', 'not_empty'] as const

interface TextSettings { minLength: number | null; maxLength: number | null; autoComplete: string; rows: number }

function textSettings(raw: Record<string, unknown>): TextSettings {
  const min = numOr(raw.minLength, null), max = numOr(raw.maxLength, null)
  return {
    minLength: min !== null && min > 0 ? Math.floor(min) : null,
    maxLength: max !== null && max > 0 ? Math.floor(max) : null,
    autoComplete: str(raw.autoComplete, '', 40),
    rows: Math.min(20, Math.max(2, Math.floor(numOr(raw.rows, 3) ?? 3))),
  }
}

function normalizeText(_block: Block, raw: unknown) {
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (typeof raw !== 'string') return undefined
  return raw.length > 20000 ? raw.slice(0, 20000) : raw
}

function validateText(block: Block, value: unknown): string | null {
  const s = textSettings(block.settings)
  if (isBlank(value)) return block.required ? requiredMessage(block) : null
  const v = String(value)
  if (s.minLength && v.trim().length < s.minLength) return ERR.minLength(s.minLength)
  if (s.maxLength && v.length > s.maxLength) return ERR.maxLength(s.maxLength)
  return null
}

const asText = (_b: Block, v: unknown) => (isBlank(v) ? null : String(v))
const showText = (_b: Block, v: unknown) => (isBlank(v) ? '' : String(v))

register<TextSettings>({
  type: 'short', label: 'Short answer', icon: 'type', category: 'Text', keywords: 'text single line name', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Short answer', placeholder: 'Your answer' }),
  settings: textSettings, normalize: normalizeText, isEmpty: isBlank, validate: validateText,
  logic: { ops: [...TEXT_OPS], valueKind: 'text' }, logicValue: asText, display: showText,
  input: { type: 'text' },
})

register<TextSettings>({
  type: 'long', label: 'Long answer', icon: 'align', category: 'Text', keywords: 'paragraph textarea multi', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Long answer', placeholder: 'Write as much as you like' }),
  settings: textSettings, normalize: normalizeText, isEmpty: isBlank, validate: validateText,
  logic: { ops: [...TEXT_OPS], valueKind: 'text' }, logicValue: asText, display: showText,
})

const FREE_MAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|pm|gmx|mail|yandex|zoho)\.(com|co\.uk|net|org|me|ch|de|fr|ca|io)$/i
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

interface EmailSettings { workOnly: boolean }
register<EmailSettings>({
  type: 'email', label: 'Email', icon: 'mail', category: 'Text', keywords: 'address contact', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Email', placeholder: 'name@company.com' }),
  settings: raw => ({ workOnly: boolOr(raw.workOnly, false) }),
  normalize: (_b, raw) => (typeof raw === 'string' ? raw.trim().slice(0, 320) : undefined),
  isEmpty: isBlank,
  validate: (block, value) => {
    if (isBlank(value)) return block.required ? requiredMessage(block) : null
    const v = String(value)
    if (!EMAIL_RE.test(v)) return ERR.invalidEmail
    if ((block.settings.workOnly === true) && FREE_MAIL.test(v)) return ERR.workEmail
    return null
  },
  logic: { ops: [...TEXT_OPS], valueKind: 'text' }, logicValue: asText, display: showText,
  input: { type: 'email', inputMode: 'email', autoComplete: 'email' },
})

interface PhoneSettings { defaultCountry: string }
register<PhoneSettings>({
  type: 'phone', label: 'Phone', icon: 'phone', category: 'Text', keywords: 'number mobile call telephone', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Phone', placeholder: '(555) 000-0000' }),
  settings: raw => ({ defaultCountry: /^[A-Za-z]{2}$/.test(String(raw.defaultCountry ?? '')) ? String(raw.defaultCountry).toUpperCase() : 'US' }),
  normalize: (block, raw) => {
    const country = String(block.settings.defaultCountry ?? 'US')
    if (typeof raw === 'string') return raw.trim() ? (normalizePhone(country, raw) ?? undefined) : ''
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>
      const c = typeof r.country === 'string' ? r.country : country
      const n = typeof r.national === 'string' ? r.national : typeof r.raw === 'string' ? r.raw : ''
      if (!n.trim()) return ''
      return normalizePhone(c, n) ?? undefined
    }
    return undefined
  },
  isEmpty: v => isBlank(v),
  validate: (block, value) => {
    if (isBlank(value)) return block.required ? requiredMessage(block) : null
    return phoneError(value as PhoneValue)
  },
  logic: { ops: ['eq', 'neq', 'contains', 'not_contains', 'empty', 'not_empty'], valueKind: 'text' },
  logicValue: (_b, v) => (isBlank(v) ? null : (v as PhoneValue).e164),
  display: (_b, v) => (isBlank(v) ? '' : formatPhone(v as PhoneValue)),
  input: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
})

interface NumberSettings { min: number | null; max: number | null; integer: boolean }
register<NumberSettings>({
  type: 'number', label: 'Number', icon: 'hash', category: 'Text', keywords: 'numeric amount quantity', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Number', placeholder: '0' }),
  settings: raw => ({ min: numOr(raw.min, null), max: numOr(raw.max, null), integer: boolOr(raw.integer, false) }),
  normalize: (_b, raw) => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
    if (typeof raw !== 'string') return undefined
    const t = raw.trim()
    if (t === '') return ''
    const cleaned = t.replace(/[,\s_]/g, '')
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return t
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : t
  },
  isEmpty: v => isBlank(v),
  validate: (block, value) => {
    if (isBlank(value)) return block.required ? requiredMessage(block) : null
    if (typeof value !== 'number') return ERR.invalidNumber
    const s = block.settings
    const min = numOr(s.min, null), max = numOr(s.max, null)
    if (s.integer === true && !Number.isInteger(value)) return ERR.integer
    if (min !== null && value < min) return ERR.minNumber(min)
    if (max !== null && value > max) return ERR.maxNumber(max)
    return null
  },
  logic: { ops: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'], valueKind: 'number' },
  logicValue: (_b, v) => (typeof v === 'number' ? v : null),
  display: (_b, v) => (typeof v === 'number' ? String(v) : isBlank(v) ? '' : String(v)),
  input: { type: 'text', inputMode: 'decimal' },
})

interface UrlSettings { httpsOnly: boolean }
export function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(t)) return `https://${t}`
  return t
}
export function isHttpUrl(v: string, httpsOnly = false): boolean {
  try {
    const u = new URL(v)
    if (httpsOnly) return u.protocol === 'https:'
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch { return false }
}
register<UrlSettings>({
  type: 'url', label: 'Website', icon: 'link', category: 'Text', keywords: 'url link web address', kind: 'input',
  hasPlaceholder: true, hasDescription: true,
  defaults: () => ({ label: 'Website', placeholder: 'https://' }),
  settings: raw => ({ httpsOnly: boolOr(raw.httpsOnly, false) }),
  normalize: (_b, raw) => (typeof raw === 'string' ? normalizeUrl(raw).slice(0, 2048) : undefined),
  isEmpty: isBlank,
  validate: (block, value) => {
    if (isBlank(value)) return block.required ? requiredMessage(block) : null
    return isHttpUrl(String(value), block.settings.httpsOnly === true) ? null : ERR.invalidUrl
  },
  logic: { ops: [...TEXT_OPS], valueKind: 'text' }, logicValue: asText, display: showText,
  input: { type: 'url', inputMode: 'url', autoComplete: 'url' },
})

interface HiddenSettings { paramName: string; defaultValue: string }
register<HiddenSettings>({
  type: 'hidden', label: 'Hidden field', icon: 'eye-off', category: 'Text', keywords: 'utm parameter query tracking source', kind: 'input',
  defaults: () => ({ label: 'Hidden field', settings: { paramName: 'source', defaultValue: '' } }),
  settings: raw => ({ paramName: str(raw.paramName, '', 60).replace(/[^A-Za-z0-9_\-]/g, ''), defaultValue: str(raw.defaultValue, '', 2000) }),
  normalize: (_b, raw) => (typeof raw === 'string' ? raw.slice(0, 2000) : raw === null || raw === undefined ? '' : undefined),
  isEmpty: isBlank,
  validate: () => null,
  logic: { ops: [...TEXT_OPS], valueKind: 'text' }, logicValue: asText, display: showText,
})
