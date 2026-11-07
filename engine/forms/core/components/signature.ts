// E-signature: the respondent draws a signature on a pad or types their name.
// A drawn signature is stored as strokes in one fixed coordinate space, so it
// reads back the same at any size (the Results sheet draws it as SVG). Only an
// object shaped like a signature normalises to one, so a logic rule's
// set_value (a plain string or number) can never sign for anyone.

import { register, requiredMessage, str } from '../registry'
import type { SignatureValue } from '../answers'
import { ERR } from '../errors'

/** The pad's coordinate space. The pad keeps this 5:2 shape at every width. */
export const SIGNATURE_W = 500
export const SIGNATURE_H = 200
const MAX_STROKES = 80
const MAX_POINTS = 5000
const MAX_NAME = 120
/** Less ink than this, in pad units, is a stray tap rather than a signature. */
export const MIN_INK = 60

export type SignatureMode = 'both' | 'type'
export interface SignatureSettings { mode: SignatureMode; agreement: string }
export const DEFAULT_AGREEMENT = 'I agree that my electronic signature is as valid as a handwritten one.'

export function signatureSettings(raw: Record<string, unknown>): SignatureSettings {
  return { mode: raw.mode === 'type' ? 'type' : 'both', agreement: str(raw.agreement, DEFAULT_AGREEMENT, 500) }
}

/** The value as a signature, or null when it is not one (or holds nothing). */
export function asSignature(v: unknown): SignatureValue | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const s = v as Partial<SignatureValue> & { strokes?: unknown; name?: unknown }
  if (s.kind === 'typed') return typeof s.name === 'string' && s.name.trim() ? { kind: 'typed', name: s.name } : null
  if (s.kind === 'drawn') return Array.isArray(s.strokes) && s.strokes.length > 0 ? { kind: 'drawn', strokes: s.strokes as number[][] } : null
  return null
}

/** Total length of every stroke, in pad units. */
export function inkLength(strokes: number[][]): number {
  let total = 0
  for (const s of strokes) for (let i = 2; i + 1 < s.length; i += 2) total += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1])
  return total
}

/** SVG path data for strokes in pad units, smoothed through midpoints. A
 *  single point becomes a dot (it needs round line caps to show). */
export function signaturePath(strokes: number[][]): string {
  const parts: string[] = []
  for (const s of strokes) {
    const n = Math.floor(s.length / 2)
    if (n === 0) continue
    if (n === 1) { parts.push(`M${s[0]} ${s[1]}h0.01`); continue }
    let d = `M${s[0]} ${s[1]}`
    for (let i = 1; i < n - 1; i++) {
      const x = s[i * 2], y = s[i * 2 + 1]
      d += `Q${x} ${y} ${(x + s[i * 2 + 2]) / 2} ${(y + s[i * 2 + 3]) / 2}`
    }
    d += `L${s[n * 2 - 2]} ${s[n * 2 - 1]}`
    parts.push(d)
  }
  return parts.join('')
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)))

register<SignatureSettings>({
  type: 'signature', label: 'E-signature', icon: 'signature', category: 'Media', keywords: 'esign e-sign sign signature autograph initials consent agreement contract', kind: 'input', secondary: true, hasDescription: true,
  defaults: () => ({ label: 'Signature', settings: { mode: 'both', agreement: DEFAULT_AGREEMENT } }),
  settings: signatureSettings,
  normalize: (_b, raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const r = raw as Record<string, unknown>
    if (r.kind === 'typed') {
      const name = str(r.name, '', 1000).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
      return name ? { kind: 'typed', name } : undefined
    }
    if (r.kind !== 'drawn' || !Array.isArray(r.strokes)) return undefined
    const strokes: number[][] = []
    let points = 0
    for (const s of r.strokes) {
      if (strokes.length >= MAX_STROKES || points >= MAX_POINTS) break
      if (!Array.isArray(s)) continue
      const out: number[] = []
      for (let i = 0; i + 1 < s.length && points < MAX_POINTS; i += 2) {
        const x = s[i], y = s[i + 1]
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
        out.push(clamp(x, SIGNATURE_W), clamp(y, SIGNATURE_H))
        points++
      }
      if (out.length) strokes.push(out)
    }
    return strokes.length ? { kind: 'drawn', strokes } : undefined
  },
  isEmpty: v => asSignature(v) === null,
  validate: (b, v) => {
    const s = asSignature(v)
    if (!s) return b.required ? requiredMessage(b) : null
    if (s.kind === 'typed') return s.name.trim().length < 2 ? ERR.signatureTypeName : null
    if (signatureSettings(b.settings).mode === 'type') return ERR.signatureTypeName
    return inkLength(s.strokes) < MIN_INK ? ERR.signatureTooShort : null
  },
  logic: { ops: ['empty', 'not_empty'], valueKind: 'none' },
  logicValue: (_b, v) => (asSignature(v) ? 'signed' : null),
  display: (_b, v) => {
    const s = asSignature(v)
    return !s ? '' : s.kind === 'typed' ? `Typed signature: ${s.name}` : 'Drawn signature'
  },
})
