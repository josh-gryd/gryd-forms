'use client'

// Settings: everything about a form that isn't a question. Six sections —
// General, Availability, Access, Form behavior, After submission,
// Notifications. Two kinds of setting, labelled as such:
//   · Part of the form (title, description, language, behavior, the thank-you
//     screen): saved with the draft, live when you publish — like a question.
//   · Around the form (name, owner, dates, limit, access, Slack, email):
//     saved and live the moment they change, no publish needed.
// An option with details (a schedule, a password, Slack) is a switch that
// opens them; turning it off clears them.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formsApi, formsChanged, type OpsPatch, type SettingsPatch, type NotificationLog, type Sender, type DuplicateMode } from '@/lib/forms/api'
import { FORM_LANGUAGES, DEFAULT_CLOSED_MESSAGE, defaultEnding, uiFor, isStockThanks, allBlocks, isInputBlock, componentDef, answerToken, describeTemplate, type FormLanguage, type ProgressStyle } from '@/lib/forms-core/index'
import { Btn, Card, Field, Input, Select, Textarea, Toggle, Seg, Tag, Banner, Checkbox, relativeTime } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder } from './context'
import { isoToZonedInput, zonedInputToIso, formatInZone } from '../zoned'
import { timeZones } from '../settings/zones'
import SlackPicker from './SlackPicker'

const SECTIONS: Array<[string, string]> = [['general', 'General'], ['availability', 'Availability'], ['access', 'Access'], ['behavior', 'Form behavior'], ['after', 'After submission'], ['notifications', 'Notifications']]
const LOG_KIND: Record<NotificationLog['kind'], string> = { slack: 'Slack', owner: 'Team email', confirmation: 'Confirmation' }
/** A section is "here" once its top is in the upper third of the scroll area (at least this far down). */
const SPY_OFFSET = 120

function Kind({ live }: { live: boolean }) {
  return live
    ? <Tag tone="lime-bg" title="Saved and in effect as soon as you change it.">Live when saved</Tag>
    : <Tag tone="gold-bg" title="Saved with the draft; respondents see it after you publish.">Goes live on publish</Tag>
}

/** A switch that opens its details underneath while it's on. */
function Reveal({ on, onChange, label, sub, testId, disabled, children }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode; sub?: React.ReactNode; testId: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="fb-reveal">
      <Toggle on={on} onChange={onChange} label={label} sub={sub} testId={testId} disabled={disabled} />
      {on && children && <div className="fb-reveal__body" data-testid={`${testId}-details`}>{children}</div>}
    </div>
  )
}

export default function SettingsTab() {
  const api = useBuilder()
  const d = api.detail
  const ops = d.ops
  const def = api.def
  const live = d.live !== null
  const [saving, setSaving] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Record<string, number>>({})
  const [log, setLog] = useState<NotificationLog[] | null>(null)
  const [sender, setSender] = useState<Sender | null | undefined>(undefined)
  // A switch turned on before its details exist (no date picked yet) is open here only.
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const open = (key: string, v: boolean) => setOpened(o => ({ ...o, [key]: v }))

  // Text fields hold their own value until blur/Enter saves them.
  const [name, setName] = useState(d.name)
  const [owner, setOwner] = useState(d.owner ?? '')
  const [closedMsg, setClosedMsg] = useState(d.closedMessage)
  const [limit, setLimit] = useState(ops.maxResponses ? String(ops.maxResponses) : '')
  const [recipients, setRecipients] = useState(ops.notify.recipients.join(', '))
  const [subject, setSubject] = useState(ops.notify.subject)
  const [message, setMessage] = useState(ops.notify.message)
  const [slackMessage, setSlackMessage] = useState(ops.slack.message)
  const [password, setPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)
  const [slackTest, setSlackTest] = useState<{ busy: boolean; ok?: boolean; msg?: string }>({ busy: false })
  // Ticks show at once; the save follows.
  const [slackFields, setSlackFieldsShown] = useState(ops.slack.fields)
  const savedFields = JSON.stringify(ops.slack.fields)
  useEffect(() => { setSlackFieldsShown(JSON.parse(savedFields) as string[] | null) }, [savedFields])
  // Each box follows only its own saved value, so a save elsewhere never wipes what's being typed.
  const savedRecipients = ops.notify.recipients.join(', ')
  useEffect(() => { setName(d.name) }, [d.name])
  useEffect(() => { setOwner(d.owner ?? '') }, [d.owner])
  useEffect(() => { setClosedMsg(d.closedMessage) }, [d.closedMessage])
  useEffect(() => { setLimit(ops.maxResponses ? String(ops.maxResponses) : '') }, [ops.maxResponses])
  useEffect(() => { setRecipients(savedRecipients) }, [savedRecipients])
  useEffect(() => { setSubject(ops.notify.subject) }, [ops.notify.subject])
  useEffect(() => { setMessage(ops.notify.message) }, [ops.notify.message])
  useEffect(() => { setSlackMessage(ops.slack.message) }, [ops.slack.message])

  // A stock thank-you title follows the language, so the canvas shows what respondents will read.
  const setLanguage = (language: FormLanguage) => api.mutate(x => ({
    ...x,
    settings: { ...x.settings, language },
    endings: x.endings.map(en => isStockThanks(en.title) ? { ...en, title: uiFor(language).thanks } : en),
  }))

  const loadLog = useCallback(() => { formsApi.notifications(d.id).then(setLog).catch(() => setLog([])) }, [d.id])
  useEffect(() => {
    loadLog()
    formsApi.workspace().then(w => setSender(w.senders.find(s => s.owner === w.settings.notifications.sender) ?? null)).catch(() => setSender(null))
  }, [loadLog])

  // The section list follows the scroll: the last section whose top has passed the line is "here".
  const scroller = useRef<HTMLDivElement>(null)
  const [here, setHere] = useState(SECTIONS[0][0])
  const pinned = useRef(0)
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const spy = () => {
      if (Date.now() < pinned.current) return
      const top = root.getBoundingClientRect().top
      const line = Math.max(SPY_OFFSET, root.clientHeight / 3)
      let at = SECTIONS[0][0]
      for (const [id] of SECTIONS) {
        const el = document.getElementById(`settings-${id}`)
        if (el && el.getBoundingClientRect().top - top <= line) at = id
      }
      if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) at = SECTIONS[SECTIONS.length - 1][0]
      setHere(at)
    }
    spy()
    root.addEventListener('scroll', spy, { passive: true })
    window.addEventListener('resize', spy)
    return () => { root.removeEventListener('scroll', spy); window.removeEventListener('resize', spy) }
  }, [])
  const jump = (id: string) => {
    // A click names the section outright; the smooth scroll that follows mustn't flicker through the others.
    setHere(id)
    pinned.current = Date.now() + 900
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const save = useCallback(async (section: string, patch: SettingsPatch): Promise<boolean> => {
    setSaving(section)
    try {
      await formsApi.settings(d.id, patch)
      await api.refreshDetail()
      setSavedAt(s => ({ ...s, [section]: Date.now() }))
      window.setTimeout(() => setSavedAt(s => { const n = { ...s }; delete n[section]; return n }), 4000)
      if (patch.name !== undefined || patch.folderId !== undefined) formsChanged()
      return true
    } catch (err) { api.toast({ msg: (err as Error).message, tone: 'coral' }); return false }
    finally { setSaving(null) }
  }, [d.id, api])
  const saveOps = (section: string, patch: OpsPatch) => save(section, { ops: patch })

  const endingId = defaultEnding(def)
  const ending = def.endings.find(e => e.id === endingId) ?? def.endings[0]
  const zones = useMemo(() => timeZones(ops.timezone), [ops.timezone])
  const questions = useMemo(() => allBlocks(def).filter(isInputBlock), [def])
  const status = (section: string) => saving === section ? <span style={{ fontSize: 12, color: 'var(--mut2)' }}>Saving…</span> : savedAt[section] ? <span role="status" style={{ fontSize: 12, color: 'var(--lime-tx)', fontWeight: 700 }} data-testid={`saved-${section}`}>Saved</span> : null
  const head = (id: string, title: string, sub: string, liveNow: boolean) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <h2 id={`settings-${id}-title`} style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5 }}>{sub}</p>
      </div>
      {status(id)}
      <Kind live={liveNow} />
    </div>
  )
  // General is the one card that mixes both timings, so each half says its own (QA 09-25, round 3).
  const group = (title: string, live: boolean, testId: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }} data-testid={testId}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 'var(--track-label)', textTransform: 'uppercase', color: 'var(--tx2)', flex: 1 }}>{title}</h3>
      <Kind live={live} />
    </div>
  )
  const card = (id: string, children: React.ReactNode) => (
    <Card id={`settings-${id}`} aria-labelledby={`settings-${id}-title`} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, scrollMarginTop: 72 }} data-testid={`settings-${id}`}>{children}</Card>
  )
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); fn() } }

  const setDate = (key: 'opensAt' | 'closesAt', value: string) => {
    const iso = value ? zonedInputToIso(value, ops.timezone) : null
    void saveOps('availability', key === 'opensAt' ? { opensAt: iso } : { closesAt: iso })
  }
  const saveLimit = () => {
    const n = limit.trim() ? Number(limit) : null
    if (n === ops.maxResponses || (n === null && ops.maxResponses === null)) return
    if (n !== null && (!Number.isInteger(n) || n < 1)) { api.toast({ msg: 'The limit is a whole number of responses.', tone: 'coral' }); return }
    void saveOps('availability', { maxResponses: n })
  }
  const saveRecipients = () => {
    const list = recipients.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    if (list.join(',') === ops.notify.recipients.join(',')) return
    void saveOps('notifications', { notify: { recipients: list } })
  }
  const saveSlackMessage = (text = slackMessage) => { if (text !== ops.slack.message) void saveOps('notifications', { slack: { message: text } }) }
  const setSlackFields = (fields: string[] | null) => { setSlackFieldsShown(fields); void saveOps('notifications', { slack: { fields } }).then(ok => { if (!ok) setSlackFieldsShown(JSON.parse(savedFields) as string[] | null) }) }
  const runSlackTest = async () => {
    setSlackTest({ busy: true })
    try {
      const r = await formsApi.slackTest(d.id)
      setSlackTest({ busy: false, ok: true, msg: `Posted to ${r.target}. Check Slack.` })
    } catch (err) { setSlackTest({ busy: false, ok: false, msg: (err as Error).message }) }
    loadLog()
  }

  // What each switch shows: saved state, or opened here while its details are filled in.
  const scheduleOn = !!(ops.opensAt || ops.closesAt) || !!opened.schedule
  const limitOn = ops.maxResponses !== null || !!opened.limit
  const closedMsgOn = (!!d.closedMessage.trim() && d.closedMessage !== DEFAULT_CLOSED_MESSAGE) || !!opened.closedMsg
  const passwordOn = ops.hasPassword || !!opened.password
  const slackOn = ops.slack.on || !!opened.slack
  const onceDefault: DuplicateMode = ops.access === 'restricted' ? 'account' : 'device'
  const noSender = sender === null && <Banner tone="gold" icon="alert" inline action={<Link href="/forms/settings#notifications" className="fb-btn fb-btn--sm">Choose one</Link>}>No sending account is chosen for Forms, so no email goes out yet. Attempts are logged below as not sent.</Banner>

  return (
    <div ref={scroller} className="fb-scroll fb-rise fb-settings" style={{ flex: 1, minHeight: 0, padding: '66px 32px 64px' }} data-testid="settings-tab">
      <nav aria-label="Settings sections" style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 170 }} className="fb-settings-nav" data-testid="settings-nav">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#settings-${id}`} onClick={e => { e.preventDefault(); jump(id) }} aria-current={here === id ? 'location' : undefined}
            style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--tx2)', textDecoration: 'none' }} className="fb-navlink" data-testid={`settings-nav-${id}`}>{label}</a>
        ))}
      </nav>
      <div className="fb-settings-main" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="fb-h1">Settings</h1>

        {card('general', <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <h2 id="settings-general-title" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>General</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5 }}>How the form is known inside Forms, and what respondents see at the top of the link.</p>
            </div>
            {status('general')}
          </div>
          {group('For your team', true, 'settings-general-team')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Internal name" hint="Shown in All forms instead of the title. Only your team sees it." htmlFor="st-name">
              <Input id="st-name" value={name} maxLength={120} placeholder={d.title} onChange={e => setName(e.target.value)} onBlur={() => { if (name !== d.name) void save('general', { name }) }} onKeyDown={onEnter(() => { if (name !== d.name) void save('general', { name }) })} data-testid="settings-name" />
            </Field>
            <Field label="Owner" hint="Gets the new-response email when no recipients are set." htmlFor="st-owner">
              <Input id="st-owner" type="email" value={owner} onChange={e => setOwner(e.target.value)} onBlur={() => { if (owner !== (d.owner ?? '')) void save('general', { owner: owner || null }) }} onKeyDown={onEnter(() => { if (owner !== (d.owner ?? '')) void save('general', { owner: owner || null }) })} data-testid="settings-owner" />
            </Field>
          </div>
          {group('What respondents see', false, 'settings-general-public')}
          <Field label="Public title" hint="The form’s title at the top of the link." htmlFor="st-title">
            <Input id="st-title" value={def.title} maxLength={300} onChange={e => api.mutate(x => ({ ...x, title: e.target.value }), { typing: true })} data-testid="settings-title" />
          </Field>
          <Field label="Description" hint="Shown in link previews (Slack, iMessage, email)." htmlFor="st-desc">
            <Textarea id="st-desc" rows={2} maxLength={500} value={def.settings.description} onChange={e => api.mutate(x => ({ ...x, settings: { ...x.settings, description: e.target.value } }), { typing: true })} data-testid="settings-description" />
          </Field>
          <Field label="Language" hint="Buttons, messages and errors respondents see." htmlFor="st-lang">
            <Select id="st-lang" value={def.settings.language} onChange={e => setLanguage(e.target.value as FormLanguage)} data-testid="settings-language" style={{ maxWidth: 320 }}>
              {FORM_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}{l.native !== l.name ? ` · ${l.native}` : ''}</option>)}
            </Select>
          </Field>
        </>)}

        {card('availability', <>
          {head('availability', 'Availability', 'Whether the link takes responses, from when, until when, and how many.', true)}
          <div className="fb-switches">
            <Toggle on={live && d.status !== 'closed'} disabled={!live} onChange={v => void save('availability', { acceptingResponses: v })} coral testId="settings-accept"
              label="Accept responses" sub={!live ? 'Publish first.' : d.status === 'closed' ? 'Off: visitors see the closed message.' : d.availability === 'scheduled' ? `On, from ${formatInZone(d.opensAt, ops.timezone)}.` : d.availability === 'closed' ? (d.closedReason === 'limit' ? 'On, but the response limit is reached.' : 'On, but the closing time has passed.') : 'On: the link takes new responses.'} />
            <Reveal on={scheduleOn} testId="settings-schedule" label="Schedule" sub="Open and close the link on set dates."
              onChange={v => { open('schedule', v); if (!v) void saveOps('availability', { opensAt: null, closesAt: null }) }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Opens" hint="Before this, visitors see when it opens." htmlFor="st-opens">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input id="st-opens" type="datetime-local" value={isoToZonedInput(ops.opensAt, ops.timezone)} onChange={e => setDate('opensAt', e.target.value)} data-testid="settings-opens" />
                    {ops.opensAt && <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Clear the opening time" onClick={() => setDate('opensAt', '')}><Icon name="x" size={13} /></button>}
                  </div>
                </Field>
                <Field label="Closes" hint="After this, visitors see the closed message." htmlFor="st-closes">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input id="st-closes" type="datetime-local" value={isoToZonedInput(ops.closesAt, ops.timezone)} onChange={e => setDate('closesAt', e.target.value)} data-testid="settings-closes" />
                    {ops.closesAt && <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Clear the closing time" onClick={() => setDate('closesAt', '')}><Icon name="x" size={13} /></button>}
                  </div>
                </Field>
                <Field label="Time zone" hint="The opening and closing times are in this zone." htmlFor="st-tz">
                  <Select id="st-tz" value={ops.timezone} onChange={e => void saveOps('availability', { timezone: e.target.value })} data-testid="settings-timezone">
                    {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                  </Select>
                </Field>
              </div>
            </Reveal>
            <Reveal on={limitOn} testId="settings-limit-switch" label="Response limit" sub="Close automatically after a number of responses."
              onChange={v => { open('limit', v); if (!v) { setLimit(''); void saveOps('availability', { maxResponses: null }) } }}>
              <Field label="Close after" hint={`${d.completedCount} so far.`} htmlFor="st-limit">
                <Input id="st-limit" type="number" min={1} inputMode="numeric" value={limit} placeholder="e.g. 100" onChange={e => setLimit(e.target.value)} onBlur={saveLimit} onKeyDown={onEnter(saveLimit)} data-testid="settings-limit" style={{ maxWidth: 200 }} />
              </Field>
            </Reveal>
            <Reveal on={closedMsgOn} testId="settings-closed-switch" label="Custom closed message" sub="Your own words for when the form is closed."
              onChange={v => { open('closedMsg', v); if (!v) { setClosedMsg(DEFAULT_CLOSED_MESSAGE); void save('availability', { closedMessage: '' }) } }}>
              <Field label="Closed message" hint="What visitors see when the form is closed — by hand, by date or by the limit. Off: a standard note in the form’s language." htmlFor="st-closed">
                <Textarea id="st-closed" rows={2} maxLength={2000} value={closedMsg} onChange={e => setClosedMsg(e.target.value)} onBlur={() => { if (closedMsg !== d.closedMessage) void save('availability', { closedMessage: closedMsg }) }} data-testid="settings-closed-message" />
              </Field>
            </Reveal>
          </div>
        </>)}

        {card('access', <>
          {head('access', 'Access', 'Who can open the form, and how often they can respond.', true)}
          <div className="fb-switches">
            <Toggle on={ops.access === 'restricted'} testId="settings-signin" label="Only signed-in people" sub="Respondents must be signed in to this portal first, and each response records who sent it."
              onChange={v => void saveOps('access', v ? { access: 'restricted' } : ops.duplicates === 'account' ? { access: 'public', duplicates: 'allow' } : { access: 'public' })} />
            <Reveal on={passwordOn} testId="settings-password-switch" label="Password" sub="Anyone opening the link enters it first."
              onChange={v => { open('password', v); if (!v) { setPassword(''); setChangingPw(false); void saveOps('access', { password: null }) } }}>
              {ops.hasPassword && !changingPw ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="settings-password-set">
                  <Tag tone="lime-bg"><Icon name="lock" size={12} /> Password set</Tag>
                  <Btn size="sm" onClick={() => setChangingPw(true)}>Change</Btn>
                  <span style={{ fontSize: 12, color: 'var(--mut2)' }}>It is never shown again after you set it.</span>
                </div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); if (password.length >= 4) void saveOps('access', { password }).then(ok => { if (ok) { setPassword(''); setChangingPw(false) } }) }} style={{ display: 'flex', gap: 8 }}>
                  <Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 4 characters" aria-label="Form password" data-testid="settings-password" />
                  <Btn type="submit" disabled={password.length < 4} testId="settings-password-save">{ops.hasPassword ? 'Change password' : 'Set password'}</Btn>
                  {changingPw && <Btn ghost onClick={() => { setChangingPw(false); setPassword('') }}>Cancel</Btn>}
                </form>
              )}
            </Reveal>
            <Reveal on={ops.duplicates !== 'allow'} testId="settings-once" label="One response each" sub="Stop the same person responding twice."
              onChange={v => void saveOps('access', { duplicates: v ? onceDefault : 'allow' })}>
              <Field label="Counted by" htmlFor="st-dup" hint={ops.duplicates === 'device' ? 'Stops a second response from the same browser. Someone determined can clear their browser to get round it.' : ops.duplicates === 'email' ? 'The form’s first email question can only be used once. A repeat is refused on that question.' : 'Each signed-in person responds once; they can come back to edit if editing is on.'}>
                <Select id="st-dup" value={ops.duplicates} onChange={e => void saveOps('access', { duplicates: e.target.value as DuplicateMode })} data-testid="settings-duplicates" style={{ maxWidth: 320 }}>
                  <option value="device">Device</option>
                  <option value="email">Email address</option>
                  <option value="account" disabled={ops.access !== 'restricted'}>Signed-in person{ops.access !== 'restricted' ? ' (needs sign-in access)' : ''}</option>
                </Select>
              </Field>
            </Reveal>
          </div>
        </>)}

        {card('behavior', <>
          {head('behavior', 'Form behavior', 'How respondents move through the form.', false)}
          <Field label="Progress">
            <Seg<ProgressStyle> label="Progress" value={def.settings.progress} onChange={v => api.updateSettings({ progress: v })} options={[{ value: 'bar', label: 'Bar' }, { value: 'pages', label: 'Page count' }, { value: 'stages', label: 'Stages' }, { value: 'none', label: 'None' }]} testId="settings-progress" />
          </Field>
          <div className="fb-switches">
            <Toggle on={def.settings.backButton} onChange={v => api.updateSettings({ backButton: v })} label="Back button" sub="Respondents can step back a page to change an answer." testId="settings-back" />
            <Toggle on={def.settings.saveResume} onChange={v => api.updateSettings({ saveResume: v })} label="Save and resume" sub="Answers are kept on the respondent’s device, so closing the tab doesn’t lose them. Off: every visit starts fresh." testId="settings-resume" />
            <Toggle on={def.settings.allowEdits} onChange={v => api.updateSettings({ allowEdits: v })} label="Let respondents edit their response" sub="After submitting they get a private link to change their answers (and it rides in the confirmation email). The response keeps its place; it’s marked Edited." testId="settings-edits" />
            <Toggle on={def.settings.honeypot} onChange={v => api.updateSettings({ honeypot: v })} label="Spam trap" sub="A hidden field bots fill in; those responses are marked spam." testId="settings-honeypot" />
          </div>
        </>)}

        {card('after', <>
          {head('after', 'After submission', def.endings.length > 1 ? `The default ending — the one respondents reach unless a rule sends them to another. The other ${def.endings.length - 1} ending${def.endings.length === 2 ? ' is' : 's are'} edited on the canvas.` : 'What respondents see once they submit.', false)}
          {ending ? (
            <>
              <Seg<'message' | 'redirect'> label="After submitting" value={ending.kind === 'redirect' ? 'redirect' : 'message'} onChange={v => api.updateEnding(ending.id, v === 'redirect' ? { kind: 'redirect' } : { kind: 'message' })} options={[{ value: 'message', label: 'Show a thank-you message', testId: 'settings-after-message' }, { value: 'redirect', label: 'Go to a web page', testId: 'settings-after-redirect' }]} />
              {ending.kind === 'redirect' ? (
                <Field label="Redirect to" hint="Respondents see a short thank-you, then land here." htmlFor="st-redirect">
                  <Input id="st-redirect" mono type="url" placeholder="https://" value={ending.redirectUrl} onChange={e => api.updateEnding(ending.id, { redirectUrl: e.target.value }, true)} data-testid="settings-redirect" />
                </Field>
              ) : (
                <>
                  <Field label="Thank-you title" htmlFor="st-thanks"><Input id="st-thanks" value={ending.title} onChange={e => api.updateEnding(ending.id, { title: e.target.value }, true)} data-testid="settings-thanks" /></Field>
                  <Field label="Message" htmlFor="st-thanks-body"><Textarea id="st-thanks-body" rows={2} value={ending.body} onChange={e => api.updateEnding(ending.id, { body: e.target.value }, true)} /></Field>
                  <Toggle on={ending.kind === 'restart'} onChange={v => api.updateEnding(ending.id, { kind: v ? 'restart' : 'message', buttonLabel: v ? (ending.buttonLabel || '') : ending.buttonLabel })} label="Offer to submit another response" sub="A button under the message starts the form again, blank." testId="settings-another" />
                </>
              )}
            </>
          ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--tx2)' }}>This form has no ending yet — add one on the canvas.</p>}
        </>)}

        {card('notifications', <>
          {head('notifications', 'Notifications', 'Who hears about a new response.', true)}
          <div className="fb-switches">
            <Reveal on={slackOn} testId="settings-slack" label="Post to Slack" sub="A message to a channel or a person when a response arrives."
              onChange={v => { open('slack', v); if (!v) void saveOps('notifications', { slack: { on: false } }); else if (ops.slack.target) void saveOps('notifications', { slack: { on: true } }) }}>
              <Field label="Post to">
                <SlackPicker value={ops.slack.target} onPick={target => void saveOps('notifications', { slack: { target, on: true } })} />
              </Field>
              {ops.slack.target && (
                <>
                  <Field label="Message" htmlFor="st-slack-message" hint={slackMessage.includes('{{') ? <>Reads as: {describeTemplate(slackMessage, def)}</> : <>The first line of the post. Empty uses “New response to <strong>{def.title || 'the form'}</strong>”.</>}>
                    <Textarea id="st-slack-message" rows={2} maxLength={1000} value={slackMessage} placeholder={`New response to ${def.title || 'the form'}`} onChange={e => setSlackMessage(e.target.value)} onBlur={() => saveSlackMessage()} data-testid="settings-slack-message" />
                  </Field>
                  {questions.some(b => b.type !== 'upload' && b.type !== 'signature') && (
                    <Select value="" onChange={e => { const id = e.target.value; e.target.value = ''; if (!id) return; const text = `${slackMessage}${slackMessage && !/\s$/.test(slackMessage) ? ' ' : ''}${answerToken(id)}`; setSlackMessage(text); saveSlackMessage(text) }} aria-label="Put an answer in the message" data-testid="settings-slack-insert" style={{ maxWidth: 320, marginTop: -6 }}>
                      <option value="">Put an answer in the message…</option>
                      {questions.filter(b => b.type !== 'upload' && b.type !== 'signature').map(b => <option key={b.id} value={b.id}>{b.label || componentDef(b.type).label}</option>)}
                    </Select>
                  )}
                  <Field label="Answers in the post">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="settings-slack-fields">
                      <Checkbox checked={slackFields === null} onChange={v => setSlackFields(v ? null : questions.map(b => b.id))} label="Every question, including ones added later" testId="settings-slack-all" />
                      {questions.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--mut2)' }}>This form has no questions yet.</span> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 14px', paddingLeft: 24, opacity: slackFields === null ? 0.55 : 1 }}>
                          {questions.map(b => {
                            const fields = slackFields
                            const checked = fields === null || fields.includes(b.id)
                            return (
                              <label key={b.id} className="fb-check" style={{ minWidth: 0 }}>
                                <input type="checkbox" checked={checked} disabled={fields === null} data-testid="settings-slack-field" data-block={b.id}
                                  onChange={e => setSlackFields(e.target.checked ? questions.map(q => q.id).filter(id => id === b.id || (fields ?? []).includes(id)) : (fields ?? []).filter(id => id !== b.id))} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label || componentDef(b.type).label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </Field>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Btn size="sm" icon="play" onClick={() => void runSlackTest()} disabled={slackTest.busy} testId="settings-slack-test">{slackTest.busy ? 'Posting…' : 'Send a test'}</Btn>
                    {slackTest.msg && <span role="status" style={{ fontSize: 12.5, fontWeight: 700, color: slackTest.ok ? 'var(--lime-tx)' : 'var(--coral-tx, var(--coral))' }} data-testid="settings-slack-test-result">{slackTest.msg}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--mut2)' }}>Posts as your Slack app. A private channel needs the app invited first. A changed response doesn’t post again.</span>
                </>
              )}
            </Reveal>
            <Reveal on={ops.notify.owner} testId="settings-notify-owner" label="Email the team" sub="Also when a respondent edits a response."
              onChange={v => void saveOps('notifications', { notify: { owner: v } })}>
              {noSender}
              {sender && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--tx2)' }}>Email goes out from <strong>{sender.email}</strong> (Forms › Settings).</p>}
              <Field label="Recipients" hint={`Email addresses, separated by commas. Empty sends to the owner${d.owner ? ` (${d.owner})` : ''}.`} htmlFor="st-recipients">
                <Input id="st-recipients" value={recipients} onChange={e => setRecipients(e.target.value)} onBlur={saveRecipients} onKeyDown={onEnter(saveRecipients)} placeholder={d.owner ?? 'you@example.com'} data-testid="settings-recipients" />
              </Field>
            </Reveal>
            <Reveal on={ops.notify.confirmation} testId="settings-notify-confirmation" label="Email the respondent a confirmation" sub="Goes to the form’s first email question, at most 3 a day per address."
              onChange={v => void saveOps('notifications', { notify: { confirmation: v } })}>
              {!ops.notify.owner && noSender}
              <Field label="Subject" hint="Empty uses “We got your response: <title>” in the form’s language." htmlFor="st-subject">
                <Input id="st-subject" value={subject} maxLength={200} onChange={e => setSubject(e.target.value)} onBlur={() => { if (subject !== ops.notify.subject) void saveOps('notifications', { notify: { subject } }) }} data-testid="settings-subject" />
              </Field>
              <Field label="Message" hint="Empty uses a short thank-you in the form’s language." htmlFor="st-message">
                <Textarea id="st-message" rows={3} maxLength={5000} value={message} onChange={e => setMessage(e.target.value)} onBlur={() => { if (message !== ops.notify.message) void saveOps('notifications', { notify: { message } }) }} data-testid="settings-message" />
              </Field>
              <Toggle on={ops.notify.includeAnswers} onChange={v => void saveOps('notifications', { notify: { includeAnswers: v } })} label="Include their answers" testId="settings-include-answers" />
            </Reveal>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1.5px solid var(--line2)' }} data-testid="settings-notify-log">
            <div className="fb-caps fb-caps--tx2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Recent notifications <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Refresh" onClick={loadLog}><Icon name="refresh" size={12} /></button></div>
            {!log ? null : log.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--mut2)' }}>Nothing yet. Each Slack post and email — sent, failed or not sent and why — is listed here.</span> : log.map(n => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }} data-testid="notify-log-row">
                <Tag tone={n.status === 'sent' ? 'lime-bg' : n.status === 'failed' ? 'coral' : 'neutral'}>{n.status === 'skipped' ? 'Not sent' : n.status === 'sent' ? 'Sent' : 'Failed'}</Tag>
                <span style={{ fontWeight: 700, flex: 'none' }}>{LOG_KIND[n.kind] ?? n.kind}</span>
                <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={n.detail || undefined}>{n.recipient || '—'}{n.detail ? ` · ${n.detail}` : ''}</span>
                <span className="fb-mono" style={{ fontSize: 11, color: 'var(--mut2)', flex: 'none' }}>{relativeTime(n.createdAt)}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}
