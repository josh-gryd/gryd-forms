// The respondent side's one way to the engine: the dashboard's public proxy.
// The password token this tab holds rides every call as a header; the proxy
// turns it into the engine's own, next to the signed-in respondent it reads
// from the session itself.

import type { FormDefinition, Theme, FormLanguage } from '@/lib/forms-core/index'

export const PUBLIC_BASE = '/api/public/forms'

export class PublicError extends Error { constructor(public readonly status: number, message: string, public readonly body: Record<string, unknown> = {}) { super(message) } }

const unlockKey = (formId: string) => `gf-unlock:${formId}`
export function readUnlock(formId: string): string | null { try { return sessionStorage.getItem(unlockKey(formId)) } catch { return null } }
export function writeUnlock(formId: string, token: string | null): void { try { if (token) sessionStorage.setItem(unlockKey(formId), token); else sessionStorage.removeItem(unlockKey(formId)) } catch { /* private mode */ } }

/** One random id per browser, sent with answers so a form set to one response per device can tell. */
export function deviceId(): string | null {
  try {
    let id = localStorage.getItem('gf-device')
    if (!id) {
      const bytes = new Uint8Array(18); crypto.getRandomValues(bytes)
      id = Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 32)
      localStorage.setItem('gf-device', id)
    }
    return id
  } catch { return null }
}

/** This browser already sent a response to a one-per-device form (and maybe kept its edit link). */
export function readDone(formId: string): { editToken: string | null } | null { try { const raw = localStorage.getItem(`gf-done:${formId}`); return raw ? JSON.parse(raw) : null } catch { return null } }
export function writeDone(formId: string, editToken: string | null): void { try { localStorage.setItem(`gf-done:${formId}`, JSON.stringify({ editToken, at: Date.now() })) } catch { /* ignore */ } }

export async function publicCall<T>(formId: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  const unlock = formId ? readUnlock(formId) : null
  if (unlock) headers['x-form-unlock'] = unlock
  let res: Response
  try { res = await fetch(`${PUBLIC_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }) }
  catch (err) { throw new PublicError(0, (err as Error).message || 'network error') }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = {} }
  if (!res.ok) throw new PublicError(res.status, String(json.error ?? `HTTP ${res.status}`), json)
  return json as T
}

export type PublicFormRef = { id: string; slug: string; title: string }
export type LivePayload = { status: 'live'; form: PublicFormRef; version: { id: string; number: number }; definition: FormDefinition; respond: { duplicates: 'allow' | 'device' | 'email' | 'account'; respondent: string | null } }
type Look = { form: PublicFormRef; theme: Theme; language: FormLanguage }
export type PublicPayload =
  | LivePayload
  | (Look & { status: 'closed'; closedMessage: string; reason: 'manual' | 'date' | 'limit' })
  | (Look & { status: 'scheduled'; opensAt: string; timezone: string })
  | (Look & { status: 'locked' | 'signin' })
  | (Look & { status: 'responded'; canEdit: boolean })
  | { status: 'unavailable' }
