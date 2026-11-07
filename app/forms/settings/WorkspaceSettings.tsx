'use client'

// Forms › Settings: what every new form starts with. Branding (the theme,
// logo and footer), notification defaults and the account form email sends
// from, form defaults (language, time zone, progress bar, thank-you message)
// and where forms publish. Saving changes new forms only; bringing existing
// forms along is the separate "Update existing forms" step, per the brief.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formsApi, publicFormUrl, type WorkspaceSettings, type Sender, type ApplyResult } from '@/lib/forms/api'
import { FORM_LANGUAGES, emptyForm, newBlock, isStockThanks, uiFor, type FormLanguage, type ProgressStyle, type Theme } from '@/lib/forms-core/index'
import { Btn, Icon, Banner, Card, Field, Input, Select, Textarea, Toggle, Seg, Checkbox, Dialog, Skeleton, useToast } from '../ui'
import { ThemeEditor } from '../builder/ThemePanel'
import { FormRunner } from '../render/FormRunner'
import { timeZones } from './zones'

type Part = 'theme' | 'notifications' | 'defaults'

export default function WorkspaceSettingsPage() {
  const { toast } = useToast()
  const [saved, setSaved] = useState<WorkspaceSettings | null>(null)
  const [draft, setDraft] = useState<WorkspaceSettings | null>(null)
  const [senders, setSenders] = useState<Sender[]>([])
  const [recipients, setRecipients] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [apply, setApply] = useState<{ parts: Part[]; publish: boolean; busy: boolean; result: ApplyResult | null } | null>(null)

  const applyLoaded = useCallback((r: { settings: WorkspaceSettings; senders: Sender[] }) => {
    setSaved(r.settings); setDraft(r.settings); setSenders(r.senders); setRecipients(r.settings.notifications.recipients.join(', ')); setError(null)
  }, [])
  const load = useCallback(async () => {
    try { applyLoaded(await formsApi.workspace()) } catch (err) { setError((err as Error).message) }
  }, [applyLoaded])
  // A load that lands late must not overwrite edits already made on the page (the discarded first run in dev strict mode did).
  useEffect(() => {
    let cancelled = false
    formsApi.workspace().then(r => { if (!cancelled) applyLoaded(r) }, err => { if (!cancelled) setError((err as Error).message) })
    return () => { cancelled = true }
  }, [applyLoaded])

  const dirty = useMemo(() => !!saved && !!draft && (JSON.stringify(saved) !== JSON.stringify(draft) || recipients !== saved.notifications.recipients.join(', ')), [saved, draft, recipients])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setTheme = (patch: Partial<Theme>) => setDraft(d => d && { ...d, theme: { ...d.theme, ...patch } })
  const setNotify = (patch: Partial<WorkspaceSettings['notifications']>) => setDraft(d => d && { ...d, notifications: { ...d.notifications, ...patch } })
  const setDefaults = (patch: Partial<WorkspaceSettings['defaults']>) => setDraft(d => d && { ...d, defaults: { ...d.defaults, ...patch } })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const list = recipients.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
      const next = await formsApi.saveWorkspace({ theme: draft.theme, notifications: { ...draft.notifications, recipients: list }, defaults: draft.defaults })
      setSaved(next); setDraft(next); setRecipients(next.notifications.recipients.join(', '))
      toast({ msg: 'Saved. New forms start with these settings.', stamp: 'SAVED', action: 'Update existing forms', onAction: () => setApply({ parts: ['theme', 'notifications', 'defaults'], publish: true, busy: false, result: null }) })
    } catch (err) { toast({ msg: `Couldn’t save: ${(err as Error).message}`, tone: 'coral' }) }
    finally { setSaving(false) }
  }

  const runApply = async () => {
    if (!apply || !apply.parts.length) return
    setApply({ ...apply, busy: true })
    try { const result = await formsApi.applyWorkspace({ parts: apply.parts, publish: apply.publish }); setApply({ ...apply, busy: false, result }) }
    catch (err) { toast({ msg: `Couldn’t update forms: ${(err as Error).message}`, tone: 'coral' }); setApply({ ...apply, busy: false }) }
  }

  const sample = useMemo(() => {
    const def = emptyForm('Your form title')
    def.pages[0].blocks = [newBlock('short', { label: 'Your name', required: true }), newBlock('choice', { label: 'How did you hear about us?', options: [{ id: 'o_a', label: 'A friend' }, { id: 'o_b', label: 'Search' }] })]
    return def
  }, [])
  const previewDef = draft ? { ...sample, theme: draft.theme, settings: { ...sample.settings, language: draft.defaults.language, progress: draft.defaults.progress } } : sample
  const zones = useMemo(() => timeZones(draft?.defaults.timezone), [draft?.defaults.timezone])

  if (error) return <div style={{ padding: 32 }}><div className="fb-banner fb-banner--coral fb-banner--inline" role="alert"><Icon name="alert" size={15} /><span style={{ flex: 1 }}>Couldn’t load settings: {error}</span><Btn size="sm" onClick={load}>Retry</Btn></div></div>
  if (!draft || !saved) return <div style={{ padding: 32 }} aria-busy="true"><Skeleton width="40%" /><Skeleton width="70%" style={{ marginTop: 14 }} /></div>

  const sender = senders.find(s => s.owner === draft.notifications.sender) ?? null
  const section = (id: string, title: string, sub: string, body: React.ReactNode) => (
    <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }} data-testid={`ws-${id}`} id={id}>
      <div><h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2><p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }}>{sub}</p></div>
      {body}
    </Card>
  )

  return (
    <div style={{ padding: '24px 32px 96px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }} data-testid="forms-settings">
      <Banner tone="neutral" icon="sliders" inline wrap action={<Btn size="sm" onClick={() => setApply({ parts: ['theme', 'notifications', 'defaults'], publish: true, busy: false, result: null })} testId="ws-apply-open">Update existing forms…</Btn>}>
        These are the defaults for new forms. Saving never changes a form that already exists — updating those is its own step.
      </Banner>
      <nav aria-label="Settings sections" style={{ display: 'flex', gap: 14, fontSize: 13, fontWeight: 700 }}>
        {[['branding', 'Branding'], ['notifications', 'Notifications'], ['defaults', 'Form defaults'], ['domains', 'Domains']].map(([id, l]) => <a key={id} href={`#${id}`} style={{ color: 'var(--tx2)' }}>{l}</a>)}
      </nav>

      {section('branding', 'Branding', 'The look every new form starts with: colours, fonts, logo and the line under the form.', (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="ws-theme-editor">
            <ThemeEditor theme={draft.theme} onChange={setTheme} onUpload={async f => { try { return (await formsApi.uploadWorkspaceLogo(f)).url } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }); return null } }} />
          </div>
          <div style={{ position: 'sticky', top: 12, border: '2px solid var(--ink)', borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: 'var(--el-2)', maxHeight: 620 }} data-testid="ws-preview">
            <div className="fb-scroll" data-runner-scroll="" style={{ maxHeight: 620 }}>
              <FormRunner def={previewDef} mode="preview" device="tablet" transport={{ submit: async () => ({ submissionId: 'preview', endingId: previewDef.endings[0]?.id ?? '' }), uploads: null }} />
            </div>
          </div>
        </div>
      ))}

      {section('notifications', 'Notifications', 'Who hears about a new response, and whether respondents get a confirmation. New forms start with these; each form can change its own in Settings › Notifications.', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
          <Field label="Send form email from" htmlFor="ws-sender" hint={<>The connected Google account alerts and confirmations go out from. Link a mailbox in <Link href="/settings">Settings › Sending identity</Link>.</>}>
            <Select id="ws-sender" value={draft.notifications.sender ?? ''} onChange={e => setNotify({ sender: e.target.value || null })} data-testid="ws-sender">
              <option value="">Nobody — no form email is sent</option>
              {senders.map(s => <option key={s.owner} value={s.owner} disabled={!s.canSend}>{s.label}{s.canSend ? '' : ' — can’t send (reconnect with Gmail access)'}</option>)}
            </Select>
          </Field>
          {!draft.notifications.sender && <Banner tone="gold" icon="alert" inline>Until an account is chosen, alerts and confirmations are logged on each form as not sent.</Banner>}
          {sender && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--tx2)' }}>Respondents and recipients see <strong>{sender.email}</strong> in From.</p>}
          <Toggle on={draft.notifications.owner} onChange={v => setNotify({ owner: v })} label="Alert recipients when a response arrives" sub="Each form sends to its own recipients, or to its owner when it has none." testId="ws-owner-alerts" />
          <Field label="Default recipients" htmlFor="ws-recipients" hint="Email addresses, separated by commas. Leave empty to alert each form’s owner.">
            <Input id="ws-recipients" value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="ops@example.com, owner@example.com" data-testid="ws-recipients" />
          </Field>
          <Toggle on={draft.notifications.confirmation} onChange={v => setNotify({ confirmation: v })} label="Send respondents a confirmation" sub="Goes to the form’s first email question. Capped at 3 a day per address so a form can’t flood an inbox." testId="ws-confirmation" />
          {draft.notifications.confirmation && (
            <>
              <Field label="Confirmation subject" htmlFor="ws-subject" hint="Empty uses “We got your response: <form title>” in the form’s language."><Input id="ws-subject" value={draft.notifications.subject} maxLength={200} onChange={e => setNotify({ subject: e.target.value })} /></Field>
              <Field label="Confirmation message" htmlFor="ws-message" hint="Empty uses a short thank-you in the form’s language. The answers follow it."><Textarea id="ws-message" rows={3} value={draft.notifications.message} maxLength={5000} onChange={e => setNotify({ message: e.target.value })} /></Field>
            </>
          )}
        </div>
      ))}

      {section('defaults', 'Form defaults', 'The language respondents see buttons and messages in, the time zone opening and closing times are shown in, the progress bar and the thank-you message.', (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 760 }}>
          <Field label="Language" htmlFor="ws-lang" hint="Buttons, banners and validation messages. Your questions are shown as you write them.">
            <Select id="ws-lang" value={draft.defaults.language} onChange={e => { const language = e.target.value as FormLanguage; setDefaults({ language, ...(isStockThanks(draft.defaults.thankYouTitle) ? { thankYouTitle: uiFor(language).thanks } : {}) }) }} data-testid="ws-language">
              {FORM_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}{l.native !== l.name ? ` · ${l.native}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Time zone" htmlFor="ws-tz" hint="For opening and closing times and email timestamps.">
            <Select id="ws-tz" value={draft.defaults.timezone} onChange={e => setDefaults({ timezone: e.target.value })} data-testid="ws-timezone">
              {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Progress">
              <Seg<ProgressStyle> label="Progress" value={draft.defaults.progress} onChange={v => setDefaults({ progress: v })} options={[{ value: 'bar', label: 'Bar' }, { value: 'pages', label: 'Page count' }, { value: 'stages', label: 'Stages' }, { value: 'none', label: 'None' }]} testId="ws-progress" />
            </Field>
          </div>
          <Field label="Thank-you title" htmlFor="ws-thanks"><Input id="ws-thanks" value={draft.defaults.thankYouTitle} maxLength={300} onChange={e => setDefaults({ thankYouTitle: e.target.value })} data-testid="ws-thanks" /></Field>
          <Field label="Thank-you message" htmlFor="ws-thanks-body" hint="Optional line under the title."><Input id="ws-thanks-body" value={draft.defaults.thankYouBody} maxLength={2000} onChange={e => setDefaults({ thankYouBody: e.target.value })} /></Field>
        </div>
      ))}

      {section('domains', 'Domains', 'Where published forms live.', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
          <Field label="Forms publish at">
            <Input readOnly mono value={publicFormUrl('your-form-link')} aria-label="Forms publish at" data-testid="ws-domain" />
          </Field>
          <Field label="Custom domain" hint="Not available yet: a custom domain needs DNS records and a certificate set up outside the portal.">
            <Input disabled placeholder="forms.yourcompany.com" aria-label="Custom domain" />
          </Field>
        </div>
      ))}

      {dirty && (
        <div role="region" aria-label="Unsaved settings" style={{ position: 'sticky', bottom: 16, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '2px solid var(--ink)', borderRadius: 'var(--r-card)', background: 'var(--gold-bg)', boxShadow: 'var(--el-3)' }} data-testid="ws-savebar">
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Unsaved changes. They apply to new forms.</span>
          <Btn onClick={() => { setDraft(saved); setRecipients(saved.notifications.recipients.join(', ')) }}>Discard</Btn>
          <Btn solid onClick={save} disabled={saving} testId="ws-save">{saving ? 'Saving…' : 'Save settings'}</Btn>
        </div>
      )}

      <Dialog open={!!apply} title="Update existing forms" onClose={() => setApply(null)} width={520} testId="ws-apply"
        actions={apply?.result ? <Btn solid onClick={() => setApply(null)}>Done</Btn> : <><Btn onClick={() => setApply(null)}>Cancel</Btn><Btn solid onClick={runApply} disabled={!apply?.parts.length || apply?.busy || dirty} testId="ws-apply-run">{apply?.busy ? 'Updating…' : 'Update forms'}</Btn></>}>
        {apply && !apply.result && (
          <>
            {dirty && <Banner tone="gold" icon="alert" inline>Save your changes first — this uses the saved settings.</Banner>}
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.5 }}>Every form in All forms (not archived) takes what you choose:</p>
            {([['theme', 'Branding', 'The theme, logo and footer replace each form’s design.'], ['notifications', 'Notifications', 'Recipients and confirmation settings, live at once.'], ['defaults', 'Form defaults', 'Language, progress bar and time zone. Thank-you messages stay as each form has them.']] as Array<[Part, string, string]>).map(([p, l, sub]) => (
              <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Checkbox checked={apply.parts.includes(p)} onChange={v => setApply({ ...apply, parts: v ? [...apply.parts, p] : apply.parts.filter(x => x !== p) })} label={l} testId={`ws-apply-${p}`} />
                <span style={{ fontSize: 12, color: 'var(--mut2)', paddingLeft: 28 }}>{sub}</span>
              </div>
            ))}
            <Toggle on={apply.publish} onChange={v => setApply({ ...apply, publish: v })} label="Publish the design change on live forms" sub="Only forms with no other unpublished edits; the rest wait for their owner to publish." testId="ws-apply-publish" />
          </>
        )}
        {apply?.result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }} data-testid="ws-apply-result">
            <strong>Updated {apply.result.updated} form{apply.result.updated === 1 ? '' : 's'}{apply.result.published ? `, published ${apply.result.published}` : ''}.</strong>
            {apply.result.needsPublish.length > 0 && <div><span style={{ color: 'var(--tx2)' }}>Waiting to be published by their owners:</span><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{apply.result.needsPublish.map(f => <li key={f.id}><Link href={`/forms/${f.id}`}>{f.title}</Link></li>)}</ul></div>}
            {apply.result.skipped.length > 0 && <div><span style={{ color: 'var(--coral-tx)' }}>Skipped:</span><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{apply.result.skipped.map(f => <li key={f.id}>{f.title} — {f.reason}</li>)}</ul></div>}
          </div>
        )}
      </Dialog>
    </div>
  )
}
