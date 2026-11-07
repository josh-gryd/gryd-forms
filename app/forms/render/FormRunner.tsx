'use client'

// The respondent's form. One component runs the public form, the embed and
// the builder's preview: pages in order, logic deciding what shows and where
// Continue goes, validation with the handoff copy, uploads, local + server
// autosave, an idempotent submit and the ending. What differs is injected:
// the transport (real or none), the device (measured or forced) and storage.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  evaluate, visiblePages, visibleBlocks, nextPageId, pagePath, applySetValues, validatePage, stripInactive, isBlockRequired, isInputBlock, componentDef, blockSettings, rowsOf, themeStyles, renderTemplate, DISPLAY_ONLY,
  uiFor, errorsFor, withLanguage, isStockThanks, errorTones,
  type FormDefinition, type Page, type Block, type Ending, type AnswerMap, type AnswerValue, type LogicState, type Theme, type ThemeStyles, type UiCatalog,
} from '@/lib/forms-core/index'
import { INPUT_RENDERERS, DISPLAY_RENDERERS, ARIA_REQUIRED, RunnerLangContext, ERROR_TEXT, type Device } from './registry'
import { useUploads, type UploadTransport, type UploadControllerEx } from './uploads'
import { readDraft, writeDraft, clearDraft } from './session'
import { Icon } from '../ui/icons'

export interface DraftSavePayload { token: string | null; answers: AnswerMap; currentPageId: string; pagesVisited: string[] }
export interface SubmitPayload { token: string | null; idempotencyKey: string; answers: AnswerMap; pagesVisited: string[]; website: string }
export interface RunnerTransport {
  saveDraft?: (p: DraftSavePayload) => Promise<{ token: string | null; completed?: boolean } | null>
  /** `editToken` comes back once, from a first submit on a form that allows edits. */
  submit: (p: SubmitPayload) => Promise<{ submissionId: string; endingId: string; duplicate?: boolean; editToken?: string | null }>
  uploads: UploadTransport | null
  /** A word from the server as the respondent leaves a page (a form taking one response per email
   *  address): errors to show, on `pageId`, before they answer the rest. Null goes on; so does any
   *  failure, because the submit still decides. */
  checkPage?: (p: { pageId: string; answers: AnswerMap }) => Promise<{ errors: Record<string, string>; pageId: string | null } | null>
}

export interface FormRunnerProps {
  def: FormDefinition
  mode: 'preview' | 'live'
  transport: RunnerTransport
  device?: Device
  storageKey?: string
  hiddenValues?: Record<string, string>
  embed?: boolean
  restartKey?: number
  /** The page carried this session onto a newer version of the form: say so (and how many answers no longer fit). */
  notice?: { dropped: number } | null
  /** This session is on a version the form has since replaced (still accepted): the resume banner says so, and
   *  Start over (the parent hears the `restart` event) moves the respondent to the current version. */
  olderVersion?: boolean
  /** Changing a response already sent (the respondent's edit link): starts from its answers, keeps nothing on the device. */
  editing?: { answers: AnswerMap } | null
  /** The form takes one response per person or device: no "submit another". */
  oneResponse?: boolean
  /** A line under a question that comes from the form's rules, not its author (one response per email address). */
  fieldNotes?: Record<string, string>
  onEvent?: (e: { type: 'page'; pageId: string } | { type: 'submitted'; endingId: string; editToken?: string | null } | { type: 'restart' }) => void
}

/** Why a submit did not go through — each says only what is true. */
type Failure = 'network' | 'busy' | 'moved' | 'closed' | 'gone' | 'duplicate' | 'locked' | 'signin' | 'notOpen' | 'editGone'
const FAILURE_ACTION: Record<Failure, 'retry' | 'reload' | null> = { network: 'retry', busy: 'retry', moved: 'reload', closed: null, gone: null, duplicate: null, locked: 'reload', signin: 'reload', notOpen: null, editGone: null }
function failureCopy(ui: UiCatalog, f: Failure): { title: string; body: string } {
  return f === 'editGone' ? { title: ui.editUnavailable, body: '' } : ui.failures[f]
}

function newKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

const GROUP_TYPES = new Set(['choice', 'checks', 'picture', 'yesno', 'rating', 'scale', 'ranking', 'matrix', 'daterange', 'signature'])

function useDevice(forced?: Device): Device {
  const [d, setD] = useState<Device>(forced ?? 'desktop')
  useEffect(() => {
    if (forced) { setD(forced); return }
    const phone = window.matchMedia('(max-width: 599px)'), tablet = window.matchMedia('(max-width: 1023px)')
    const fit = () => setD(phone.matches ? 'phone' : tablet.matches ? 'tablet' : 'desktop')
    fit()
    phone.addEventListener('change', fit); tablet.addEventListener('change', fit)
    return () => { phone.removeEventListener('change', fit); tablet.removeEventListener('change', fit) }
  }, [forced])
  return d
}

function hiddenAnswers(def: FormDefinition, values: Record<string, string> | undefined): AnswerMap {
  const out: AnswerMap = {}
  for (const p of def.pages) for (const b of p.blocks) {
    if (b.type !== 'hidden') continue
    const s = blockSettings<{ paramName: string; defaultValue: string }>(b)
    const v = s.paramName && values && values[s.paramName] !== undefined ? values[s.paramName] : s.defaultValue
    if (v) out[b.id] = String(v).slice(0, 2000)
  }
  return out
}

export function pagePadding(device: Device, embed: boolean): string {
  if (embed) return device === 'phone' ? '12px 10px 24px' : '20px 16px 32px'
  return device === 'phone' ? '20px 14px 40px' : device === 'tablet' ? '40px 28px' : '56px 24px 72px'
}

export function FormRunner({ def, mode, transport, device: forcedDevice, storageKey: storageKeyProp, hiddenValues, embed = false, restartKey = 0, notice = null, olderVersion = false, editing = null, oneResponse = false, fieldNotes, onEvent }: FormRunnerProps) {
  const device = useDevice(forcedDevice)
  const theme = def.theme
  const lang = def.settings.language
  const ui = uiFor(lang)
  // Save and resume off, or changing a sent response: nothing is kept on the device.
  const storageKey = editing || def.settings.saveResume === false ? undefined : storageKeyProp
  const T = useMemo(() => themeStyles(theme), [theme])
  const cover = def.pages.find(p => p.kind === 'cover') ?? null
  const firstAnswerPage = () => visiblePages(def, evaluate(def, {}))[0]?.id ?? def.pages[0]?.id ?? ''

  const [answers, setAnswers] = useState<AnswerMap>(() => (editing ? { ...editing.answers } : hiddenAnswers(def, hiddenValues)))
  // Always from the beginning — the preview included — so nothing can reach an
  // ending past a page it never showed (QA 2026-09-24: preview opened on page 2).
  const [pageId, setPageId] = useState<string>(() => (cover ? cover.id : firstAnswerPage()))
  const [visited, setVisited] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorTick, setErrorTick] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [waitingOnline, setWaitingOnline] = useState(false)
  const [offline, setOffline] = useState(false)
  const [done, setDone] = useState<{ endingId: string; editToken?: string | null } | null>(null)
  const [resumed, setResumed] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(!!notice)
  // Bumped when the server hands back the resume token, so it is written to this
  // device right away — not only at the next keystroke. A refresh in between used
  // to start a second session and leave the first as a stray partial.
  const [tokenTick, setTokenTick] = useState(0)
  const tokenRef = useRef<string | null>(null)
  const idemRef = useRef<string>('')
  // Draft saves run one after another so the resume token from the first
  // reaches the second; a fast respondent must never spawn two partial rows.
  const draftQueue = useRef<Promise<void>>(Promise.resolve())
  const rootRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)
  const [btnWidth, setBtnWidth] = useState<number | null>(null)
  const answersRef = useRef(answers)
  answersRef.current = answers
  // Nothing is stored for a visitor who has not done anything yet: an empty session
  // must never look newer than a real one the page is about to resume.
  const touched = useRef(false)

  // ── Local draft: restore once, mirror on every change ─────────────────
  useEffect(() => {
    if (mode !== 'live') { idemRef.current = newKey(); return }
    const d = readDraft(storageKey)
    if (d && d.answers && Object.keys(d.answers).length) {
      setAnswers({ ...d.answers, ...hiddenAnswers(def, hiddenValues) })
      if (def.pages.some(p => p.id === d.pageId)) setPageId(d.pageId)
      setVisited(Array.isArray(d.visited) ? d.visited.filter(id => def.pages.some(p => p.id === id)) : [])
      tokenRef.current = d.token ?? null
      idemRef.current = d.idempotencyKey || newKey()
      touched.current = true
      setResumed(true)
    } else idemRef.current = newKey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  useEffect(() => {
    if (mode !== 'live' || done || !touched.current) return
    writeDraft(storageKey, { v: 1, answers, pageId, visited, token: tokenRef.current, idempotencyKey: idemRef.current, at: Date.now() })
  }, [answers, pageId, visited, mode, storageKey, done, tokenTick])

  useEffect(() => {
    if (restartKey === 0) return
    restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey])

  // ── Online / offline ───────────────────────────────────────────────────
  useEffect(() => {
    const on = () => { setOffline(false) }
    const off = () => setOffline(true)
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ── Embed: report height to the host page ──────────────────────────────
  useEffect(() => {
    if (!embed || !rootRef.current || typeof ResizeObserver === 'undefined' || window.parent === window) return
    // `gryd: 'forms'` keeps snippets pasted before 09-29 resizing: they listened for it.
    const ro = new ResizeObserver(() => { const h = rootRef.current?.offsetHeight ?? 0; window.parent.postMessage({ source: 'gryd-forms', gryd: 'forms', type: 'height', height: h }, '*') })
    ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [embed])

  const state: LogicState = useMemo(() => evaluate(def, answers), [def, answers])
  const pages = useMemo(() => visiblePages(def, state), [def, state])
  const page: Page | null = def.pages.find(p => p.id === pageId) ?? null
  const onCover = !!page && page.kind === 'cover'
  const pageIndex = pages.findIndex(p => p.id === pageId)

  // A page hidden by an answer given earlier: step to the next visible one.
  useEffect(() => {
    if (done || !page || onCover) return
    if (state.hiddenPages.has(page.id)) {
      const prev = [...visited].reverse().find(id => pages.some(p => p.id === id))
      const next = pages.find(p => def.pages.indexOf(p) > def.pages.indexOf(page)) ?? pages[0]
      const target = next ?? prev
      if (target) setPageId(typeof target === 'string' ? target : target.id)
    }
  }, [state, page, pages, visited, def.pages, done, onCover])

  const setAnswer = useCallback((id: string, v: AnswerValue) => {
    touched.current = true
    setAnswers(a => ({ ...a, [id]: v }))
    setErrors(e => { if (!(id in e)) return e; const n = { ...e }; delete n[id]; return n })
  }, [])
  const getValue = useCallback((id: string) => answersRef.current[id], [])
  const fieldError = useCallback((id: string, message: string) => { setErrors(e => ({ ...e, [id]: message })); setErrorTick(t => t + 1) }, [])
  const uploads: UploadControllerEx = useUploads(mode === 'live' ? transport.uploads : null, getValue, setAnswer, fieldError, lang)

  const focusFirst = useCallback((invalidId?: string) => {
    requestAnimationFrame(() => {
      const root = pageRef.current
      if (!root) return
      if (invalidId) {
        const el = document.getElementById(`in-${invalidId}`) ?? root.querySelector<HTMLElement>(`[data-anchor="${invalidId}"] input, [data-anchor="${invalidId}"] select, [data-anchor="${invalidId}"] textarea, [data-anchor="${invalidId}"] button, [data-anchor="${invalidId}"] [tabindex]`)
        el?.focus()
        return
      }
      const first = root.querySelector<HTMLElement>('h1, h2, input:not([type=hidden]):not([tabindex="-1"]), select, textarea, button[role=radio], [role=switch]')
      if (first) { if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(first.tagName)) first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }) }
    })
  }, [])

  const scrollTop = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const scroller = el.closest<HTMLElement>('[data-runner-scroll]')
    if (scroller) scroller.scrollTo({ top: 0 })
    else window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 8) })
  }, [])

  const goTo = useCallback((id: string, direction: 'fwd' | 'back') => {
    setDir(direction)
    setPageId(id)
    setErrors({})
    setFailure(null)
    onEvent?.({ type: 'page', pageId: id })
    requestAnimationFrame(() => { scrollTop(); focusFirst() })
  }, [onEvent, scrollTop, focusFirst])

  const blurValidate = useCallback((block: Block) => {
    const v = answersRef.current[block.id]
    if (componentDef(block.type).isEmpty(v)) return
    const effective: Block = { ...block, required: isBlockRequired(block, state) }
    const msg = withLanguage(lang, () => componentDef(block.type).validate(effective, v, { fileStatus: () => ({ status: 'uploaded' }) }))
    // Blur only ever adds an error. Changing the answer is what clears one (setAnswer), so an
    // error the server raised stays until it is dealt with — and clicking Submit, which blurs
    // the field first, can't shrink the summary above the button and make the click miss.
    if (msg) setErrors(e => (e[block.id] === msg ? e : { ...e, [block.id]: msg }))
  }, [state, lang])

  const validateCurrent = useCallback((): { ok: boolean; firstInvalid?: string } => {
    if (!page) return { ok: false }
    const errs = validatePage(def, page, answersRef.current, state, { fileStatus: () => ({ status: 'uploaded' }) })
    for (const b of visibleBlocks(page, state)) {
      if (b.type !== 'upload') continue
      if (uploads.busy(b.id)) errs[b.id] = errorsFor(lang).uploadBusy
      else if (uploads.failed(b.id)) errs[b.id] = errorsFor(lang).uploadFailed
    }
    setErrors(errs)
    const ids = Object.keys(errs)
    if (ids.length) { setErrorTick(t => t + 1); return { ok: false, firstInvalid: page.blocks.find(b => ids.includes(b.id))?.id } }
    return { ok: true }
  }, [page, def, state, uploads, lang])

  /** Show `errs` on page `targetId`, going back to it when it is not the one on screen. */
  const showErrorsOn = useCallback((targetId: string, errs: Record<string, string>) => {
    const target = def.pages.find(p => p.id === targetId) ?? page
    if (!target) return
    if (target.id !== pageId) {
      const at = visited.indexOf(target.id)
      setVisited(at >= 0 ? visited.slice(0, at) : [])
      setDir('back'); setPageId(target.id); setFailure(null)
      onEvent?.({ type: 'page', pageId: target.id })
    }
    setErrors(errs); setErrorTick(t => t + 1)
    const firstInvalid = target.blocks.find(b => b.id in errs)?.id
    requestAnimationFrame(() => { scrollTop(); pageRef.current?.querySelector<HTMLElement>('[data-error-summary]')?.focus(); setTimeout(() => focusFirst(firstInvalid), 60) })
  }, [def.pages, page, pageId, visited, onEvent, scrollTop, focusFirst])

  const doSubmit = useCallback(async () => {
    if (!page) return
    // Every page on the respondent's path must pass, exactly as the server
    // checks it: a preview or a resumed session can never reach an ending past
    // a required question it skipped (QA 2026-09-24).
    const withSet = applySetValues(def, answersRef.current, state)
    const st = evaluate(def, withSet)
    for (const p of pagePath(def, st)) {
      const errs = validatePage(def, p, withSet, st, { fileStatus: () => ({ status: 'uploaded' }) })
      if (Object.keys(errs).length) { showErrorsOn(p.id, errs); return }
    }
    setSubmitting(true); setFailure(null)
    if (submitBtnRef.current) setBtnWidth(submitBtnRef.current.offsetWidth)
    const active = stripInactive(def, withSet, st)
    const website = (rootRef.current?.querySelector<HTMLInputElement>('input[name="website"]')?.value) ?? ''
    await draftQueue.current
    try {
      const res = await transport.submit({ token: tokenRef.current, idempotencyKey: idemRef.current, answers: active, pagesVisited: [...visited, page.id], website })
      setDone({ endingId: res.endingId || st.endingId, editToken: res.editToken ?? null })
      clearDraft(storageKey)
      setWaitingOnline(false)
      onEvent?.({ type: 'submitted', endingId: res.endingId || st.endingId, editToken: res.editToken ?? null })
      // Lets a host (a video player holding playback on this form) move on. No answers leave the frame.
      if (embed && window.parent !== window) window.parent.postMessage({ source: 'gryd-forms', gryd: 'forms', type: 'submitted', endingId: res.endingId || st.endingId }, '*')
    } catch (err) {
      // Say only what is true: the server's own field errors go on their fields;
      // a closed or retired form says so; only a network failure promises a retry.
      const e = err as { status?: number; body?: Record<string, unknown> }
      const off = typeof navigator !== 'undefined' && navigator.onLine === false
      const fieldErrors = e.body && typeof e.body.errors === 'object' && e.body.errors ? e.body.errors as Record<string, string> : null
      if (e.status === 422 && fieldErrors && Object.keys(fieldErrors).length) showErrorsOn(typeof e.body?.pageId === 'string' ? e.body.pageId : page.id, fieldErrors)
      else if (e.status === 410) setFailure('closed')
      else if (editing && (e.body?.editsOff || e.body?.editGone)) setFailure('editGone')
      else if (e.status === 404) setFailure('gone')
      else if (e.status === 409 && e.body?.versionChanged) setFailure('moved')
      else if (e.status === 409 && e.body?.duplicate) setFailure('duplicate')
      else if (e.status === 403 && e.body?.locked) setFailure('locked')
      else if (e.status === 403 && e.body?.notOpen) setFailure('notOpen')
      else if (e.status === 401 && e.body?.signin) setFailure('signin')
      else if (e.status === 429) setFailure('busy')
      else if (off) setWaitingOnline(true)
      else setFailure('network')
    } finally { setSubmitting(false) }
  }, [page, def, state, transport, visited, storageKey, onEvent, showErrorsOn, editing])

  // Held submit: retry when the connection is back.
  useEffect(() => { if (waitingOnline && !offline && !submitting && !done) void doSubmit() }, [waitingOnline, offline, submitting, done, doSubmit])

  const advance = useCallback(async () => {
    if (!page || submitting || checking) return
    if (onCover) { const first = pages[0]; if (first) { setVisited(v => [...v, page.id]); goTo(first.id, 'fwd') } return }
    const v = validateCurrent()
    if (!v.ok) {
      requestAnimationFrame(() => { pageRef.current?.querySelector<HTMLElement>('[data-error-summary]')?.focus(); setTimeout(() => focusFirst(v.firstInvalid), 60) })
      return
    }
    const withSet = applySetValues(def, answersRef.current, state)
    if (withSet !== answersRef.current) setAnswers(withSet)
    const st = evaluate(def, withSet)
    const next = nextPageId(def, st, page.id)
    if (next) {
      if (mode === 'live' && transport.checkPage) {
        setChecking(true)
        const said = await transport.checkPage({ pageId: page.id, answers: stripInactive(def, withSet, st) }).catch(() => null)
        setChecking(false)
        if (said && Object.keys(said.errors).length) { showErrorsOn(said.pageId ?? page.id, said.errors); return }
      }
      const nextVisited = [...visited, page.id]
      setVisited(nextVisited)
      if (mode === 'live' && transport.saveDraft) {
        const answersNow = stripInactive(def, withSet, st)
        draftQueue.current = draftQueue.current.then(() => transport.saveDraft!({ token: tokenRef.current, answers: answersNow, currentPageId: next, pagesVisited: nextVisited })).then(r => { if (r?.token) { tokenRef.current = r.token; setTokenTick(t => t + 1) } }).catch(() => undefined)
      }
      goTo(next, 'fwd')
      return
    }
    void doSubmit()
  }, [page, submitting, checking, onCover, pages, goTo, validateCurrent, focusFirst, def, state, visited, mode, transport, doSubmit, showErrorsOn])

  const back = useCallback(() => {
    if (!visited.length) return
    const stack = [...visited]
    let prev = stack.pop()
    while (prev && !def.pages.some(p => p.id === prev && (p.kind === 'cover' || pages.some(v => v.id === prev)))) prev = stack.pop()
    if (!prev) return
    setVisited(stack)
    goTo(prev, 'back')
  }, [visited, def.pages, pages, goTo])

  const restart = useCallback(() => {
    touched.current = false
    setAnswers(editing ? { ...editing.answers } : hiddenAnswers(def, hiddenValues)); setVisited([]); setErrors({}); setDone(null); setFailure(null); setWaitingOnline(false); setResumed(false); setNoticeOpen(false)
    tokenRef.current = null; idemRef.current = newKey()
    clearDraft(storageKey)
    const first = cover ? cover.id : (visiblePages(def, evaluate(def, {}))[0]?.id ?? def.pages[0]?.id ?? '')
    setDir('back'); setPageId(first)
    onEvent?.({ type: 'restart' })
    requestAnimationFrame(() => { scrollTop(); focusFirst() })
  }, [def, hiddenValues, storageKey, cover, onEvent, scrollTop, focusFirst, editing])

  // ── Progress ───────────────────────────────────────────────────────────
  const progressMode = def.settings.progress
  const totalPages = pages.length
  const showProgress = !onCover && !done && progressMode !== 'none' && totalPages > 1
  const progressPct = totalPages > 0 ? Math.round(((pageIndex + 1) / (totalPages + 1)) * 100) : 0
  const progressText = ui.pageOf(Math.max(1, pageIndex + 1), totalPages)
  const stages = useMemo(() => { const out: string[] = []; for (const p of pages) { const s = p.stage.trim(); if (s && !out.includes(s)) out.push(s) } return out }, [pages])
  const currentStage = page?.stage.trim() || ''

  const errorIds = page ? visibleBlocks(page, state).filter(b => errors[b.id]).map(b => b.id) : []
  const isLast = !onCover && !!page && nextPageId(def, state, page.id) === null
  const btnLabel = onCover ? (page?.buttonLabel || ui.start) : isLast && editing ? ui.saveChanges : (page?.buttonLabel || (isLast ? ui.submit : ui.continue))
  const showBack = def.settings.backButton !== false
  const contentPad = T.pad - (device === 'phone' ? 16 : 0)
  const pad = pagePadding(device, embed)

  const ending: Ending | null = done ? (def.endings.find(e => e.id === done.endingId) ?? def.endings[0] ?? null) : null

  const renderBlock = (block: Block, rowDescPad: string | null) => {
    const desc = renderTemplate(block.description, def, answers)
    const label = renderTemplate(block.label, def, answers)
    if (!isInputBlock(block)) {
      const D = DISPLAY_RENDERERS[block.type]
      if (!D) return null
      return <D block={block} theme={theme} T={T} mode="live" device={device} text={label} description={desc} headingId={`hd-${block.id}`} />
    }
    const R = INPUT_RENDERERS[block.type]
    if (!R) return null
    const inputId = `in-${block.id}`, labelId = `lb-${block.id}`, descId = `ds-${block.id}`, errId = `er-${block.id}`, noteId = `nt-${block.id}`
    const err = errors[block.id]
    const note = fieldNotes?.[block.id]
    const required = isBlockRequired(block, state)
    const describedBy = [desc ? descId : '', note ? noteId : '', err ? errId : ''].filter(Boolean).join(' ') || undefined
    const group = GROUP_TYPES.has(block.type)
    const LabelTag = group ? 'div' : 'label'
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <LabelTag id={labelId} {...(group ? {} : { htmlFor: inputId })} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 15, fontWeight: 800, lineHeight: 1.4, color: theme.text }}>
            <span style={{ flex: 1, textWrap: 'pretty' } as React.CSSProperties}>
              {label}
              {/* Required questions say so before anyone presses Continue (QA 2026-09-24): a star after
                  the label, as respondents expect from Fillout and Typeform. The star
                  is drawn only; screen readers hear "required" from aria-required on the control, or
                  from the hidden word where the control can't carry it (checkbox groups, uploads…). */}
              {required && <RequiredMark announce={!ARIA_REQUIRED.has(block.type)} word={ui.required} color={theme.star} />}
            </span>
          </LabelTag>
          {desc && <p id={descId} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: theme.muted }}>{desc}</p>}
          {note && <p id={noteId} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 700, color: theme.muted }} data-testid="field-note">{note}</p>}
          {!desc && rowDescPad && device !== 'phone' && <p aria-hidden="true" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, visibility: 'hidden', textWrap: 'pretty' } as React.CSSProperties}>{rowDescPad}</p>}
        </div>
        <Shake active={!!err} tick={errorTick}>
          <R block={block} value={answers[block.id]} onChange={v => setAnswer(block.id, v)} onBlur={() => blurValidate(block)} onEnter={advance} invalid={!!err} required={required} inputId={inputId} labelId={labelId} describedBy={describedBy} theme={theme} T={T} mode="live" device={device} uploads={uploads} />
        </Shake>
        {err && <p id={errId} role="alert" className="fb-rise" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: ERROR_TEXT, fontFamily: 'var(--font-body)' }}><Icon name="alert" size={14} /> {err}</p>}
      </>
    )
  }

  const renderRows = (blocks: Block[]) => rowsOf(blocks.filter(b => b.type !== 'hidden' && b.type !== 'slot')).map(row => {
    const longest = row.blocks.length > 1 ? row.blocks.filter(isInputBlock).map(b => renderTemplate(b.description, def, answers)).sort((a, b) => b.length - a.length)[0] || null : null
    return (
      <div key={row.id} style={{ display: 'flex', gap: T.gap, flexWrap: 'wrap' }}>
        {row.blocks.map(b => (
          <div key={b.id} data-anchor={b.id} style={{ flex: device === 'phone' || b.width === 'full' ? '1 1 100%' : b.width === 'half' ? `1 1 calc(50% - ${T.gap / 2}px)` : `1 1 calc(33.333% - ${(2 * T.gap) / 3}px)`, minWidth: device === 'phone' ? '100%' : 180, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {renderBlock(b, longest)}
          </div>
        ))}
      </div>
    )
  })

  // Theme-aware focus ring and error colours for the controls (forms.css [data-runner]).
  const tones = errorTones(theme)
  const runnerVars = { '--fr-focus': theme.text, '--fr-error': tones.text, '--fr-error-line': tones.line } as React.CSSProperties
  const card: React.CSSProperties = { ...T.container, padding: contentPad, display: 'flex', flexDirection: 'column', gap: T.gap, textAlign: theme.align, position: 'relative' }
  const primaryBtn: React.CSSProperties = { height: device === 'phone' ? 48 : 46, padding: '0 24px', fontFamily: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...T.button, transition: 'transform .12s, box-shadow .12s', width: device === 'phone' ? '100%' : undefined }

  return (
    <RunnerLangContext.Provider value={lang}>
    <div ref={rootRef} data-runner="" data-device={device} lang={lang} style={{ ...runnerVars, minHeight: embed ? undefined : '100%', background: theme.bg, backgroundImage: T.bgImage, backgroundSize: '22px 22px', fontFamily: T.font, color: theme.text, display: 'flex', flexDirection: 'column' }}>
      {offline && <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 16px', background: 'var(--gold)', color: 'var(--on-accent)', borderBottom: `2px solid ${theme.line}`, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)' }}><Icon name="wifi-off" size={15} /> {ui.offline}</div>}
      <div style={{ flex: 1, padding: pad }}>
        <div style={{ margin: '0 auto', maxWidth: theme.width, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {notice && noticeOpen && !done && (
            <div role="status" className="fb-rise" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `2px solid ${theme.line}`, borderRadius: theme.radius, background: theme.content, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)' }} data-testid="version-notice">
              <Icon name="refresh" size={14} />
              <span style={{ flex: 1 }}>{ui.versionNotice(notice.dropped)}</span>
              <button type="button" aria-label={ui.dismiss} onClick={() => setNoticeOpen(false)} style={{ width: 26, height: 26, border: 0, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 6 }}><Icon name="x" size={14} /></button>
            </div>
          )}
          {resumed && !done && !(notice && noticeOpen) && (
            <div role="status" className="fb-rise" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `2px solid ${theme.line}`, borderRadius: theme.radius, background: theme.content, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)' }} data-testid="resume-banner">
              <Icon name="refresh" size={14} /><span style={{ flex: 1 }}>{olderVersion ? ui.resumedOlder : ui.resumed}</span>
              <button type="button" onClick={restart} data-testid="resume-start-over" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 800, textDecoration: 'underline', textDecorationThickness: 2, cursor: 'pointer', color: 'inherit', flex: 'none' }}>{olderVersion ? ui.startOverNew : ui.startOver}</button>
              <button type="button" aria-label={ui.dismiss} onClick={() => setResumed(false)} style={{ width: 26, height: 26, border: 0, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 6 }}><Icon name="x" size={14} /></button>
            </div>
          )}
          {(showProgress || (theme.logo && !done && !onCover)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
              {theme.logo && theme.logoUrl ? <img src={theme.logoUrl} alt="" style={{ height: 28, maxWidth: 120, objectFit: 'contain', flex: 'none' }} /> : null}
              {showProgress && progressMode === 'stages' && stages.length > 0 ? (
                <ol aria-label={ui.progress} style={{ display: 'flex', gap: 6, margin: 0, padding: 0, listStyle: 'none', flexWrap: 'wrap', flex: 1 }}>
                  {stages.map((s, i) => { const cur = s === currentStage; const past = stages.indexOf(currentStage) > i; return <li key={s} aria-current={cur ? 'step' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 12, border: `1.5px solid ${theme.line}`, background: cur ? theme.primary : past ? theme.content : 'transparent', color: cur ? T.onPrimary : theme.muted, fontSize: 12, fontWeight: 700 }}>{past && <Icon name="check" size={12} />}{s}</li> })}
                </ol>
              ) : showProgress ? (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.muted, whiteSpace: 'nowrap' }}>{progressText}</span>
                  {progressMode === 'bar' && <div role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={progressText} aria-label={ui.formProgress} style={{ flex: 1, height: 8, border: `1.5px solid ${theme.line}`, borderRadius: 6, background: theme.content, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progressPct}%`, background: theme.primary, transition: 'width .36s cubic-bezier(.32,.72,0,1)' }} /></div>}
                </>
              ) : null}
            </div>
          )}

          {!done && page && (
            <div key={page.id} ref={pageRef} role="form" aria-label={page.name} className={dir === 'fwd' ? 'fb-page-fwd' : 'fb-page-back'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'file') { const t = e.target as HTMLInputElement; if (['radio', 'checkbox'].includes(t.type)) return; e.preventDefault(); void advance() } }} style={card} data-testid="form-page">
              {errorIds.length > 0 && (
                <div role="alert" tabIndex={-1} data-error-summary="" className="fb-rise" style={{ display: 'flex', gap: 10, padding: '12px 14px', border: '2px solid var(--coral)', borderRadius: theme.radius, background: 'var(--coral-bg)', color: 'var(--coral-tx)', fontFamily: 'var(--font-body)', outlineOffset: 2 }}>
                  <span style={{ flex: 'none', marginTop: 1 }}><Icon name="alert" size={16} /></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.45 }}>
                    <strong>{ui.errorsSummary(errorIds.length)}</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      {errorIds.map(id => { const b = page.blocks.find(x => x.id === id)!; return <a key={id} href={`#in-${id}`} onClick={e => { e.preventDefault(); focusFirst(id) }} style={{ fontWeight: 700, color: 'var(--coral-tx)' }}>{renderTemplate(b.label, def, answers) || componentDef(b.type).label}</a> })}
                    </div>
                  </div>
                </div>
              )}
              {failure && (
                <div role="alert" className="fb-rise" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', border: '2px solid var(--coral)', borderRadius: theme.radius, background: 'var(--coral-bg)', color: 'var(--coral-tx)', fontFamily: 'var(--font-body)' }} data-testid="submit-failed" data-failure={failure}>
                  <span style={{ flex: 'none', marginTop: 1 }}><Icon name="alert" size={16} /></span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.45 }}><strong>{failureCopy(ui, failure).title}</strong>{failureCopy(ui, failure).body && <span>{failureCopy(ui, failure).body}</span>}</div>
                  {FAILURE_ACTION[failure] && (
                    <button type="button" onClick={() => { if (FAILURE_ACTION[failure] === 'reload') window.location.reload(); else void doSubmit() }} data-testid="submit-failed-action" style={{ height: 32, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--card)', color: 'var(--tx)', fontWeight: 800, fontSize: 12.5, boxShadow: '2px 2px 0 var(--ink)', cursor: 'pointer', flex: 'none', fontFamily: 'var(--font-body)' }}>{FAILURE_ACTION[failure] === 'reload' ? ui.reload : ui.tryAgain}</button>
                  )}
                </div>
              )}
              {renderRows(onCover ? page.blocks : visibleBlocks(page, state))}
              {def.settings.honeypot && mode === 'live' && (
                <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                  <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 6, flexDirection: device === 'phone' ? 'column' : 'row', justifyContent: theme.align === 'center' ? 'center' : 'flex-start' }}>
                <button ref={submitBtnRef} type="button" onClick={() => void advance()} disabled={submitting || waitingOnline || checking} aria-busy={submitting || checking || undefined} data-testid="continue"
                  style={{ ...primaryBtn, minWidth: btnWidth ?? undefined, opacity: submitting || waitingOnline ? .5 : 1, boxShadow: submitting || waitingOnline ? 'none' : (T.button.boxShadow as string), cursor: submitting || waitingOnline ? 'not-allowed' : 'pointer' }}>
                  {submitting && <span className="fb-spinner" aria-hidden="true" />}
                  {submitting ? ui.submitting : waitingOnline ? ui.waitingConnection : btnLabel}
                  {!submitting && !waitingOnline && <Icon name="arrow-right" size={16} />}
                </button>
                {showBack && visited.length > 0 && !onCover && (
                  <button type="button" onClick={back} data-testid="back" style={{ height: 44, padding: '0 14px', border: '2px solid transparent', borderRadius: theme.radius, background: 'transparent', color: theme.muted, fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="arrow-left" size={15} /> {ui.back}</button>
                )}
                {device !== 'phone' && !onCover && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: theme.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ui.pressEnterBefore} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '0 5px', border: `1.5px solid ${theme.line}`, borderRadius: 4 }}>↵</span> {ui.pressEnterAfter}</span>}
              </div>
            </div>
          )}

          {done && ending && <EndingView ending={ending} def={def} answers={answers} theme={theme} T={T} device={device} mode={mode} card={card} onRestart={restart} ui={ui} edited={!!editing} oneResponse={oneResponse} editToken={done.editToken ?? null} />}
          {!embed && theme.footer.trim() && <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: theme.muted, fontFamily: 'var(--font-body)' }} data-testid="form-footer">{theme.footer}</p>}
        </div>
      </div>
    </div>
    </RunnerLangContext.Provider>
  )
}

// Shakes a failing control once without remounting it: a remount would
// steal focus from the respondent mid-word the moment the error cleared.
function Shake({ active, tick, children }: { active: boolean; tick: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active || !ref.current || typeof ref.current.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current.animate([{ transform: 'none' }, { transform: 'translateX(-4px)', offset: 0.2 }, { transform: 'translateX(4px)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
  }, [active, tick])
  return <div ref={ref}>{children}</div>
}

function EndingView({ ending, def, answers, theme, T, device, mode, card, onRestart, ui, edited, oneResponse, editToken }: { ending: Ending; def: FormDefinition; answers: AnswerMap; theme: Theme; T: ThemeStyles; device: Device; mode: 'preview' | 'live'; card: React.CSSProperties; onRestart: () => void; ui: UiCatalog; edited: boolean; oneResponse: boolean; editToken: string | null }) {
  const headRef = useRef<HTMLHeadingElement>(null)
  const title = isStockThanks(ending.title) ? ui.thanks : renderTemplate(ending.title, def, answers)
  const body = renderTemplate(ending.body, def, answers)
  const url = ending.kind === 'redirect' ? ending.redirectUrl : ending.buttonUrl
  const host = (() => { try { return new URL(url).host } catch { return url } })()
  // The private link to change these answers. The token rides in the fragment, which never reaches a server log.
  const editUrl = editToken && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#edit=${editToken}` : null
  const [copied, setCopied] = useState(false)
  useEffect(() => { headRef.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    // With an edit link on screen the respondent needs a moment to keep it: no automatic redirect.
    if (ending.kind !== 'redirect' || mode !== 'live' || !/^https?:\/\//.test(url) || editUrl || edited) return
    const t = setTimeout(() => { window.location.assign(url) }, 1500)
    return () => clearTimeout(t)
  }, [ending.kind, url, mode, editUrl, edited])
  const align = theme.align === 'center' ? 'center' : 'flex-start'
  const h1: React.CSSProperties = { margin: 0, fontFamily: T.headFont, fontSize: device === 'phone' ? 26 : 30, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.15, textWrap: 'pretty', outline: 'none' } as React.CSSProperties
  const copy = async () => { if (!editUrl) return; try { await navigator.clipboard.writeText(editUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the link stays on screen to copy by hand */ } }
  return (
    <section className="fb-page-fwd" aria-live="polite" style={{ ...card, alignItems: align, gap: 16 }} data-testid="ending" data-ending-id={ending.id} data-edited={edited || undefined}>
      {ending.confetti && !edited && <Confetti color={theme.primary} accent={theme.accent} />}
      <span aria-hidden="true" style={{ position: 'absolute', right: 18, top: -14, padding: '4px 9px', border: '2px solid var(--ink)', borderRadius: 5, background: 'var(--gold)', color: 'var(--on-accent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', boxShadow: '2px 2px 0 var(--ink)', transform: 'rotate(-5deg)' }} className="fb-slam">{ui.received}</span>
      <span aria-hidden="true" className="fb-pop" style={{ width: 60, height: 60, border: `2px solid ${theme.line}`, borderRadius: 18, background: theme.primary, color: T.onPrimary, display: 'grid', placeItems: 'center' }}><Icon name="check" size={30} /></span>
      {edited ? (
        <h1 ref={headRef} tabIndex={-1} style={h1} data-testid="edit-saved">{ui.changesSaved}</h1>
      ) : ending.kind === 'redirect' ? (
        <>
          <h1 ref={headRef} tabIndex={-1} style={h1}>{ui.thanks}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: theme.muted }}>{ui.redirectingTo} <span style={{ fontFamily: 'var(--font-mono)' }}>{host || ui.theNextPage}</span>… <a href={url} style={{ color: 'inherit' }}>{ui.continueNow}</a>{mode === 'preview' && <> · In preview the redirect isn&apos;t followed.</>}</p>
        </>
      ) : (
        <>
          <h1 ref={headRef} tabIndex={-1} style={h1}>{title || ui.thanks}</h1>
          {body && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: theme.muted, whiteSpace: 'pre-wrap', textWrap: 'pretty' } as React.CSSProperties}>{body}</p>}
          {ending.blocks.map(b => { const D = DISPLAY_RENDERERS[b.type]; return D && DISPLAY_ONLY.includes(b.type) ? <div key={b.id} style={{ width: '100%' }}><D block={b} theme={theme} T={T} mode="live" device={device} text={renderTemplate(b.label, def, answers)} description={renderTemplate(b.description, def, answers)} /></div> : null })}
          {ending.kind === 'message' && ending.buttonLabel && url && <a href={url} style={{ height: 48, padding: '0 24px', fontFamily: 'inherit', fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', ...T.button }}>{ending.buttonLabel}</a>}
          {ending.kind === 'restart' && !oneResponse && <button type="button" onClick={onRestart} style={{ height: 48, padding: '0 24px', fontFamily: 'inherit', fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', cursor: 'pointer', ...T.button }} data-testid="submit-another">{ending.buttonLabel || ui.submitAnother}</button>}
        </>
      )}
      {editUrl && !edited && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '12px 14px', border: `2px solid ${theme.line}`, borderRadius: theme.radius, background: theme.input }} data-testid="edit-link">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a href={editUrl} style={{ fontWeight: 800, color: theme.text }} data-testid="edit-link-open">{ui.editResponse}</a>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => void copy()} style={{ border: `1.5px solid ${theme.line}`, borderRadius: 8, background: theme.content, color: theme.text, font: 'inherit', fontSize: 13, fontWeight: 800, padding: '4px 10px', cursor: 'pointer' }} data-testid="edit-link-copy">{copied ? ui.copied : ui.copyLink}</button>
          </div>
          <span style={{ fontSize: 12.5, color: theme.muted }}>{ui.editLinkNote}</span>
        </div>
      )}
      {/* Preview's own way back, unless the ending already offers one. */}
      {mode === 'preview' && !(ending.kind === 'restart' && !oneResponse) && <button type="button" onClick={onRestart} style={{ border: 0, background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: theme.muted, textDecoration: 'underline', textDecorationThickness: 2, cursor: 'pointer', marginTop: 6 }}>{ui.startOver}</button>}
    </section>
  )
}

function Confetti({ color, accent }: { color: string; accent: string }) {
  const bits = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: (i * 53) % 100, delay: (i % 6) * 60, rot: (i * 47) % 360, c: i % 3 === 0 ? accent : i % 3 === 1 ? color : 'var(--gold)' })), [color, accent])
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit' }}>
      <style>{`@keyframes fb-confetti { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1 } 100% { transform: translateY(240px) rotate(540deg); opacity: 0 } } @media (prefers-reduced-motion: reduce) { [data-confetti] { animation: none !important; opacity: 0 } }`}</style>
      {bits.map((b, i) => <span key={i} data-confetti="" style={{ position: 'absolute', top: 0, left: `${b.left}%`, width: 8, height: 12, background: b.c, transform: `rotate(${b.rot}deg)`, animation: `fb-confetti 1.4s cubic-bezier(.2,0,0,1) ${b.delay}ms both` }} />)}
    </div>
  )
}

/** The required star after a question label: the label's own colour unless the theme names
 *  one (Lagoon's red). Not coral by default: on GRYD themes coral means an error. */
export function RequiredMark({ announce, word, color }: { announce: boolean; word: string; color?: string }) {
  return (
    <>
      <span aria-hidden="true" data-required-mark="" style={{ marginLeft: 4, fontWeight: 800, color: color || 'inherit' }}>*</span>
      {announce && <span className="fb-sr">{` ${word.toLowerCase()}`}</span>}
    </>
  )
}
