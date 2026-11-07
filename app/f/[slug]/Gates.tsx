'use client'

// The two screens that need the browser: the password gate (its token lives
// in this tab's sessionStorage, so the server page can't know it) and, on a
// one-response-per-person form, the "already responded" screen that can
// reopen the response to edit it.

import { useEffect, useMemo, useState } from 'react'
import { uiFor, emptyForm, type Theme, type FormLanguage } from '@/lib/forms-core/index'
import { publicCall, readUnlock, writeUnlock, type LivePayload, type PublicPayload, type PublicFormRef, PublicError } from './public-api'
import StatePanel, { Shell, themedButton } from './StatePanel'
import PublicForm, { EditForm } from './PublicForm'

export function LockedGate({ form, theme, language, embed, hidden }: { form: PublicFormRef; theme: Theme; language: FormLanguage; embed: boolean; hidden: Record<string, string> }) {
  const ui = uiFor(language)
  const [live, setLive] = useState<LivePayload | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A password given earlier in this tab lets the respondent straight back in.
  useEffect(() => {
    if (!readUnlock(form.id)) return
    publicCall<PublicPayload>(form.id, 'GET', `/by-slug/${encodeURIComponent(form.slug)}`)
      .then(r => { if (r.status === 'live') setLive(r); else if (r.status === 'locked') writeUnlock(form.id, null); else window.location.reload() })
      .catch(() => undefined)
  }, [form.id, form.slug])

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setBusy(true); setError(null)
    try {
      const r = await publicCall<{ token: string; form: PublicPayload }>(form.id, 'POST', `/${form.id}/unlock`, { password })
      writeUnlock(form.id, r.token)
      if (r.form.status === 'live') setLive(r.form); else window.location.reload()
    } catch (err) {
      const status = (err as PublicError).status
      setError(status === 403 ? ui.wrongPassword : status === 429 ? ui.failures.busy.title : ui.failures.network.title)
    } finally { setBusy(false) }
  }

  if (live) return <Shell theme={live.definition.theme} embed={embed}><PublicForm form={live.form} version={live.version} def={live.definition} respond={live.respond} embed={embed} hidden={hidden} /></Shell>
  return (
    <StatePanel theme={theme} language={language} embed={embed} tag={ui.password} title={form.title} body={ui.lockedBody} testId="form-locked">
      <form onSubmit={unlock} aria-label={ui.lockedTitle} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} aria-label={ui.password} placeholder={ui.password} autoComplete="current-password" autoFocus data-testid="unlock-password"
          aria-invalid={!!error || undefined} aria-describedby={error ? 'unlock-error' : undefined}
          style={{ flex: '1 1 220px', height: 46, padding: '0 14px', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, border: `2px solid ${error ? 'var(--coral)' : theme.line}`, borderRadius: theme.radius, background: theme.input, color: theme.text }} />
        <button type="submit" disabled={busy} style={{ ...themedButton(theme), opacity: busy ? .6 : 1 }} data-testid="unlock-submit">{ui.unlock}</button>
      </form>
      {error && <p id="unlock-error" role="alert" style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--coral-tx)', fontFamily: 'var(--font-body)' }} data-testid="unlock-error">{error}</p>}
    </StatePanel>
  )
}

/** One response per signed-in person, and this person has sent theirs. */
export function RespondedGate({ form, theme, language, embed, canEdit }: { form: PublicFormRef; theme: Theme; language: FormLanguage; embed: boolean; canEdit: boolean }) {
  const ui = uiFor(language)
  const [editing, setEditing] = useState(false)
  // Until the response loads, the page wears the form's look and language.
  const fallbackDef = useMemo(() => { const d = emptyForm(form.title); return { ...d, theme, settings: { ...d.settings, language } } }, [form.title, theme, language])
  if (editing) return <Shell theme={theme} embed={embed}><EditForm form={form} token={null} embed={embed} fallbackDef={fallbackDef} /></Shell>
  return (
    <StatePanel theme={theme} language={language} embed={embed} tag={ui.respondedTitle} title={form.title} body={ui.respondedBody} testId="form-responded">
      {canEdit && <button type="button" onClick={() => setEditing(true)} style={themedButton(theme)} data-testid="responded-edit">{ui.editResponse}</button>}
    </StatePanel>
  )
}
