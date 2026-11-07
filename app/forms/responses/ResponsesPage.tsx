'use client'

// The one home for responses. The picker in the band says whose
// responses these are: All forms is every form's sent responses, newest first,
// unread until opened; a form is that form's, with Summary, filters and
// export. Either way the list sits beside the open response. A Slack or email
// link (?form=<id>&r=<response>) lands on that response.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlabSub, SlabTools } from '@/app/components/AppSlab'
import { usePhone } from '@/lib/phone/use-phone'
import { setJumpSub } from '@/lib/phone/place'
import { PhoneIcon } from '@/app/components/phone/icons'
import PhoneSheet from '@/app/components/phone/Sheet'
import { StatusTag as FormStateTag } from '../PhoneForms'
import { formsApi, type FormDetail, type FormSummary } from '@/lib/forms/api'
import { Btn, EmptyState, Menu, Skeleton, Tag, menuAnchor, useMediaQuery, type MenuAt, type MenuItem } from '../ui'
import { Icon } from '../ui/icons'
import { formLabel } from '../status'
import Inbox from './Inbox'
import FormResponses from './FormResponses'

// Whether the form is taking responses — unpublished edits are the builder's business, not this page's.
const STATE: Record<FormDetail['publishState'], { label: string; tone: 'lime' | 'neutral' | 'coral' }> = {
  live: { label: 'Live', tone: 'lime' }, dirty: { label: 'Live', tone: 'lime' }, closed: { label: 'Closed', tone: 'coral' }, draft: { label: 'Draft', tone: 'neutral' },
}

const newest = (a: FormSummary, b: FormSummary) => (b.lastResponseAt ?? '').localeCompare(a.lastResponseAt ?? '') || formLabel(a).localeCompare(formLabel(b))

export default function ResponsesPage() {
  const router = useRouter()
  const params = useSearchParams()
  const formId = params.get('form') ?? ''
  const initial = { response: params.get('r'), view: params.get('view') === 'summary' ? 'summary' as const : 'table' as const }
  const [forms, setForms] = useState<{ open: FormSummary[]; archived: FormSummary[] } | null>(null)
  const [detail, setDetail] = useState<FormDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const picker = useRef<HTMLButtonElement>(null)
  const phone = useMediaQuery('(max-width: 760px)')

  const loadForms = useCallback(() => {
    Promise.all([formsApi.list(), formsApi.list({ archived: true })])
      .then(([open, archived]) => setForms({ open: [...open].sort(newest), archived: [...archived].sort(newest) }))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    loadForms()
    window.addEventListener('gryd:forms-changed', loadForms)
    return () => window.removeEventListener('gryd:forms-changed', loadForms)
  }, [loadForms])

  const loadDetail = useCallback(() => {
    if (!formId) return
    formsApi.get(formId).then(d => { setDetail(d); setMissing(false) }).catch(() => setMissing(true))
  }, [formId])
  useEffect(() => { setDetail(null); setMissing(false); loadDetail() }, [loadDetail])

  const go = (id: string) => router.push(id ? `/forms/responses?form=${encodeURIComponent(id)}` : '/forms/responses')
  const unreadAll = useMemo(() => [...(forms?.open ?? []), ...(forms?.archived ?? [])].reduce((n, f) => n + f.unreadCount, 0), [forms])
  const pick = (f: FormSummary, archived: boolean): MenuItem => ({
    label: `${formLabel(f)}${f.unreadCount ? ` · ${f.unreadCount} new` : ''}`, icon: f.id === formId ? 'check' : archived ? 'archive' : undefined, run: () => go(f.id), testId: `responses-form-${f.id}`,
  })
  const items: MenuItem[] = [
    { label: `All forms${unreadAll ? ` · ${unreadAll} new` : ''}`, icon: formId ? 'inbox' : 'check', run: () => go(''), testId: 'responses-form-all' },
    ...(forms?.open.length ? [{ sep: true as const }, ...forms.open.map(f => pick(f, false))] : []),
    ...(forms?.archived.length ? [{ sep: true as const }, ...forms.archived.map(f => pick(f, true))] : []),
  ]
  const state = detail ? STATE[detail.publishState] : null
  // In the band it sits outside the Forms token scope, so it carries the scope itself.
  const pickerButton = (
    <button ref={picker} type="button" className="fb-rsp-picker" data-forms-root="" title="Show another form’s responses" aria-haspopup="menu" aria-expanded={!!menu}
      onClick={() => setMenu(menuAnchor(picker.current))} data-testid="responses-form">
      <span className="fb-rsp-picker__name">{!formId ? 'All forms' : detail ? formLabel(detail) : missing ? 'Form not found' : 'Loading…'}</span>
      {!formId && unreadAll > 0 && <Tag tone="gold-bg">{unreadAll} new</Tag>}
      {state && <Tag tone={state.tone} testId="responses-form-state">{state.label}</Tag>}
      {detail?.archivedAt && <Tag tone="neutral">Archived</Tag>}
      <Icon name="chevron-down" size={15} />
    </button>
  )

  // The phone layer (v2): the picker is the band's one control, as the Sales
  // board's page picker is; its menu is an action sheet. Whose responses these
  // are, and how many are new, is the Jump bar's second line.
  const phoneLayer = usePhone()
  const [pickOpen, setPickOpen] = useState(false)
  const [pickShut, setPickShut] = useState(false)
  const closePick = () => { setPickShut(true); setTimeout(() => setPickOpen(false), 300) }
  const pickRow = (f: FormSummary | null, archived = false) => {
    const current = f ? f.id === formId : !formId
    const n = f ? f.unreadCount : unreadAll
    return (
      <button key={f?.id ?? 'all'} type="button" className="ph-row" data-lead="none" aria-current={current || undefined}
        onClick={() => { closePick(); if (!current) go(f?.id ?? '') }} data-testid={f ? `responses-form-${f.id}` : 'responses-form-all'}
        style={{ background: current ? 'var(--inset)' : undefined }}>
        <span className="ph-row-main">
          <span className="ph-row-title" data-strong={current ? '' : undefined} style={{ display: 'block' }}>{f ? formLabel(f) : 'All forms'}</span>
          <span className="ph-row-sub" style={{ display: 'block' }}>{f ? `${f.completedCount} response${f.completedCount === 1 ? '' : 's'}${archived ? ' · archived' : ''}` : 'Every form’s sent responses, newest first'}</span>
        </span>
        <span className="ph-row-side">
          {f && !archived ? <FormStateTag f={f} /> : null}
          {n ? <span className="ph-tag" data-tone="over">{n} new</span> : null}
          {current ? <PhoneIcon name="check" size={17} /> : null}
        </span>
      </button>
    )
  }
  const formName = !formId ? 'All forms' : detail ? formLabel(detail) : missing ? 'Form not found' : 'Loading…'
  const newHere = !formId ? unreadAll : detail?.unreadCount ?? 0
  useEffect(() => {
    if (!phoneLayer) return
    setJumpSub('/forms/responses', `Responses · ${formName}${newHere ? ` · ${newHere} new` : ''}`)
    return () => setJumpSub('/forms/responses', null)
  }, [phoneLayer, formName, newHere])
  if (phoneLayer) return (
    <div className="ph-page" data-testid="forms-responses" style={{ display: 'flex', flexDirection: 'column' }}>
      <SlabSub>
        <button ref={picker} type="button" className="ph-btn" onClick={() => { setPickShut(false); setPickOpen(true) }} aria-haspopup="dialog" aria-expanded={pickOpen} title="Show another form’s responses" data-testid="responses-form"
          style={{ minHeight: 34, height: 34, maxWidth: '100%', padding: '0 8px 0 12px', fontSize: 13.5, borderRadius: '9px 9px 9px 2px', gap: 4, color: 'var(--tx)', background: 'var(--card)' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formName}</span><PhoneIcon name="chevron-down" size={15} style={{ flex: 'none' }} />
        </button>
      </SlabSub>
      {pickOpen ? (
        <PhoneSheet open={!pickShut} onClose={closePick} label="Show responses to" detents={['large']} initial="large" flush
          header={<div className="ph-sheet-head" style={{ gridTemplateColumns: 'minmax(0,1fr) 44px' }}><span className="ph-sheet-title">Show responses to</span><button type="button" className="ph-close" aria-label="Close" onClick={closePick}><PhoneIcon name="x" size={18} /></button></div>}>
          {pickRow(null)}
          {forms?.open.length ? <div className="ph-group-head" style={{ position: 'static' }}>Forms<span className="n">{forms.open.length}</span></div> : null}
          {(forms?.open ?? []).map(f => pickRow(f))}
          {forms?.archived.length ? <div className="ph-group-head" style={{ position: 'static' }}>Archived<span className="n">{forms.archived.length}</span></div> : null}
          {(forms?.archived ?? []).map(f => pickRow(f, true))}
          {!forms ? <div className="ph-empty">Reading your forms…</div> : null}
        </PhoneSheet>
      ) : null}
      {!formId ? <Inbox initial={initial.response} /> : missing ? (
        <div style={{ padding: 16 }}><EmptyState title="This form isn’t here any more." body="It may have been deleted. Its responses went with it." action={<Btn onClick={() => go('')}>All responses</Btn>} testId="responses-form-missing" /></div>
      ) : !detail ? <div className="ph-empty" aria-busy="true">Reading the form…</div> : (
        <FormResponses key={detail.id} form={detail} onChanged={loadDetail} initial={initial} />
      )}
    </div>
  )

  return (
    <div className="fb-rsp-page" data-testid="forms-responses">
      {phone ? <div className="fb-rsp-phonepick">{pickerButton}</div> : <SlabTools>{pickerButton}</SlabTools>}
      {menu && <Menu at={menu} items={items} onClose={() => setMenu(null)} label="Show responses to" returnFocusTo={picker.current} />}

      {!formId ? <Inbox initial={initial.response} /> : missing ? (
        <div className="fb-rsp"><EmptyState title="This form isn’t here any more." body="It may have been deleted. Its responses went with it." action={<Btn onClick={() => go('')}>All responses</Btn>} testId="responses-form-missing" /></div>
      ) : !detail ? (
        <div className="fb-rsp" aria-busy="true">
          <Skeleton width={520} height={36} />
          <div className="fb-rsp-panes">
            <section className="fb-rsp-card" style={{ padding: 18, gap: 18 }}>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} width={`${80 - i * 7}%`} />)}</section>
            <section className="fb-rsp-card fb-rsp-wide" style={{ padding: 24, gap: 18 }}><Skeleton width="40%" height={26} />{[0, 1, 2].map(i => <Skeleton key={i} width={`${70 - i * 10}%`} />)}</section>
          </div>
        </div>
      ) : (
        <FormResponses key={detail.id} form={detail} onChanged={loadDetail} initial={initial} />
      )}
    </div>
  )
}
