// Stable identifiers for every form entity. Prefixed so a log line or a
// support ticket says what kind of thing an id names, random so nothing about
// a form, a response or a file can be guessed from a neighbour.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomChars(n: number): string {
  const bytes = new Uint8Array(n)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export type IdPrefix = 'frm' | 'ver' | 'rsp' | 'fil' | 'ast' | 'fld' | 'tpl' | 'b' | 'o' | 'p' | 'e' | 'r' | 'c' | 'row'

/** Short ids for entities inside a form document (blocks, options, pages…). */
export function shortId(prefix: IdPrefix): string {
  return `${prefix}_${randomChars(10)}`
}

/** Long ids for records that are addressed from outside (forms, responses, files). */
export function longId(prefix: IdPrefix): string {
  return `${prefix}_${randomChars(20)}`
}

/** A resume / upload token: 32 random chars, never stored in clear (hashed at rest). */
export function secretToken(): string {
  return randomChars(40)
}

export function isId(value: unknown, prefix?: IdPrefix): value is string {
  if (typeof value !== 'string') return false
  const m = /^([a-z]{1,4})_([0-9a-z]{6,40})$/.exec(value)
  if (!m) return false
  return prefix ? m[1] === prefix : true
}
