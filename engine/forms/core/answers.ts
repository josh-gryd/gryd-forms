// What an answer looks like once it is normalised. Every value is JSON and
// carries ids, never labels: a choice answer is the option id, a matrix answer
// maps row ids to option ids, an upload answer is a list of file ids with the
// metadata the respondent saw at pick time.

import type { PhoneValue } from './phone'

export interface FileAnswer { fileId: string; name: string; size: number; mime: string }
export interface DateRangeValue { start: string; end: string }
export interface AddressValue { line1: string; line2: string; city: string; state: string; postal: string; country: string }
export type MatrixValue = Record<string, string | string[]>
/** A drawn signature is strokes of x,y pairs in the pad's space; a typed one is the name. */
export type SignatureValue = { kind: 'drawn'; strokes: number[][] } | { kind: 'typed'; name: string }

export type AnswerValue =
  | string | number | boolean | string[]
  | PhoneValue | FileAnswer[] | DateRangeValue | AddressValue | MatrixValue | SignatureValue

export type AnswerMap = Record<string, AnswerValue>

export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'number') return Number.isNaN(v)
  if (typeof v === 'boolean') return false
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isBlank)
  return false
}
