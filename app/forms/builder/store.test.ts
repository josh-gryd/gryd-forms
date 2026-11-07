import test from 'node:test'
import assert from 'node:assert/strict'
import { pushHistory, undo, redo, initialHistory, decideRecovery, SaveLoop, readLocalDraft, writeLocalDraft, retryDelay, type SaveOutcome } from './store'
import { emptyForm, definitionHash, type FormDefinition } from '@/lib/forms-core/index'

const doc = (title: string): FormDefinition => ({ ...emptyForm(title) })

test('history: structural edits push, typing coalesces, undo/redo round-trip', () => {
  let h = initialHistory()
  const a = doc('a'), b = doc('b'), c = doc('c')
  h = pushHistory(h, a, false, 1000)
  h = pushHistory(h, b, true, 1100)
  h = pushHistory(h, { ...b, title: 'bb' }, true, 1200) // within the pause → coalesced
  assert.equal(h.past.length, 2)
  const u = undo(h, c)!
  assert.equal(u.def.title, 'b')
  assert.equal(u.history.future[0].title, 'c')
  const r = redo(u.history, u.def)!
  assert.equal(r.def.title, 'c')
  assert.equal(r.history.past.length, 2)
  assert.equal(undo(initialHistory(), a), null)
})

test('history is capped at 40 snapshots', () => {
  let h = initialHistory()
  for (let i = 0; i < 60; i++) h = pushHistory(h, doc(String(i)), false, i * 5000)
  assert.equal(h.past.length, 40)
  assert.equal(h.past[0].title, '20')
})

test('local recovery: restore when based on the current revision, conflict when the server moved on', () => {
  const serverDef = doc('server')
  const server = { revision: 3, def: serverDef }
  assert.equal(decideRecovery(null, server).kind, 'none')
  assert.equal(decideRecovery({ formId: 'f', baseRevision: 3, def: JSON.parse(JSON.stringify(serverDef)), at: 1 }, server).kind, 'none')
  const restore = decideRecovery({ formId: 'f', baseRevision: 3, def: doc('local'), at: 1 }, server)
  assert.equal(restore.kind, 'restore')
  const conflict = decideRecovery({ formId: 'f', baseRevision: 2, def: doc('local'), at: 1 }, server)
  assert.equal(conflict.kind, 'conflict')
  const mem = new Map<string, string>()
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } }
  writeLocalDraft(storage, { formId: 'f', baseRevision: 3, def: doc('local'), at: 5 })
  assert.equal(readLocalDraft(storage, 'f')!.def.title, 'local')
  assert.equal(readLocalDraft(storage, 'other'), null)
})

test('save loop: debounced, latest wins, revision advances, never "saved" before the server says so', async () => {
  const calls: Array<{ title: string; base: number }> = []
  const states: string[] = []
  const transport = async (def: FormDefinition, base: number): Promise<SaveOutcome> => { calls.push({ title: def.title, base }); return { kind: 'saved', revision: base + 1 } }
  const start = doc('start'), two = doc('two')
  const loop = new SaveLoop(transport, { def: start, revision: 1, savedHash: definitionHash(start) }, l => states.push(l.state), () => undefined)
  loop.schedule(doc('one'), 10)
  loop.schedule(two, 10)
  assert.equal(loop.state, 'saving')
  await new Promise(r => setTimeout(r, 40))
  assert.deepEqual(calls, [{ title: 'two', base: 1 }])
  assert.equal(loop.revision, 2)
  assert.equal(loop.state, 'saved')
  loop.schedule(JSON.parse(JSON.stringify(two)), 5)
  await new Promise(r => setTimeout(r, 20))
  assert.equal(calls.length, 1, 'an unchanged document is not re-saved')
  assert.equal(loop.state, 'saved')
})

test('save loop: a failure keeps the document and retries with backoff; a conflict halts until resumed', async () => {
  let fail = 2
  const calls: number[] = []
  const transport = async (_def: FormDefinition, base: number): Promise<SaveOutcome> => { calls.push(base); if (fail-- > 0) return { kind: 'failed', message: 'boom', offline: false }; return { kind: 'saved', revision: base + 1 } }
  const loop = new SaveLoop(transport, { def: doc('start'), revision: 1, savedHash: 'x' }, () => undefined, () => undefined)
  loop.schedule(doc('edit'), 1)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loop.state, 'error')
  assert.equal(loop.hasPending(), true)
  loop.retryNow()
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loop.state, 'error')
  loop.retryNow()
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loop.state, 'saved')
  assert.equal(loop.revision, 2)
  assert.equal(retryDelay(0), 1000); assert.equal(retryDelay(99), 30000)

  let conflict: SaveOutcome | null = null
  const conflicting = async (): Promise<SaveOutcome> => ({ kind: 'conflict', revision: 9, def: doc('theirs'), updatedBy: 'b@example.com', updatedAt: 'now' })
  const loop2 = new SaveLoop(conflicting, { def: doc('start'), revision: 1, savedHash: 'x' }, () => undefined, c => { conflict = c })
  loop2.schedule(doc('mine'), 1)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loop2.state, 'error')
  assert.ok(conflict && (conflict as SaveOutcome).kind === 'conflict')
  loop2.schedule(doc('mine again'), 1)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loop2.state, 'error', 'no saves while a conflict is unresolved')
  loop2.resume(9, { keepPending: false })
  assert.equal(loop2.state, 'saved')
  assert.equal(loop2.revision, 9)
})
