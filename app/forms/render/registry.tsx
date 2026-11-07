'use client'

// The UI half of the component registry: for every core type, how it draws
// in the builder canvas (mode 'edit', inert inputs, inline-editable text) and
// in the live form (mode 'live', real inputs). Everything else about a type
// — validation, defaults, logic — lives in the core registry.

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { componentDef, blockSettings, optionLabel, uploadSettings, acceptAttribute, ACCEPT_LABEL, videoEmbedUrl, safeMediaUrl, PHONE_COUNTRIES, PHONE_PREFERRED, flagEmoji, normalizePhone, formatPhone, signatureSettings, asSignature, signaturePath, SIGNATURE_W, SIGNATURE_H, type Block, type Theme, type ThemeStyles, type AnswerValue, type PhoneValue, type FileAnswer, type MatrixRow, type MatrixValue, type DateRangeValue, type AddressValue, type ComponentType, type FormLanguage, uiFor, errorsFor, DEFAULT_AGREEMENT } from '@/lib/forms-core/index'
import { Icon } from '../ui/icons'
import { formatBytes as _fb } from '../ui/index'

export type Mode = 'edit' | 'live'
export type Device = 'desktop' | 'tablet' | 'phone'

/** The form's language: the copy the runner writes itself comes from it (core ui.ts, i18n.ts). */
export const RunnerLangContext = createContext<FormLanguage>('en')
const useFieldsUi = () => uiFor(useContext(RunnerLangContext)).fields
const useErrors = () => errorsFor(useContext(RunnerLangContext))

export interface UploadItemState { fileId: string; name: string; size: number; mime: string; status: 'busy' | 'done' | 'failed'; pct: number; error?: string; uploadToken?: string }
export interface UploadController {
  items: (blockId: string) => UploadItemState[]
  pick: (block: Block, files: FileList | File[]) => void
  cancel: (block: Block, fileId: string) => void
  remove: (block: Block, fileId: string) => void
  retry: (block: Block, fileId: string) => void
}

export interface RenderProps {
  block: Block
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  onBlur?: () => void
  onEnter?: () => void
  invalid: boolean
  /** Live only: the question must be answered (after logic). Drives aria-required. */
  required?: boolean
  inputId: string
  labelId: string
  describedBy?: string
  theme: Theme
  T: ThemeStyles
  mode: Mode
  device: Device
  uploads?: UploadController
  /** Builder only: option editing hooks. */
  edit?: {
    selected: boolean
    onOptionLabel: (index: number, label: string) => void
    onOptionAdd: (afterIndex?: number) => void
    onOptionRemove: (index: number) => void
    onOptionImage?: (index: number) => void
  }
}

const ctlHeight = (device: Device) => (device === 'phone' ? 48 : 46)

// ── Error colours ────────────────────────────────────────────────────────────
// GRYD's coral reads on light forms but turns to mud on a dark one (Lagoon's teal:
// dark-red text at 1.5:1). The runner sets these from the theme (core errorTones); outside
// a runner they fall back to the portal coral.
export const ERROR_TEXT = 'var(--fr-error, var(--coral-tx))'
export const ERROR_LINE = 'var(--fr-error-line, var(--coral))'

function inputStyle(p: RenderProps, extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    height: p.mode === 'live' ? ctlHeight(p.device) : 44, width: '100%', padding: '0 14px', fontFamily: 'inherit', fontSize: p.mode === 'live' ? 16 : 15, fontWeight: 600,
    ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, pointerEvents: p.mode === 'edit' ? 'none' : 'auto', ...extra,
  }
}

const inert = (p: RenderProps) => ({ readOnly: p.mode === 'edit', tabIndex: p.mode === 'edit' ? -1 : 0 })

/** Types whose own control carries aria-required. ARIA allows it on text
 *  boxes, selects and radio groups; checkbox groups, lists, tables, switches
 *  and file pickers announce "Required" through their label instead. */
export const ARIA_REQUIRED = new Set<ComponentType>(['short', 'long', 'email', 'phone', 'number', 'url', 'date', 'datetime', 'time', 'daterange', 'dropdown', 'address', 'choice', 'yesno', 'rating', 'scale'])
const ariaReq = (p: RenderProps) => (p.required && p.mode === 'live' ? true : undefined)

/** Hears a value that arrives without typing: a browser extension, an
 *  automation tool or assistive software that assigns el.value and fires
 *  input/change. React's onChange stays silent then — its value tracker
 *  already holds the new value — so the field would show an answer the form
 *  never recorded and submit without it. (QA 2026-09-24: a reversed date range
 *  "accepted" in preview had never reached the form at all.) */
function useDomValue(rendered: string, onValue: (v: string) => void): React.RefCallback<HTMLInputElement | HTMLTextAreaElement> {
  const last = useRef(rendered)
  last.current = rendered
  const cb = useRef(onValue)
  cb.current = onValue
  const detach = useRef<(() => void) | null>(null)
  return useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
    detach.current?.(); detach.current = null
    if (!el) return
    // A real keystroke reaches React's onChange as well; hearing the same value twice is
    // harmless. A value set by script reaches only this listener.
    const on = () => queueMicrotask(() => { if (el.isConnected && el.value !== last.current) { last.current = el.value; cb.current(el.value) } })
    el.addEventListener('input', on); el.addEventListener('change', on)
    detach.current = () => { el.removeEventListener('input', on); el.removeEventListener('change', on) }
  }, [])
}

function enterAdvances(p: RenderProps) {
  return (e: React.KeyboardEvent) => { if (e.key === 'Enter' && p.onEnter) { e.preventDefault(); p.onEnter() } }
}

// ── Text-like ────────────────────────────────────────────────────────────────

function TextInput(p: RenderProps) {
  const d = componentDef(p.block.type)
  const s = blockSettings<{ autoComplete?: string }>(p.block)
  const value = typeof p.value === 'string' || typeof p.value === 'number' ? String(p.value) : ''
  const dom = useDomValue(value, v => p.onChange(v))
  return (
    <input ref={dom} id={p.inputId} type={d.input?.type ?? 'text'} inputMode={d.input?.inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode']} autoComplete={s.autoComplete || d.input?.autoComplete || 'off'}
      value={value} onChange={e => p.onChange(e.target.value)} onBlur={p.onBlur} onKeyDown={enterAdvances(p)}
      placeholder={p.block.placeholder} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={inputStyle(p)} {...inert(p)} />
  )
}

function NumberInput(p: RenderProps) {
  // The text stays as typed ("1." mid-way through "1.5"); the answer becomes a
  // number as soon as the text parses, so validation and logic see numbers and
  // junk text is reported as "Numbers only, please."
  const [text, setText] = useState(p.value === undefined || p.value === null || p.value === '' ? '' : String(p.value))
  useEffect(() => { if ((p.value === undefined || p.value === '') && text !== '') setText('') }, [p.value]) // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    setText(v)
    const t = v.trim()
    if (t === '') p.onChange('')
    else if (/^-?(\d+\.?\d*|\.\d+)$/.test(t)) p.onChange(Number(t))
    else p.onChange(v)
  }
  const dom = useDomValue(text, change)
  return (
    <input ref={dom} id={p.inputId} type="text" inputMode="decimal" value={text} onChange={e => change(e.target.value)} onBlur={p.onBlur} onKeyDown={enterAdvances(p)}
      placeholder={p.block.placeholder || '0'} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={inputStyle(p)} {...inert(p)} />
  )
}

function LongInput(p: RenderProps) {
  const s = blockSettings<{ rows: number }>(p.block)
  const value = typeof p.value === 'string' ? p.value : ''
  const dom = useDomValue(value, v => p.onChange(v))
  return (
    <textarea ref={dom} id={p.inputId} rows={s.rows || 3} value={value} onChange={e => p.onChange(e.target.value)} onBlur={p.onBlur} placeholder={p.block.placeholder}
      aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={{ ...inputStyle(p), height: 'auto', padding: '12px 14px', lineHeight: 1.5, resize: 'vertical', minHeight: 96 }} {...inert(p)} />
  )
}

function PhoneInput(p: RenderProps) {
  const f = useFieldsUi()
  const s = blockSettings<{ defaultCountry: string }>(p.block)
  const v = (p.value && typeof p.value === 'object' && 'e164' in (p.value as PhoneValue)) ? (p.value as PhoneValue) : null
  const [country, setCountry] = useState(v?.country ?? s.defaultCountry ?? 'US')
  const [text, setText] = useState(v ? formatPhone(v).replace(`+${v.dial} `, '') : '')
  useEffect(() => { if (v && v.country !== country) setCountry(v.country) }, [v, country])
  const commit = (c: string, t: string) => {
    if (!t.trim()) { p.onChange(''); return }
    const norm = normalizePhone(c, t)
    p.onChange(norm ?? { country: c, dial: '', national: t, e164: '' })
    if (norm && norm.country !== c) setCountry(norm.country)
  }
  const preferred = PHONE_PREFERRED.map(iso => PHONE_COUNTRIES.find(c => c.iso === iso)!).filter(Boolean)
  const rest = PHONE_COUNTRIES.filter(c => !PHONE_PREFERRED.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name))
  const dial = PHONE_COUNTRIES.find(c => c.iso === country)?.dial ?? '1'
  const dom = useDomValue(text, t => { setText(t); commit(country, t) })
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ position: 'relative', flex: 'none' }}>
        <select aria-label={f.countryCode} value={country} onChange={e => { setCountry(e.target.value); commit(e.target.value, text) }} {...inert(p)}
          style={{ ...inputStyle(p), width: 112, padding: '0 26px 0 8px', appearance: 'none', fontSize: 14, fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {preferred.map(c => <option key={c.iso} value={c.iso}>{flagEmoji(c.iso)} +{c.dial}</option>)}
          <option disabled>──────</option>
          {rest.map(c => <option key={c.iso} value={c.iso}>{flagEmoji(c.iso)} {c.name} +{c.dial}</option>)}
        </select>
        <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: p.theme.text }}><Icon name="chevron-down" size={14} /></span>
      </div>
      <input ref={dom} id={p.inputId} type="tel" inputMode="tel" autoComplete="tel-national" value={text} onChange={e => { setText(e.target.value); commit(country, e.target.value) }} onBlur={p.onBlur} onKeyDown={enterAdvances(p)}
        placeholder={p.block.placeholder || `+${dial}`} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={{ ...inputStyle(p), flex: 1, minWidth: 0, width: 'auto' }} {...inert(p)} />
    </div>
  )
}

// ── Choices ──────────────────────────────────────────────────────────────────

function OptionRow({ p, index, option, checked, kind, onToggle, image }: { p: RenderProps; index: number; option: { id: string; label: string; imageUrl?: string }; checked: boolean; kind: 'radio' | 'checkbox'; onToggle: () => void; image?: boolean }) {
  const tint = checked ? (p.T.dark ? `${p.theme.primary}33` : `${p.theme.primary}55`) : p.theme.input
  const editable = p.mode === 'edit' && p.edit
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: p.mode === 'live' ? ctlHeight(p.device) : 44, padding: image ? '10px 12px' : '0 14px', cursor: 'pointer', ...p.T.input, borderColor: p.invalid ? ERROR_LINE : checked ? p.theme.line : p.theme.line, background: tint, transition: 'background .12s', ...(image ? { flexDirection: 'column', alignItems: 'stretch', flex: '1 1 140px', minWidth: 140 } : {}) }} data-testid="option-row">
      {image && (option.imageUrl ? <img src={safeMediaUrl(option.imageUrl)} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: Math.max(4, p.theme.radius - 4) }} /> : <div style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: Math.max(4, p.theme.radius - 4), background: p.theme.content, display: 'grid', placeItems: 'center', color: p.theme.muted }}><Icon name="image" size={22} /></div>)}
      {/* flex: 1 so the row's remove × sits at the right edge, not after the text (QA 2026-10-15). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: image ? undefined : 1, minWidth: 0 }}>
        <input type={kind} name={p.block.id} value={option.id} checked={checked} onChange={onToggle} tabIndex={p.mode === 'edit' ? -1 : 0} aria-describedby={p.describedBy} style={{ width: 20, height: 20, margin: 0, accentColor: p.theme.primary, flex: 'none', pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }} />
        {editable ? (
          <input aria-label="Option text" value={option.label} onChange={e => p.edit!.onOptionLabel(index, e.target.value)} onClick={e => { e.stopPropagation(); e.preventDefault() }} data-testid="option-label"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); p.edit!.onOptionAdd(index) } else if (e.key === 'Backspace' && !e.currentTarget.value && p.block.options.length > 1) { e.preventDefault(); p.edit!.onOptionRemove(index) } }}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: p.theme.text, pointerEvents: 'auto' }} />
        ) : <span style={{ flex: 1, fontSize: p.mode === 'live' ? 16 : 15, fontWeight: 600, lineHeight: 1.35, padding: '10px 0' }}>{option.label}</span>}
        {editable && p.edit!.selected && image && p.edit!.onOptionImage && <button type="button" aria-label="Set image" onClick={e => { e.preventDefault(); e.stopPropagation(); p.edit!.onOptionImage!(index) }} style={{ width: 22, height: 22, border: 0, borderRadius: 6, background: 'transparent', color: p.theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', pointerEvents: 'auto' }}><Icon name="image" size={14} /></button>}
        {editable && p.edit!.selected && <button type="button" aria-label="Remove option" onClick={e => { e.preventDefault(); e.stopPropagation(); p.edit!.onOptionRemove(index) }} data-testid="option-remove" style={{ width: 22, height: 22, border: 0, borderRadius: 6, background: 'transparent', color: p.theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', pointerEvents: 'auto' }}><Icon name="x" size={14} /></button>}
      </div>
    </label>
  )
}

/** Pills layout: compact options that wrap across the row, each a rounded
 *  chip with a small radio dot or check box before the label. The native
 *  input stays in the chip (visually hidden), so arrow keys, Space, form
 *  autofill and screen readers behave exactly as in the list layout. */
function PillOption({ p, index, option, checked, kind, onToggle, mark: showMark }: { p: RenderProps; index: number; option: { id: string; label: string }; checked: boolean; kind: 'radio' | 'checkbox'; onToggle: () => void; mark: boolean }) {
  const editable = p.mode === 'edit' && p.edit
  const tint = checked ? (p.T.dark ? `${p.theme.primary}33` : `${p.theme.primary}55`) : p.theme.input
  const h = p.mode === 'live' ? (p.device === 'phone' ? 44 : 40) : 38
  // One drawn 18px indicator, centred on the label: a circle for one answer, a rounded
  // square for several; filled dot / ink box with a check when picked.
  const mark: React.CSSProperties = { width: 18, height: 18, flex: 'none', boxSizing: 'border-box', border: `2px solid ${checked ? p.theme.text : p.theme.line}`, borderRadius: kind === 'radio' ? '50%' : 5, display: 'grid', placeItems: 'center', background: kind === 'checkbox' && checked ? p.theme.text : 'transparent', color: p.theme.input, transition: 'background .12s, border-color .12s' }
  return (
    <label className="fb-pill" data-testid="option-pill" data-checked={checked || undefined} data-flat={p.theme.container === 'flat' || undefined}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: h, maxWidth: '100%', padding: showMark ? '0 16px 0 12px' : '0 16px', cursor: 'pointer', background: tint, color: p.theme.text, border: `2px solid ${p.invalid ? ERROR_LINE : p.theme.line}`, borderRadius: 999, boxShadow: checked && p.theme.container !== 'flat' ? `2px 2px 0 ${p.theme.line}` : undefined, transition: 'background .12s, box-shadow .12s' }}>
      <input type={kind} name={p.block.id} value={option.id} checked={checked} onChange={onToggle} tabIndex={p.mode === 'edit' ? -1 : 0} aria-describedby={p.describedBy} className="fb-pill__input" style={{ pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }} />
      {showMark && <span aria-hidden="true" data-pill-mark={kind} style={mark}>
        {checked && (kind === 'radio' ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.theme.text }} /> : <Icon name="check" size={12} />)}
      </span>}
      {editable ? (
        <span style={{ display: 'inline-grid', minWidth: 24, maxWidth: '100%' }}>
          <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'pre', fontSize: 15, fontWeight: 600, paddingRight: 2 }}>{option.label || 'Option'}</span>
          <input aria-label="Option text" size={1} value={option.label} placeholder="Option" onChange={e => p.edit!.onOptionLabel(index, e.target.value)} onClick={e => { e.stopPropagation(); e.preventDefault() }} data-testid="option-label"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); p.edit!.onOptionAdd(index) } else if (e.key === 'Backspace' && !e.currentTarget.value && p.block.options.length > 1) { e.preventDefault(); p.edit!.onOptionRemove(index) } }}
            style={{ gridArea: '1 / 1', width: '100%', minWidth: 0, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: p.theme.text, pointerEvents: 'auto' }} />
        </span>
      ) : <span style={{ fontSize: p.mode === 'live' ? 16 : 15, fontWeight: 600, lineHeight: 1.3, padding: '8px 0', overflowWrap: 'anywhere' }}>{option.label}</span>}
      {editable && p.edit!.selected && <button type="button" aria-label="Remove option" onClick={e => { e.preventDefault(); e.stopPropagation(); p.edit!.onOptionRemove(index) }} data-testid="option-remove" style={{ width: 20, height: 20, marginRight: -6, border: 0, borderRadius: 6, background: 'transparent', color: p.theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', pointerEvents: 'auto' }}><Icon name="x" size={13} /></button>}
    </label>
  )
}

function AddOption({ p }: { p: RenderProps }) {
  if (p.mode !== 'edit' || !p.edit?.selected) return null
  return (
    <button type="button" onClick={e => { e.stopPropagation(); p.edit!.onOptionAdd() }} data-testid="option-add" style={{ alignSelf: 'flex-start', height: 30, padding: '0 10px', border: '1.5px dashed var(--ink)', borderRadius: 8, background: 'transparent', color: 'var(--tx)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', pointerEvents: 'auto' }}>
      <Icon name="plus" size={13} /> Add option <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 400, color: 'var(--mut2)' }}>or press Enter</span>
    </button>
  )
}

function ChoiceInput(p: RenderProps) {
  const multi = p.block.type === 'checks' || (p.block.type === 'picture' && p.block.settings.multiple === true)
  const image = p.block.type === 'picture'
  const s = blockSettings<{ layout?: 'list' | 'inline'; indicator?: 'mark' | 'fill' }>(p.block)
  const selected = multi ? (Array.isArray(p.value) ? (p.value as string[]) : []) : typeof p.value === 'string' ? [p.value] : []
  const toggle = (id: string) => {
    if (p.mode === 'edit') return
    if (!multi) { p.onChange(id); return }
    const set = new Set(selected)
    if (set.has(id)) set.delete(id); else set.add(id)
    p.onChange(p.block.options.filter(o => set.has(o.id)).map(o => o.id))
  }
  const pills = s.layout === 'inline' && !image
  const inline = pills || image
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={p.labelId} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} aria-required={multi ? undefined : ariaReq(p)} data-layout={pills ? 'pills' : image ? 'pictures' : 'list'} style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', flexWrap: inline ? 'wrap' : undefined, alignItems: pills ? 'center' : undefined, gap: pills ? 10 : 8 }}>
      {p.block.options.map((o, i) => pills
        ? <PillOption key={o.id} p={p} index={i} option={o} checked={selected.includes(o.id)} kind={multi ? 'checkbox' : 'radio'} onToggle={() => toggle(o.id)} mark={s.indicator !== 'fill'} />
        : <OptionRow key={o.id} p={p} index={i} option={o} checked={selected.includes(o.id)} kind={multi ? 'checkbox' : 'radio'} onToggle={() => toggle(o.id)} image={image} />)}
      <AddOption p={p} />
    </div>
  )
}

function DropdownInput(p: RenderProps) {
  const f = useFieldsUi()
  const v = typeof p.value === 'string' ? p.value : ''
  return (
    <div style={{ position: 'relative' }}>
      <select id={p.inputId} value={v} onChange={e => p.onChange(e.target.value)} onBlur={p.onBlur} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} {...inert(p)}
        style={{ ...inputStyle(p), padding: '0 40px 0 14px', appearance: 'none', color: v ? p.theme.text : p.theme.muted }}>
        <option value="">{p.block.placeholder || f.chooseOne}</option>
        {p.block.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: p.theme.text }}><Icon name="chevron-down" size={16} /></span>
      {p.mode === 'edit' && p.edit?.selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {p.block.options.map((o, i) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 2, background: p.theme.line, flex: 'none', marginLeft: 6 }} />
              <input aria-label="Option text" value={o.label} onChange={e => p.edit!.onOptionLabel(i, e.target.value)} onClick={e => e.stopPropagation()} data-testid="option-label"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); p.edit!.onOptionAdd(i) } else if (e.key === 'Backspace' && !e.currentTarget.value && p.block.options.length > 1) { e.preventDefault(); p.edit!.onOptionRemove(i) } }}
                style={{ flex: 1, minWidth: 0, border: 0, borderBottom: `1.5px solid ${p.theme.line}44`, background: 'transparent', padding: '4px 0', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: p.theme.text }} />
              <button type="button" aria-label="Remove option" onClick={e => { e.stopPropagation(); p.edit!.onOptionRemove(i) }} data-testid="option-remove" style={{ width: 22, height: 22, border: 0, borderRadius: 6, background: 'transparent', color: p.theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
            </div>
          ))}
          <AddOption p={p} />
        </div>
      )}
    </div>
  )
}

function YesNoInput(p: RenderProps) {
  const s = blockSettings<{ yesLabel: string; noLabel: string }>(p.block)
  const opts: Array<[boolean, string]> = [[true, s.yesLabel], [false, s.noLabel]]
  return (
    <div role="radiogroup" aria-labelledby={p.labelId} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} style={{ display: 'flex', gap: 10 }}>
      {opts.map(([val, label]) => {
        const on = p.value === val
        return (
          <label key={String(val)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: p.mode === 'live' ? ctlHeight(p.device) : 48, fontSize: p.mode === 'live' ? 16 : 15, fontWeight: 700, cursor: 'pointer', ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, background: on ? (p.T.dark ? `${p.theme.primary}33` : `${p.theme.primary}55`) : p.theme.input, pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }}>
            <input type="radio" name={p.block.id} checked={on} onChange={() => p.onChange(val)} tabIndex={p.mode === 'edit' ? -1 : 0} style={{ width: 20, height: 20, margin: 0, accentColor: p.theme.primary }} />{label}
          </label>
        )
      })}
    </div>
  )
}

function SwitchInput(p: RenderProps) {
  const f = useFieldsUi()
  const on = p.value === true
  const s = blockSettings<{ onLabel: string }>(p.block)
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={p.labelId} aria-describedby={p.describedBy} id={p.inputId} onClick={() => p.onChange(!on)} tabIndex={p.mode === 'edit' ? -1 : 0}
      style={{ display: 'flex', alignItems: 'center', gap: 12, height: p.mode === 'live' ? ctlHeight(p.device) : 44, padding: '0 14px', ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, width: '100%', pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }}>
      <span aria-hidden="true" style={{ width: 40, height: 22, border: `2px solid ${p.theme.line}`, borderRadius: 14, background: on ? p.theme.primary : p.theme.content, position: 'relative', flex: 'none', transition: 'background .12s' }}>
        <span style={{ position: 'absolute', top: 1, left: on ? 19 : 1, width: 16, height: 16, borderRadius: '50%', background: p.theme.content, border: `1.5px solid ${p.theme.line}`, transition: 'left .22s cubic-bezier(.34,1.56,.64,1)' }} />
      </span>
      <span>{s.onLabel || (on ? f.on : f.off)}</span>
    </button>
  )
}

function RankingInput(p: RenderProps) {
  const order = Array.isArray(p.value) && (p.value as string[]).length ? (p.value as string[]) : p.block.options.map(o => o.id)
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= order.length) return
    const next = order.slice(); [next[i], next[j]] = [next[j], next[i]]
    p.onChange(next)
  }
  return (
    <ol aria-labelledby={p.labelId} aria-describedby={p.describedBy} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {order.map((id, i) => (
        <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: p.mode === 'live' ? ctlHeight(p.device) : 44, padding: '0 10px 0 14px', ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line }}>
          <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: p.theme.muted, width: 18 }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{optionLabel(p.block, id)}</span>
          <button type="button" aria-label={`Move ${optionLabel(p.block, id)} up`} disabled={i === 0} onClick={() => move(i, -1)} tabIndex={p.mode === 'edit' ? -1 : 0} style={{ width: 32, height: 32, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: i === 0 ? .35 : 1 }}><Icon name="arrow-up" size={15} /></button>
          <button type="button" aria-label={`Move ${optionLabel(p.block, id)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)} tabIndex={p.mode === 'edit' ? -1 : 0} style={{ width: 32, height: 32, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: i === order.length - 1 ? .35 : 1 }}><Icon name="arrow-down" size={15} /></button>
        </li>
      ))}
    </ol>
  )
}

function MatrixInput(p: RenderProps) {
  const s = blockSettings<{ rows: MatrixRow[]; multiple: boolean }>(p.block)
  const v = (p.value && typeof p.value === 'object' && !Array.isArray(p.value) ? p.value : {}) as MatrixValue
  const set = (rowId: string, optId: string) => {
    if (p.mode === 'edit') return
    if (!s.multiple) { p.onChange({ ...v, [rowId]: optId }); return }
    const cur = Array.isArray(v[rowId]) ? (v[rowId] as string[]) : []
    p.onChange({ ...v, [rowId]: cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId] })
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table role="group" aria-labelledby={p.labelId} style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', ...p.T.input, overflow: 'hidden', fontSize: 14 }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '10px 12px' }} />{p.block.options.map(o => <th key={o.id} scope="col" style={{ padding: '10px 8px', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>{o.label}</th>)}</tr></thead>
        <tbody>
          {s.rows.map(r => (
            <tr key={r.id}>
              <th scope="row" style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, borderTop: `1.5px solid ${p.theme.line}33` }}>{r.label}</th>
              {p.block.options.map(o => {
                const on = s.multiple ? (Array.isArray(v[r.id]) && (v[r.id] as string[]).includes(o.id)) : v[r.id] === o.id
                return <td key={o.id} style={{ textAlign: 'center', padding: '8px', borderTop: `1.5px solid ${p.theme.line}33` }}><input type={s.multiple ? 'checkbox' : 'radio'} name={`${p.block.id}:${r.id}`} aria-label={`${r.label}: ${o.label}`} checked={on} onChange={() => set(r.id, o.id)} tabIndex={p.mode === 'edit' ? -1 : 0} style={{ width: 20, height: 20, margin: 0, accentColor: p.theme.primary, pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }} /></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Dates ────────────────────────────────────────────────────────────────────

function DateInput(p: RenderProps) {
  const type = p.block.type === 'datetime' ? 'datetime-local' : p.block.type === 'time' ? 'time' : 'date'
  const s = blockSettings<{ min?: string; max?: string }>(p.block)
  const value = typeof p.value === 'string' ? p.value : ''
  const dom = useDomValue(value, v => p.onChange(v))
  return <input ref={dom} id={p.inputId} type={type} value={value} min={s.min || undefined} max={s.max || undefined} onChange={e => p.onChange(e.target.value)} onBlur={p.onBlur} onKeyDown={enterAdvances(p)} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={inputStyle(p)} {...inert(p)} />
}

function DateRangeInput(p: RenderProps) {
  const f = useFieldsUi()
  const v = (p.value && typeof p.value === 'object' ? p.value : { start: '', end: '' }) as DateRangeValue
  const s = blockSettings<{ min?: string; max?: string }>(p.block)
  // Each end builds on the newest value, not the one this render saw, so both set before
  // React re-renders (one script filling the pair) keep each other.
  const latest = useRef(v)
  latest.current = v
  const put = (next: DateRangeValue) => { latest.current = next; p.onChange(next) }
  const setStart = (start: string) => put({ ...latest.current, start })
  const setEnd = (end: string) => put({ ...latest.current, end })
  const domStart = useDomValue(v.start ?? '', setStart)
  const domEnd = useDomValue(v.end ?? '', setEnd)
  // The pickers bound each other: the end cannot be picked before the start (the validator still checks).
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input ref={domStart} id={p.inputId} type="date" aria-label={f.startDate} value={v.start ?? ''} min={s.min || undefined} max={v.end || s.max || undefined} onChange={e => setStart(e.target.value)} onBlur={p.onBlur} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} style={{ ...inputStyle(p), flex: '1 1 160px', width: 'auto' }} {...inert(p)} />
      <span style={{ color: p.theme.muted, fontWeight: 700 }}>{f.to}</span>
      <input ref={domEnd} type="date" aria-label={f.endDate} value={v.end ?? ''} min={v.start || s.min || undefined} max={s.max || undefined} onChange={e => setEnd(e.target.value)} onBlur={p.onBlur} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} style={{ ...inputStyle(p), flex: '1 1 160px', width: 'auto' }} {...inert(p)} />
    </div>
  )
}

// ── Rating ───────────────────────────────────────────────────────────────────

function RatingInput(p: RenderProps) {
  const s = blockSettings<{ max: number; icon: 'star' | 'heart' | 'thumb' }>(p.block)
  const v = typeof p.value === 'number' ? p.value : 0
  const [hover, setHover] = useState(0)
  const icon = s.icon === 'heart' ? 'heart' : s.icon === 'thumb' ? 'thumbs-up' : 'star'
  return (
    <div role="radiogroup" aria-labelledby={p.labelId} aria-describedby={p.describedBy} aria-required={ariaReq(p)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }} onMouseLeave={() => setHover(0)}>
      {Array.from({ length: s.max }, (_, i) => i + 1).map(n => {
        const lit = (hover || v) >= n
        return <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} of ${s.max}`} onClick={() => p.onChange(n)} onMouseEnter={() => setHover(n)} tabIndex={p.mode === 'edit' ? -1 : 0}
          style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', cursor: 'pointer', color: p.theme.text, ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, background: lit ? p.theme.accent : p.theme.input, transition: 'background .12s, transform .12s' }}>
          <Icon name={icon} size={22} />
        </button>
      })}
    </div>
  )
}

function ScaleInput(p: RenderProps) {
  const s = blockSettings<{ min: number; max: number; minLabel: string; maxLabel: string }>(p.block)
  const v = typeof p.value === 'number' ? p.value : null
  const nums = Array.from({ length: s.max - s.min + 1 }, (_, i) => s.min + i)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="radiogroup" aria-labelledby={p.labelId} aria-describedby={p.describedBy} aria-required={ariaReq(p)} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: p.mode === 'edit' ? 'none' : 'auto' }}>
        {nums.map(n => <button key={n} type="button" role="radio" aria-checked={v === n} onClick={() => p.onChange(n)} tabIndex={p.mode === 'edit' ? -1 : 0}
          style={{ flex: '1 1 40px', height: 48, minWidth: 40, display: 'grid', placeItems: 'center', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: p.theme.text, ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, background: v === n ? p.theme.accent : p.theme.input }}>{n}</button>)}
      </div>
      {(s.minLabel || s.maxLabel) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: p.theme.muted }}><span>{s.minLabel}</span><span>{s.maxLabel}</span></div>}
    </div>
  )
}

// ── Upload ───────────────────────────────────────────────────────────────────

function UploadInput(p: RenderProps) {
  const f = useFieldsUi()
  const errs = useErrors()
  const s = uploadSettings(p.block.settings)
  const items = p.uploads?.items(p.block.id) ?? []
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canAddMore = items.length < s.maxFiles
  const hint = `${errs.acceptLabel[s.accept] ?? ACCEPT_LABEL[s.accept]} · ${f.upTo(s.maxSizeMb)}`
  const pick = (files: FileList | null) => { if (files && files.length && p.uploads) p.uploads.pick(p.block, files) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(it => (
        it.status === 'busy' ? (
          <div key={it.fileId} className="fb-rise" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, ...p.T.input }} data-testid="upload-busy">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36, height: 36, border: `2px solid ${p.theme.line}`, borderRadius: 9, display: 'grid', placeItems: 'center', background: p.theme.content, flex: 'none' }}><Icon name="file" size={16} /></span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span><span style={{ fontSize: 12, color: p.theme.muted }}>{f.uploadingPct(it.pct)}</span></div>
              <button type="button" onClick={() => p.uploads?.cancel(p.block, it.fileId)} aria-label={f.cancelUpload} style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={16} /></button>
            </div>
            <div role="progressbar" aria-valuenow={it.pct} aria-valuemin={0} aria-valuemax={100} aria-label={f.uploadingName(it.name)} style={{ height: 8, border: `1.5px solid ${p.theme.line}`, borderRadius: 6, overflow: 'hidden', background: p.theme.content }}><div style={{ height: '100%', width: `${it.pct}%`, background: p.theme.primary, transition: 'width .2s linear' }} /></div>
          </div>
        ) : it.status === 'done' ? (
          <div key={it.fileId} className="fb-rise" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', ...p.T.input }} data-testid="upload-done">
            <span className="fb-pop" style={{ width: 36, height: 36, border: `2px solid ${p.theme.line}`, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--lime)', color: 'var(--on-accent)', flex: 'none' }}><Icon name="check" size={18} /></span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span><span style={{ fontSize: 12, color: p.theme.muted }}>{_fb(it.size)} · {f.uploaded}</span></div>
            <button type="button" onClick={() => p.uploads?.remove(p.block, it.fileId)} data-testid="upload-remove" style={{ height: 32, padding: '0 10px', border: `2px solid ${p.theme.line}`, borderRadius: 8, background: p.theme.content, color: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{f.remove}</button>
          </div>
        ) : (
          <div key={it.fileId} role="alert" className="fb-shake" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', ...p.T.input, borderColor: ERROR_LINE }} data-testid="upload-failed">
            <span style={{ width: 36, height: 36, border: '2px solid var(--coral)', borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--coral-bg)', color: 'var(--coral-tx)', flex: 'none' }}><Icon name="alert" size={16} /></span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span><span style={{ fontSize: 12.5, color: ERROR_TEXT, fontWeight: 600 }}>{it.error || errs.uploadFailed}</span></div>
            <button type="button" onClick={() => p.uploads?.retry(p.block, it.fileId)} data-testid="upload-retry" style={{ height: 32, padding: '0 10px', border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--card)', color: 'var(--tx)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '2px 2px 0 var(--ink)' }}><Icon name="refresh" size={14} /> {f.retry}</button>
            <button type="button" onClick={() => p.uploads?.remove(p.block, it.fileId)} aria-label={f.removeFile} style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={16} /></button>
          </div>
        )
      ))}
      {canAddMore && (
        <label onDragOver={e => { e.preventDefault(); if (!drag) setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files) }}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && p.mode === 'live') { e.preventDefault(); inputRef.current?.click() } }} tabIndex={p.mode === 'live' ? 0 : -1} data-testid="upload-dropzone"
          style={{ minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18, border: `2px dashed ${drag ? p.theme.primary : p.invalid ? ERROR_LINE : p.theme.line}`, borderRadius: p.theme.radius, background: drag ? p.theme.content : p.theme.input, cursor: 'pointer', textAlign: 'center', transition: 'background .12s, transform .12s', transform: drag ? 'scale(1.01)' : 'none', pointerEvents: p.mode === 'edit' ? 'none' : 'auto', position: 'relative' }}>
          <input ref={inputRef} id={p.inputId} type="file" accept={acceptAttribute(p.block) || undefined} multiple={s.maxFiles > 1} onChange={e => { pick(e.target.files); e.target.value = '' }} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} tabIndex={-1} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
          <span style={{ width: 40, height: 40, border: `2px solid ${p.theme.line}`, borderRadius: 11, display: 'grid', placeItems: 'center', background: p.theme.content }}><Icon name="upload" size={18} /></span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{drag ? f.dropToUpload : p.device === 'phone' ? f.tapToChoose : <><u style={{ textDecorationThickness: 2 }}>{f.chooseFile}</u> {f.orDragHere}</>}</span>
          <span style={{ fontSize: 12.5, color: p.theme.muted }}>{hint}</span>
        </label>
      )}
    </div>
  )
}

// ── Address ──────────────────────────────────────────────────────────────────

function AddressPart({ value, onValue, id, label, ac, required, p, style }: { value: string; onValue: (v: string) => void; id?: string; label: string; ac: string; required?: boolean; p: RenderProps; style: React.CSSProperties }) {
  const dom = useDomValue(value, onValue)
  return <input ref={dom} id={id} aria-label={label} placeholder={label} autoComplete={ac} value={value} onChange={e => onValue(e.target.value)} onBlur={p.onBlur} aria-invalid={p.invalid || undefined} aria-required={required} aria-describedby={p.describedBy} style={{ ...inputStyle(p), width: 'auto', ...style }} {...inert(p)} />
}

function AddressInput(p: RenderProps) {
  const f = useFieldsUi()
  const s = blockSettings<{ showLine2: boolean; showCountry: boolean }>(p.block)
  const v = (p.value && typeof p.value === 'object' ? p.value : {}) as Partial<AddressValue>
  // Each part builds on the newest value, so parts filled in one go (autofill, a script) keep each other.
  const latest = useRef(v)
  latest.current = v
  const set = (k: keyof AddressValue, val: string) => {
    const next: AddressValue = { line1: '', line2: '', city: '', state: '', postal: '', country: '', ...latest.current, [k]: val }
    latest.current = next
    p.onChange(next)
  }
  // Street and city are the parts a required address needs (core address validator).
  const field = (k: keyof AddressValue, label: string, ac: string, style: React.CSSProperties = {}, id?: string) => (
    <AddressPart key={k} value={v[k] ?? ''} onValue={val => set(k, val)} id={id} label={label} ac={ac} required={(k === 'line1' || k === 'city') ? ariaReq(p) : undefined} p={p} style={style} />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {field('line1', f.street, 'address-line1', {}, p.inputId)}
      {s.showLine2 && field('line2', f.line2, 'address-line2')}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {field('city', f.city, 'address-level2', { flex: '2 1 160px' })}
        {field('state', f.region, 'address-level1', { flex: '1 1 120px' })}
        {field('postal', f.postal, 'postal-code', { flex: '1 1 110px' })}
      </div>
      {s.showCountry && field('country', f.country, 'country-name')}
    </div>
  )
}

// ── E-signature ──────────────────────────────────────────────────────────────

/** Handwriting faces most systems already have, so nothing is downloaded. */
export const SIGNATURE_FONT = "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', 'Apple Chancery', Georgia, serif"
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

/** Strokes in pad units as an SVG. The pad keeps the stored 5:2 shape, so a
 *  signature reads back exactly as drawn at any size. */
export function SignatureStrokes({ strokes, color, width = 3.2 }: { strokes: number[][]; color: string; width?: number }) {
  return <path d={signaturePath(strokes)} fill="none" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: color }} />
}

function SignaturePad({ p, strokes, onStrokes, onKeyboard, hintId }: { p: RenderProps; strokes: number[][]; onStrokes: (next: number[][]) => void; onKeyboard?: () => void; hintId: string }) {
  const f = useFieldsUi()
  const box = useRef<HTMLDivElement>(null)
  const drawing = useRef<number[] | null>(null)
  // One pointer draws at a time: a second finger or a resting palm neither starts a stroke nor bends this one.
  const active = useRef<number | null>(null)
  const frame = useRef(0)
  const [, repaint] = useState(0)
  const live = p.mode === 'live'
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [Math.min(SIGNATURE_W, Math.max(0, ((e.clientX - r.left) / r.width) * SIGNATURE_W)), Math.min(SIGNATURE_H, Math.max(0, ((e.clientY - r.top) / r.height) * SIGNATURE_H))]
  }
  // One repaint per frame, however many points arrive.
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; repaint(n => n + 1) }) }
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live || active.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    active.current = e.pointerId
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not a live pointer (synthetic): drawing still works without capture */ }
    const [x, y] = at(e)
    drawing.current = [Math.round(x), Math.round(y)]
    schedule()
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = drawing.current
    if (!s || e.pointerId !== active.current) return
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
    const batch = native.getCoalescedEvents?.() ?? []
    for (const ev of batch.length ? batch : [native]) {
      const [x, y] = at(ev)
      if (Math.hypot(x - s[s.length - 2], y - s[s.length - 1]) >= 1.5) s.push(Math.round(x), Math.round(y))
    }
    schedule()
  }
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== active.current) return
    const s = drawing.current
    active.current = null
    drawing.current = null
    if (s) onStrokes([...strokes, s])
  }
  const shown = drawing.current ? [...strokes, drawing.current] : strokes
  const describedBy = [hintId, p.describedBy].filter(Boolean).join(' ')
  return (
    <div ref={box} id={p.inputId} role="button" tabIndex={live ? 0 : -1} aria-label={strokes.length ? f.signaturePadSigned : f.signaturePad} aria-describedby={describedBy}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onBlur={p.onBlur}
      onKeyDown={e => { if (onKeyboard && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onKeyboard() } }}
      style={{ position: 'relative', width: '100%', aspectRatio: `${SIGNATURE_W} / ${SIGNATURE_H}`, ...p.T.input, borderColor: p.invalid ? ERROR_LINE : p.theme.line, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: live ? 'crosshair' : 'default', pointerEvents: live ? 'auto' : 'none', overflow: 'hidden' }}
      data-testid="signature-pad" data-signed={strokes.length ? 'true' : 'false'}>
      <svg viewBox={`0 0 ${SIGNATURE_W} ${SIGNATURE_H}`} width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <line x1={28} x2={SIGNATURE_W - 28} y1={152} y2={152} stroke={p.theme.muted} strokeWidth={1.5} strokeDasharray="6 7" opacity={0.55} />
        <path d="M32 128l13 13M45 128l-13 13" stroke={p.theme.muted} strokeWidth={2.5} strokeLinecap="round" opacity={0.75} />
        <SignatureStrokes strokes={shown} color={p.theme.text} />
      </svg>
      {!shown.length && <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '34%', textAlign: 'center', fontSize: 15, fontWeight: 600, color: p.theme.muted, pointerEvents: 'none' }}>{f.signHere}</span>}
    </div>
  )
}

function SignatureInput(p: RenderProps) {
  const f = useFieldsUi()
  const s = signatureSettings(p.block.settings)
  // The built-in agreement speaks the form's language; one the owner wrote is shown as written.
  const agreement = s.agreement === DEFAULT_AGREEMENT ? f.agreement : s.agreement
  const v = asSignature(p.value)
  const typeOnly = s.mode === 'type'
  const [mode, setMode] = useState<'draw' | 'type'>(typeOnly || v?.kind === 'typed' ? 'type' : 'draw')
  // A signature restored after the first render (a resumed session) brings its own way of signing.
  useEffect(() => { if (v?.kind === 'typed') setMode('type'); else if (v?.kind === 'drawn') setMode('draw') }, [v?.kind])
  const current = typeOnly ? 'type' : mode
  const live = p.mode === 'live'
  const typed = v?.kind === 'typed' ? v.name : ''
  const strokes = v?.kind === 'drawn' ? v.strokes : []
  const setTyped = (name: string) => p.onChange(name.trim() ? { kind: 'typed', name } : '')
  const typeEl = useRef<HTMLInputElement | null>(null)
  const dom = useDomValue(typed, setTyped)
  const typeRef = useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => { dom(el); typeEl.current = el as HTMLInputElement | null }, [dom])
  const choose = (m: 'draw' | 'type') => {
    if (m === current) return
    // Switching how to sign starts that way afresh: a drawing never hides behind a typed name.
    setMode(m)
    p.onChange('')
    if (m === 'type') requestAnimationFrame(() => typeEl.current?.focus())
  }
  const hintId = `${p.inputId}-hint`, agreeId = `${p.inputId}-agree`
  const chip = (m: 'draw' | 'type', label: string, icon: string) => (
    <button key={m} type="button" aria-pressed={current === m} onClick={() => choose(m)} tabIndex={live ? 0 : -1} data-testid={`signature-mode-${m}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', ...p.T.input, borderRadius: 999, background: current === m ? (p.T.dark ? `${p.theme.primary}33` : `${p.theme.primary}55`) : p.theme.input, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', pointerEvents: live ? 'auto' : 'none' }}>
      <Icon name={icon} size={14} />{label}
    </button>
  )
  return (
    <div role="group" aria-labelledby={p.labelId} aria-describedby={[agreement ? agreeId : '', p.describedBy].filter(Boolean).join(' ') || undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="signature">
      {!typeOnly && <div role="group" aria-label={f.howToSign} style={{ display: 'flex', gap: 6 }}>{chip('draw', f.draw, 'signature')}{chip('type', f.type, 'type')}</div>}
      {current === 'draw'
        ? <SignaturePad p={p} strokes={strokes} onStrokes={next => p.onChange({ kind: 'drawn', strokes: next })} onKeyboard={typeOnly ? undefined : () => choose('type')} hintId={hintId} />
        : <input ref={typeRef} id={p.inputId} type="text" autoComplete="name" value={typed} onChange={e => setTyped(e.target.value)} onBlur={p.onBlur} onKeyDown={enterAdvances(p)} placeholder={f.typeFullName}
            aria-labelledby={p.labelId} aria-invalid={p.invalid || undefined} aria-required={ariaReq(p)} aria-describedby={p.describedBy} data-testid="signature-typed"
            style={inputStyle(p, { height: p.device === 'phone' ? 58 : 62, fontFamily: SIGNATURE_FONT, fontStyle: 'italic', fontSize: 26, fontWeight: 500 })} {...inert(p)} />}
      {(agreement || (current === 'draw' && strokes.length > 0 && live)) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <p id={agreeId} style={{ margin: 0, flex: 1, fontSize: 12.5, lineHeight: 1.45, color: p.theme.muted }}>{agreement}</p>
          {current === 'draw' && strokes.length > 0 && live && (
            <button type="button" onClick={() => p.onChange('')} data-testid="signature-clear"
              style={{ flex: 'none', border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 800, color: p.theme.text, textDecoration: 'underline', textDecorationThickness: 2, textUnderlineOffset: 3, cursor: 'pointer' }}>{f.clear}</button>
          )}
        </div>
      )}
      {current === 'draw' && <span id={hintId} style={srOnly}>{f.drawHint}{typeOnly ? '' : f.drawHintType}</span>}
    </div>
  )
}

// ── Display blocks ───────────────────────────────────────────────────────────

export interface DisplayProps {
  block: Block
  theme: Theme
  T: ThemeStyles
  mode: Mode
  device: Device
  /** Text already interpolated (live) or raw (edit). */
  text: string
  description: string
  /** Builder: inline editor for the block's label / description. */
  edit?: { onLabel: (v: string) => void; onDescription: (v: string) => void; selected: boolean; onKeyDown?: (e: React.KeyboardEvent) => void }
  headingId?: string
}

function AutoTextarea({ value, onChange, style, placeholder, ariaLabel, onKeyDown, testId }: { value: string; onChange: (v: string) => void; style: React.CSSProperties; placeholder: string; ariaLabel: string; onKeyDown?: (e: React.KeyboardEvent) => void; testId?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ref.current; if (!el || 'fieldSizing' in el.style) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }, [value])
  return <textarea ref={ref} aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} rows={1} placeholder={placeholder} onKeyDown={onKeyDown} data-testid={testId}
    onClick={e => e.stopPropagation()} style={{ width: '100%', border: 0, background: 'transparent', padding: 0, margin: 0, resize: 'none', overflow: 'hidden', fieldSizing: 'content', textAlign: 'inherit', ...style } as React.CSSProperties} />
}

function HeadingBlock(d: DisplayProps) {
  const s = blockSettings<{ level: 1 | 2 }>(d.block)
  const size = s.level === 2 ? (d.device === 'phone' ? 21 : 24) : (d.device === 'phone' ? 26 : 30)
  const style: React.CSSProperties = { margin: 0, fontFamily: d.T.headFont, fontSize: size, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.15, color: d.theme.text, textWrap: 'pretty' } as React.CSSProperties
  if (d.mode === 'edit' && d.edit) return <AutoTextarea ariaLabel="Heading text" value={d.text} onChange={d.edit.onLabel} placeholder="Heading" style={style} onKeyDown={d.edit.onKeyDown} testId="heading-input" />
  return s.level === 2 ? <h2 id={d.headingId} style={style}>{d.text}</h2> : <h1 id={d.headingId} style={style}>{d.text}</h1>
}

function ParagraphBlock(d: DisplayProps) {
  const style: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.6, color: d.theme.muted, textWrap: 'pretty', whiteSpace: 'pre-wrap' } as React.CSSProperties
  if (d.mode === 'edit' && d.edit) return <AutoTextarea ariaLabel="Paragraph text" value={d.text} onChange={d.edit.onLabel} placeholder="Write a sentence or two." style={{ ...style, whiteSpace: undefined }} onKeyDown={d.edit.onKeyDown} testId="paragraph-input" />
  return <p style={style}>{d.text}</p>
}

function BannerBlock(d: DisplayProps) {
  const s = blockSettings<{ tone: 'info' | 'success' | 'warning' | 'danger' }>(d.block)
  const tone = s.tone === 'success' ? { bg: 'var(--lime-bg)', fg: 'var(--lime-tx)', icon: 'check-circle' } : s.tone === 'warning' ? { bg: 'var(--gold-bg)', fg: 'var(--gold-tx)', icon: 'alert' } : s.tone === 'danger' ? { bg: 'var(--coral-bg)', fg: 'var(--coral-tx)', icon: 'alert' } : { bg: d.theme.content, fg: d.theme.text, icon: 'megaphone' }
  const style: React.CSSProperties = { margin: 0, fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, color: tone.fg, whiteSpace: 'pre-wrap' }
  return (
    <div role={s.tone === 'danger' || s.tone === 'warning' ? 'alert' : 'note'} style={{ display: 'flex', gap: 10, padding: '12px 14px', border: `2px solid ${d.theme.line}`, borderRadius: d.theme.radius, background: tone.bg, color: tone.fg }}>
      <span style={{ flex: 'none', marginTop: 2 }}><Icon name={tone.icon} size={16} /></span>
      {d.mode === 'edit' && d.edit ? <AutoTextarea ariaLabel="Banner text" value={d.text} onChange={d.edit.onLabel} placeholder="Something worth knowing." style={{ ...style, whiteSpace: undefined }} onKeyDown={d.edit.onKeyDown} /> : <p style={style}>{d.text}</p>}
    </div>
  )
}

function DividerBlock(d: DisplayProps) {
  return <hr aria-hidden="true" style={{ border: 0, borderTop: `2px solid ${d.theme.line}`, opacity: .5, margin: '4px 0', width: '100%' }} />
}

function ImageBlock(d: DisplayProps) {
  const s = blockSettings<{ url: string; alt: string; size: 'full' | 'half' | 'small'; align: 'left' | 'center' }>(d.block)
  const width = s.size === 'half' ? '50%' : s.size === 'small' ? 200 : '100%'
  if (!s.url) return (
    <div style={{ height: 160, border: `2px dashed ${d.theme.line}`, borderRadius: d.theme.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: d.theme.muted, fontSize: 13, fontWeight: 600 }}>
      <Icon name="image" size={18} /> {d.mode === 'edit' ? 'Add an image from the settings panel' : ''}
    </div>
  )
  return <div style={{ display: 'flex', justifyContent: s.align === 'center' ? 'center' : 'flex-start' }}><img src={s.url} alt={s.alt} style={{ width, maxWidth: '100%', borderRadius: d.theme.radius, display: 'block' }} /></div>
}

function VideoBlock(d: DisplayProps) {
  const s = blockSettings<{ url: string }>(d.block)
  const embed = s.url ? videoEmbedUrl(s.url) : null
  if (!embed) return (
    <div style={{ height: 160, border: `2px dashed ${d.theme.line}`, borderRadius: d.theme.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: d.theme.muted, fontSize: 13, fontWeight: 600 }}>
      <Icon name="play" size={18} /> {s.url ? 'Only YouTube, Vimeo and Loom links can be embedded' : d.mode === 'edit' ? 'Paste a YouTube, Vimeo or Loom link in the settings panel' : ''}
    </div>
  )
  return <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: d.theme.radius, overflow: 'hidden', border: `2px solid ${d.theme.line}`, background: d.theme.content }}>
    {d.mode === 'edit' ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: d.theme.muted, fontSize: 13, fontWeight: 700 }}><Icon name="play" size={28} /></div>
      : <iframe src={embed} title={d.block.label || 'Video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />}
  </div>
}

function ButtonBlock(d: DisplayProps) {
  const s = blockSettings<{ url: string; style: 'primary' | 'secondary'; newTab: boolean }>(d.block)
  const safe = safeMediaUrl(s.url)
  const style: React.CSSProperties = s.style === 'primary'
    ? { height: 48, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', ...d.T.button }
    : { height: 48, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', background: d.theme.content, color: d.theme.text, border: `2px solid ${d.theme.line}`, borderRadius: d.theme.radius, boxShadow: `3px 3px 0 ${d.theme.line}` }
  if (d.mode === 'edit' && d.edit) return <div style={style}><input aria-label="Button text" value={d.text} onChange={e => d.edit!.onLabel(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Button text" style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', width: Math.max(60, d.text.length * 9) }} /><Icon name="external" size={15} /></div>
  return <a href={safe || '#'} target={s.newTab ? '_blank' : undefined} rel={s.newTab ? 'noopener noreferrer' : undefined} style={style}>{d.text}<Icon name="external" size={15} /></a>
}

function SectionBlock(d: DisplayProps) {
  const title: React.CSSProperties = { margin: 0, fontFamily: d.T.headFont, fontSize: d.device === 'phone' ? 19 : 21, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.2, color: d.theme.text }
  const desc: React.CSSProperties = { margin: 0, fontSize: 13.5, lineHeight: 1.5, color: d.theme.muted }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6, borderTop: `2px solid ${d.theme.line}22` }} data-section>
      {d.mode === 'edit' && d.edit ? <AutoTextarea ariaLabel="Section title" value={d.text} onChange={d.edit.onLabel} placeholder="Section" style={title} onKeyDown={d.edit.onKeyDown} /> : <h2 id={d.headingId} style={title}>{d.text}</h2>}
      {(d.description || (d.mode === 'edit' && d.edit?.selected)) && (d.mode === 'edit' && d.edit ? <AutoTextarea ariaLabel="Section description" value={d.description} onChange={d.edit.onDescription} placeholder="Add a description" style={desc} /> : <p style={desc}>{d.description}</p>)}
    </div>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const INPUT_RENDERERS: Partial<Record<ComponentType, React.FC<RenderProps>>> = {
  short: TextInput, email: TextInput, url: TextInput, hidden: TextInput, number: NumberInput, long: LongInput, phone: PhoneInput,
  dropdown: DropdownInput, choice: ChoiceInput, checks: ChoiceInput, picture: ChoiceInput, yesno: YesNoInput, switch: SwitchInput, ranking: RankingInput, matrix: MatrixInput,
  date: DateInput, datetime: DateInput, time: DateInput, daterange: DateRangeInput, rating: RatingInput, scale: ScaleInput, upload: UploadInput, address: AddressInput, signature: SignatureInput,
}

export const DISPLAY_RENDERERS: Partial<Record<ComponentType, React.FC<DisplayProps>>> = {
  heading: HeadingBlock, paragraph: ParagraphBlock, banner: BannerBlock, divider: DividerBlock, image: ImageBlock, video: VideoBlock, button: ButtonBlock, section: SectionBlock,
}

export function useIds(block: Block): { inputId: string; labelId: string; descId: string; errId: string } {
  const base = useId()
  void base
  return { inputId: `in-${block.id}`, labelId: `lb-${block.id}`, descId: `ds-${block.id}`, errId: `er-${block.id}` }
}
