import { register, requiredMessage, str, boolOr } from '../registry'
import { isBlank, type AddressValue } from '../answers'
import { ERR } from '../errors'

interface AddressSettings { showLine2: boolean; showCountry: boolean }
register<AddressSettings>({
  type: 'address', label: 'Address', icon: 'map-pin', category: 'Text', keywords: 'street city postcode zip location', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'Address' }),
  settings: raw => ({ showLine2: boolOr(raw.showLine2, true), showCountry: boolOr(raw.showCountry, true) }),
  normalize: (_b, raw) => {
    if (raw === '' || raw === null || raw === undefined) return { line1: '', line2: '', city: '', state: '', postal: '', country: '' }
    if (!raw || typeof raw !== 'object') return undefined
    const r = raw as Record<string, unknown>
    return { line1: str(r.line1, '', 300), line2: str(r.line2, '', 300), city: str(r.city, '', 120), state: str(r.state, '', 120), postal: str(r.postal, '', 40), country: str(r.country, '', 120) }
  },
  isEmpty: v => isBlank(v),
  validate: (b, v) => {
    const a = (v && typeof v === 'object' ? v : {}) as AddressValue
    if (isBlank(a)) return b.required ? requiredMessage(b) : null
    if (b.required && (!a.line1?.trim() || !a.city?.trim())) return ERR.addressIncomplete
    return null
  },
  logic: { ops: ['contains', 'not_contains', 'empty', 'not_empty'], valueKind: 'text' },
  logicValue: (_b, v) => (isBlank(v) ? null : Object.values((v ?? {}) as AddressValue).filter(Boolean).join(', ')),
  display: (_b, v) => (isBlank(v) ? '' : [(v as AddressValue).line1, (v as AddressValue).line2, (v as AddressValue).city, (v as AddressValue).state, (v as AddressValue).postal, (v as AddressValue).country].filter(s => s && s.trim()).join(', ')),
  input: { autoComplete: 'street-address' },
})
