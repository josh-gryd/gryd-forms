// The builder's state: one reducer, one document, a snapshot history for
// undo/redo, and a save pipeline that never says "Saved" until the server
// has the revision. Pure TypeScript — no React here — so the concurrency
// and recovery rules can be tested without a browser.

import { cloneDefinition, definitionHash, type FormDefinition } from '@/lib/forms-core/index'

export const HISTORY_LIMIT = 40
export const TYPING_COALESCE_MS = 1000

export interface BuilderDoc {
  def: FormDefinition
  /** The server revision this document was loaded from / last saved as. */
  revision: number
  /** Hash of the definition as the server last acknowledged it. */
  savedHash: string
}

export interface HistoryState { past: FormDefinition[]; future: FormDefinition[]; lastTypingAt: number }

export function initialHistory(): HistoryState { return { past: [], future: [], lastTypingAt: 0 } }

/** Push `before` onto the undo stack. Typing pushes at most once per pause. */
export function pushHistory(h: HistoryState, before: FormDefinition, typing: boolean, now = Date.now()): HistoryState {
  if (typing && now - h.lastTypingAt < TYPING_COALESCE_MS && h.past.length) return { ...h, lastTypingAt: now, future: [] }
  const past = [...h.past, before].slice(-HISTORY_LIMIT)
  return { past, future: [], lastTypingAt: typing ? now : 0 }
}

export function undo(h: HistoryState, current: FormDefinition): { history: HistoryState; def: FormDefinition } | null {
  const before = h.past[h.past.length - 1]
  if (!before) return null
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, HISTORY_LIMIT), lastTypingAt: 0 }, def: before }
}

export function redo(h: HistoryState, current: FormDefinition): { history: HistoryState; def: FormDefinition } | null {
  const next = h.future[0]
  if (!next) return null
  return { history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: h.future.slice(1), lastTypingAt: 0 }, def: next }
}

export function isDirty(doc: BuilderDoc): boolean {
  return definitionHash(doc.def) !== doc.savedHash
}

// ── Local recovery ───────────────────────────────────────────────────────────
// Unsaved edits are mirrored to localStorage so a refresh mid-save, a closed
// tab or an outage does not lose work. The mirror carries the revision the
// edits were based on, which is what decides whether they can be restored.

export interface LocalDraft { formId: string; baseRevision: number; def: FormDefinition; at: number }

export const localKey = (formId: string) => `forms:draft:${formId}`

export function readLocalDraft(storage: Pick<Storage, 'getItem'>, formId: string): LocalDraft | null {
  try {
    const raw = storage.getItem(localKey(formId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalDraft
    if (!parsed || parsed.formId !== formId || typeof parsed.baseRevision !== 'number' || !parsed.def) return null
    return parsed
  } catch { return null }
}

export function writeLocalDraft(storage: Pick<Storage, 'setItem'>, draft: LocalDraft): void {
  try { storage.setItem(localKey(draft.formId), JSON.stringify(draft)) } catch { /* quota or private mode: recovery is best effort */ }
}

export function clearLocalDraft(storage: Pick<Storage, 'removeItem'>, formId: string): void {
  try { storage.removeItem(localKey(formId)) } catch { /* ignore */ }
}

export type RecoveryDecision =
  | { kind: 'none' }
  | { kind: 'restore'; def: FormDefinition }          // local edits based on the current server revision → apply and save
  | { kind: 'conflict'; local: FormDefinition; localAt: number } // server moved on since the local edits → ask

/** What to do with a local mirror on load. */
export function decideRecovery(local: LocalDraft | null, server: { revision: number; def: FormDefinition }): RecoveryDecision {
  if (!local) return { kind: 'none' }
  if (definitionHash(local.def) === definitionHash(server.def)) return { kind: 'none' }
  if (local.baseRevision === server.revision) return { kind: 'restore', def: local.def }
  if (local.baseRevision < server.revision) return { kind: 'conflict', local: local.def, localAt: local.at }
  return { kind: 'none' }
}

// ── Save scheduling ──────────────────────────────────────────────────────────

export const SAVE_DEBOUNCE_MS = 700
export const RETRY_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000]

export function retryDelay(attempt: number): number {
  return RETRY_SCHEDULE_MS[Math.min(attempt, RETRY_SCHEDULE_MS.length - 1)]
}

export type SaveOutcome =
  | { kind: 'saved'; revision: number }
  | { kind: 'conflict'; revision: number; def: FormDefinition; updatedBy: string | null; updatedAt: string }
  | { kind: 'failed'; message: string; offline: boolean }

export interface SaveTransport { (def: FormDefinition, baseRevision: number): Promise<SaveOutcome> }

/**
 * Serialises saves: at most one in flight, the latest document always wins,
 * failures retry with backoff, and a conflict stops the loop until the caller
 * resolves it. Callers observe state through `onState`.
 */
export class SaveLoop {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private pending: FormDefinition | null = null
  private attempt = 0
  private stopped = false
  private conflictHalt = false
  revision: number
  state: 'idle' | 'saving' | 'saved' | 'error' | 'offline' = 'idle'
  savedHash: string

  constructor(private readonly transport: SaveTransport, doc: BuilderDoc, private readonly onState: (loop: SaveLoop) => void, private readonly onConflict: (c: Extract<SaveOutcome, { kind: 'conflict' }>) => void, private readonly now: () => number = Date.now) {
    this.revision = doc.revision
    this.savedHash = doc.savedHash
  }

  /** A document changed: debounce, then save the newest one. */
  schedule(def: FormDefinition, delay = SAVE_DEBOUNCE_MS): void {
    if (this.stopped || this.conflictHalt) { this.pending = def; return }
    this.pending = def
    if (this.state !== 'saving') this.setState('saving')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, delay)
  }

  /** Save now (used before publish and on page hide). */
  async flush(): Promise<void> {
    if (this.inFlight) return
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    const def = this.pending
    if (!def) { if (this.state === 'saving') this.setState('saved'); return }
    const hash = definitionHash(def)
    if (hash === this.savedHash) { this.pending = null; this.setState('saved'); return }
    this.inFlight = true
    this.pending = null
    let outcome: SaveOutcome
    try { outcome = await this.transport(def, this.revision) } catch (err) { outcome = { kind: 'failed', message: (err as Error).message, offline: typeof navigator !== 'undefined' && navigator.onLine === false } }
    this.inFlight = false
    if (outcome.kind === 'saved') {
      this.revision = outcome.revision
      this.savedHash = hash
      this.attempt = 0
      if (this.pending) { this.setState('saving'); void this.flush() } else this.setState('saved')
      return
    }
    if (outcome.kind === 'conflict') {
      this.pending = this.pending ?? def
      this.conflictHalt = true
      this.setState('error')
      this.onConflict(outcome)
      return
    }
    // failed: keep the document, back off, retry
    this.pending = this.pending ?? def
    this.setState(outcome.offline ? 'offline' : 'error')
    const delay = retryDelay(this.attempt++)
    this.timer = setTimeout(() => { this.timer = null; if (this.state !== 'saving') this.setState('saving'); void this.flush() }, delay)
  }

  /** The caller resolved a conflict: continue from the new revision. */
  resume(revision: number, opts: { keepPending: boolean }): void {
    this.revision = revision
    this.conflictHalt = false
    this.attempt = 0
    if (!opts.keepPending) this.pending = null
    if (this.pending) { this.setState('saving'); void this.flush() } else this.setState('saved')
  }

  /** Force a retry now (Retry link, coming back online). */
  retryNow(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.attempt = 0
    if (this.pending) { this.setState('saving'); void this.flush() }
  }

  hasPending(): boolean { return this.pending !== null || this.inFlight }

  stop(): void { this.stopped = true; if (this.timer) clearTimeout(this.timer) }

  private setState(s: SaveLoop['state']): void { this.state = s; this.onState(this) }
}
