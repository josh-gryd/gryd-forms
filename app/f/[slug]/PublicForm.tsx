'use client'

// The live respondent surface: the shared runner with a real transport.
// Everything goes through the dashboard's public proxy; the engine
// validates, rate-limits and never trusts anything sent from here.
//
// A session belongs to the version it started on (QA 2026-09-24 P0). The page
// is served with the live version; when this device holds a newer session on
// an older version, the page asks the engine for that version and resumes on
// it, or — once it has been retired — carries the answers onto the live one
// and says so. Every save, upload and submit names the version it was made on.
//
// #edit=<token> (the respondent's private link, in the fragment so it never
// reaches a server log) opens their sent response to change it instead.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { uiFor, allBlocks, type FormDefinition, type Block, type AnswerMap } from '@/lib/forms-core/index'
import { FormRunner, type RunnerTransport } from '@/app/forms/render/FormRunner'
import type { UploadTransport, UploadGrant } from '@/app/forms/render/uploads'
import { latestSession, carryOver, sessionKey, writeDraft, clearDraft } from '@/app/forms/render/session'
import { publicCall, PublicError, deviceId, readDone, writeDone, PUBLIC_BASE, type LivePayload } from './public-api'
import StatePanel, { themedButton } from './StatePanel'

type Version = { id: string; number: number }
type SessionVersion = { status: 'live'; version: Version; definition: FormDefinition } | { status: 'moved'; live: Version }
interface Active { version: Version; def: FormDefinition; notice: { dropped: number } | null }
type EditSession = { submissionId: string; version: Version; definition: FormDefinition; answers: AnswerMap }

function uploadTransport(formId: string, versionId: string, readToken: () => string | null): UploadTransport {
  return {
    async create(block: Block, file: File) {
      const g = await publicCall<UploadGrant & { url: string; headers: Record<string, string> }>(formId, 'POST', `/${formId}/uploads`, { blockId: block.id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', token: readToken(), versionId, proxyBase: `${PUBLIC_BASE}/uploads` })
      return { fileId: g.fileId, uploadToken: g.uploadToken, put: { url: g.url, headers: g.headers ?? {} } }
    },
    async complete(fileId, uploadToken) { await publicCall(formId, 'POST', `/uploads/${encodeURIComponent(fileId)}/complete`, { token: uploadToken }) },
    async cancel(fileId, uploadToken) { await publicCall(formId, 'DELETE', `/uploads/${encodeURIComponent(fileId)}?t=${encodeURIComponent(uploadToken)}`) },
  }
}

export default function PublicForm({ form, version, def, respond, embed, hidden }: { form: LivePayload['form']; version: Version; def: FormDefinition; respond: LivePayload['respond']; embed: boolean; hidden: Record<string, string> }) {
  const ui = uiFor(def.settings.language)
  const [editToken, setEditToken] = useState<string | null | undefined>(undefined)
  const [done, setDone] = useState<{ editToken: string | null } | null>(null)
  useEffect(() => {
    // The thank-you page's "Edit your response" only changes the fragment, so the page hears it
    // here rather than on the next load (QA 09-25, round 3: the editor needed a refresh).
    const read = () => { const m = /(?:^|[#&])edit=([A-Za-z0-9]{20,80})/.exec(window.location.hash); setEditToken(m ? m[1] : null) }
    read()
    if (respond.duplicates === 'device') setDone(readDone(form.id))
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [form.id, respond.duplicates])

  if (editToken === undefined) return null
  if (editToken) return <EditForm form={form} token={editToken} embed={embed} fallbackDef={def} />
  if (done) {
    const canEdit = def.settings.allowEdits && !!done.editToken
    return (
      <StatePanel bare theme={def.theme} language={def.settings.language} embed={embed} tag={ui.respondedTitle} title={form.title} body={ui.respondedBody} testId="form-responded">
        {canEdit && <a href={`#edit=${done.editToken}`} onClick={() => { setEditToken(done.editToken) }} style={themedButton(def.theme)} data-testid="responded-edit">{ui.editResponse}</a>}
      </StatePanel>
    )
  }
  return <LiveForm form={form} version={version} def={def} respond={respond} embed={embed} hidden={hidden} onDone={t => { if (respond.duplicates === 'device') writeDone(form.id, t) }} />
}

function LiveForm({ form, version, def, respond, embed, hidden, onDone }: { form: LivePayload['form']; version: Version; def: FormDefinition; respond: LivePayload['respond']; embed: boolean; hidden: Record<string, string>; onDone: (editToken: string | null) => void }) {
  const [active, setActive] = useState<Active>({ version, def, notice: null })
  const [resolving, setResolving] = useState(false)
  const ui = uiFor(def.settings.language)

  useEffect(() => {
    if (def.settings.saveResume === false) return
    const found = latestSession(form.id)
    if (!found || found.versionId === version.id) return
    let cancelled = false
    setResolving(true)
    const moveToLive = () => {
      const moved = carryOver(found.draft, def)
      writeDraft(sessionKey(form.id, version.id), moved.draft)
      clearDraft(found.key)
      setActive({ version, def, notice: { dropped: moved.dropped } })
    }
    publicCall<SessionVersion>(form.id, 'GET', `/${form.id}/versions/${encodeURIComponent(found.versionId)}`)
      .then(r => {
        if (cancelled) return
        if (r.status === 'live' && r.definition) setActive({ version: r.version, def: r.definition, notice: null })
        else moveToLive()
      })
      .catch((err: PublicError) => {
        if (cancelled) return
        // A network blip keeps the old session for the next visit; anything the engine
        // refused (closed, unpublished) leaves the live page, which says so itself.
        if (err.status !== 0 && err.status !== 502 && err.status !== 503) moveToLive()
      })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [form.id, version, def])

  const versionId = active.version.id
  const storageKey = sessionKey(form.id, versionId)
  // One response per email address: the address is checked as the respondent leaves its page,
  // and the form's first email question says so up front (QA 09-25, round 3).
  const onePerEmail = respond.duplicates === 'email'
  const firstEmail = useMemo(() => onePerEmail ? allBlocks(active.def).find(b => b.type === 'email')?.id ?? null : null, [onePerEmail, active.def])
  const fieldNotes = useMemo(() => firstEmail ? { [firstEmail]: uiFor(active.def.settings.language).onePerEmail } : undefined, [firstEmail, active.def.settings.language])
  const olderVersion = versionId !== version.id
  // Start over means the form as it is now (QA retest 2026-09-25): a session kept on an
  // older version is dropped, and the respondent begins blank on the live one.
  const onEvent = useCallback((e: { type: string; editToken?: string | null }) => {
    if (e.type === 'submitted') { onDone(e.editToken ?? null); return }
    if (e.type !== 'restart' || !olderVersion) return
    clearDraft(sessionKey(form.id, versionId))
    clearDraft(sessionKey(form.id, version.id))
    setActive({ version, def, notice: null })
  }, [olderVersion, form.id, versionId, version, def, onDone])
  // A form a GRYD video opened says so with its answers, so the video can name that view (video/hubspot.ts).
  const meta = useMemo(() => {
    const source = Object.fromEntries(['gryd_video', 'gryd_view'].flatMap(k => (hidden[k] && /^[A-Za-z0-9_-]{1,64}$/.test(hidden[k]) ? [[k, hidden[k]]] : [])))
    return Object.keys(source).length ? { source, embedded: embed } : undefined
  }, [hidden, embed])
  const transport = useMemo<RunnerTransport>(() => {
    const readToken = (): string | null => { try { const raw = localStorage.getItem(storageKey); return raw ? (JSON.parse(raw).token ?? null) : null } catch { return null } }
    return {
      uploads: uploadTransport(form.id, versionId, readToken),
      saveDraft: p => publicCall<{ token: string | null; completed?: boolean }>(form.id, 'POST', `/${form.id}/draft`, { ...p, versionId, deviceId: deviceId(), meta }),
      submit: p => publicCall<{ submissionId: string; endingId: string; duplicate: boolean; editToken: string | null }>(form.id, 'POST', `/${form.id}/submit`, { ...p, versionId, deviceId: deviceId(), meta }),
      checkPage: onePerEmail ? async ({ pageId, answers }) => {
        const page = active.def.pages.find(p => p.id === pageId)
        const emails = Object.fromEntries(allBlocks(active.def).filter(b => b.type === 'email' && typeof answers[b.id] === 'string' && String(answers[b.id]).trim()).map(b => [b.id, answers[b.id]]))
        if (!page?.blocks.some(b => b.id in emails)) return null
        const r = await publicCall<{ errors: Record<string, string>; pageId: string | null }>(form.id, 'POST', `/${form.id}/check`, { versionId, answers: emails })
        return Object.keys(r.errors ?? {}).length ? r : null
      } : undefined,
    }
  }, [form.id, versionId, storageKey, onePerEmail, active.def, meta])

  if (resolving) {
    return (
      <div role="status" aria-live="polite" data-testid="session-resolving" style={{ minHeight: embed ? 120 : '60vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, color: def.theme.muted }}>
        {ui.resolving}
      </div>
    )
  }
  return <FormRunner key={versionId} def={active.def} mode="live" transport={transport} storageKey={storageKey} hiddenValues={hidden} embed={embed} notice={active.notice} olderVersion={olderVersion} oneResponse={respond.duplicates !== 'allow'} fieldNotes={fieldNotes} onEvent={onEvent} />
}

/** A sent response, opened from the respondent's private link (or, on a
 *  restricted form, their own account) to change the answers. */
export function EditForm({ form, token, embed, fallbackDef }: { form: LivePayload['form']; token: string | null; embed: boolean; fallbackDef: FormDefinition }) {
  const [session, setSession] = useState<EditSession | null>(null)
  const [failed, setFailed] = useState(false)
  const ui = uiFor((session?.definition ?? fallbackDef).settings.language)
  useEffect(() => {
    let cancelled = false
    publicCall<EditSession>(form.id, 'POST', `/${form.id}/edit/load`, { token })
      .then(s => { if (!cancelled) setSession(s) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [form.id, token])
  const transport = useMemo<RunnerTransport | null>(() => session && {
    uploads: uploadTransport(form.id, session.version.id, () => null),
    submit: async p => {
      const r = await publicCall<{ submissionId: string; endingId: string }>(form.id, 'POST', `/${form.id}/edit/save`, { token, versionId: session.version.id, answers: p.answers, pagesVisited: p.pagesVisited })
      return { submissionId: r.submissionId, endingId: r.endingId }
    },
  }, [form.id, token, session])

  if (failed) return <StatePanel bare theme={fallbackDef.theme} language={fallbackDef.settings.language} embed={embed} tag={ui.editResponse} title={form.title} body={ui.editUnavailable} testId="edit-unavailable" />
  if (!session || !transport) return <div role="status" aria-live="polite" style={{ minHeight: embed ? 120 : '60vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, color: fallbackDef.theme.muted }}>{ui.resolving}</div>
  return (
    <>
      <div style={{ maxWidth: session.definition.theme.width, margin: '0 auto', padding: embed ? '12px 16px 0' : '24px 24px 0' }}>
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `2px solid ${session.definition.theme.line}`, borderRadius: session.definition.theme.radius, background: session.definition.theme.content, color: session.definition.theme.text, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)' }} data-testid="editing-banner">{ui.editingBanner}</div>
      </div>
      <FormRunner def={session.definition} mode="live" transport={transport} embed={embed} editing={{ answers: session.answers }} />
    </>
  )
}
