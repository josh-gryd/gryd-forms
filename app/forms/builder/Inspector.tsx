'use client'

// The sidebar's Page and Field panels. Field shows the selected block's own
// settings — header, toggles, the type's controls, width, dynamic text,
// logic; Page shows the current page's, or the ending's when one is open.
// Rules are only summarised here: they live in the Logic section.

import React, { useState } from 'react'
import { componentDef, conversionTargets, isInputBlock, rulesUsingBlock, rulesTargeting, ruleSentence, checkRules, isConditionalPage, PHONE_COUNTRIES, PHONE_PREFERRED, answerToken, answerPages, DEFAULT_AGREEMENT, type Block, type Page, type Ending, type BlockWidth } from '@/lib/forms-core/index'
import { Field, Input, Select, Textarea, Toggle, Seg, Btn, Kbd, IconBtn, Banner, menuAnchor } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder, type BuilderApi } from './context'
import { locate, setOptionsFromText } from './ops'

function Sect({ children, top }: { children: React.ReactNode; top?: boolean }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: top ? '1.5px solid var(--line2)' : undefined, paddingTop: top ? 12 : 0 }}>{children}</div>
}

function NumberField({ label, value, onChange, hint, min, max, step }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; hint?: string; min?: number; max?: number; step?: number }) {
  return <Field label={label} hint={hint}><Input type="number" inputMode="numeric" value={value ?? ''} min={min} max={max} step={step} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} data-testid={`num-${label.replace(/\s+/g, '-').toLowerCase()}`} /></Field>
}

function PanelHeader({ icon, title, sub, menuLabel, onMenu, testId }: { icon: string; title: string; sub: string; menuLabel: string; onMenu: (el: HTMLElement) => void; testId: string }) {
  return (
    <div className="fb-card fb-card--flat" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px 9px 12px', borderRadius: 12, flex: 'none' }} data-testid={testId}>
      <span className="fb-tile__icon" style={{ borderRadius: '50%', flex: 'none' }}><Icon name={icon} size={15} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <strong style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="side-panel-title">{title}</strong>
        <span style={{ fontSize: 12, color: 'var(--mut2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="side-panel-sub">{sub}</span>
      </span>
      <IconBtn icon="more-v" label={menuLabel} size="sm" onClick={e => onMenu(e.currentTarget)} data-testid="side-panel-menu" />
    </div>
  )
}

// The type's own settings, split into the on/off ones (they stack in the
// toggles card under Required and Description), the ones that change how the
// field looks (List or Pills — near the top, under Type, where people look for
// them: QA 2026-10-16 found them only at the bottom) and everything else.
function settingsFor(api: BuilderApi, block: Block): { toggles: React.ReactNode[]; rows: React.ReactNode[]; look: React.ReactNode[] } {
  const s = block.settings
  const set = (patch: Record<string, unknown>, typing = false) => api.updateBlock(block.id, b => { b.settings = { ...b.settings, ...patch } }, typing)
  const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : null)
  const str = (k: string, fb = '') => (typeof s[k] === 'string' ? (s[k] as string) : fb)
  const bool = (k: string, fb = false) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : fb)
  const t = block.type
  const toggles: React.ReactNode[] = []
  const rows: React.ReactNode[] = []
  const look: React.ReactNode[] = []
  if (t === 'short' || t === 'long') {
    rows.push(<div key="len" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><NumberField label="Min characters" value={num('minLength')} onChange={v => set({ minLength: v })} min={0} /><NumberField label="Max characters" value={num('maxLength')} onChange={v => set({ maxLength: v })} min={1} /></div>)
    if (t === 'short') rows.push(<Field key="ac" label="Autofill hint" hint="Lets browsers fill this from the respondent's saved details."><Select value={str('autoComplete')} onChange={e => set({ autoComplete: e.target.value })}><option value="">None</option><option value="given-name">First name</option><option value="family-name">Last name</option><option value="name">Full name</option><option value="organization">Company</option><option value="organization-title">Job title</option><option value="street-address">Street address</option><option value="postal-code">Postal code</option></Select></Field>)
    if (t === 'long') rows.push(<NumberField key="rows" label="Rows" value={num('rows') ?? 3} onChange={v => set({ rows: v ?? 3 })} min={2} max={20} />)
  }
  if (t === 'email') toggles.push(<Toggle key="work" on={bool('workOnly')} onChange={v => set({ workOnly: v })} label="Work emails only" sub="No gmail, outlook, yahoo" />)
  if (t === 'url') toggles.push(<Toggle key="https" on={bool('httpsOnly')} onChange={v => set({ httpsOnly: v })} label="Require https://" />)
  if (t === 'number') { rows.push(<div key="mm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><NumberField label="Min" value={num('min')} onChange={v => set({ min: v })} /><NumberField label="Max" value={num('max')} onChange={v => set({ max: v })} /></div>); toggles.push(<Toggle key="int" on={bool('integer')} onChange={v => set({ integer: v })} label="Whole numbers only" />) }
  if (t === 'phone') {
    const preferred = PHONE_PREFERRED.map(iso => PHONE_COUNTRIES.find(c => c.iso === iso)!).filter(Boolean)
    const rest = PHONE_COUNTRIES.filter(c => !PHONE_PREFERRED.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name))
    rows.push(<Field key="cc" label="Default country"><Select value={str('defaultCountry', 'US')} onChange={e => set({ defaultCountry: e.target.value })}>{preferred.map(c => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>)}<option disabled>──────</option>{rest.map(c => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>)}</Select></Field>)
  }
  if (t === 'checks' || t === 'picture') rows.push(<div key="sel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><NumberField label="Min selections" value={num('min')} onChange={v => set({ min: v })} min={0} /><NumberField label="Max selections" value={num('max')} onChange={v => set({ max: v })} min={1} /></div>)
  if (t === 'picture') toggles.push(<Toggle key="multi" on={bool('multiple')} onChange={v => set({ multiple: v })} label="Allow several" />)
  if (t === 'checks' || t === 'choice') look.push(<Field key="layout" label="Layout" hint={str('layout', 'list') === 'inline' ? 'Options sit side by side and wrap, like tags. Best for short labels.' : 'One option per row, full width.'}><Seg value={str('layout', 'list') === 'inline' ? 'inline' : 'list'} options={[{ value: 'list', label: 'List' }, { value: 'inline', label: 'Pills' }]} onChange={v => set({ layout: v })} grow label="Option layout" testId="insp-layout" /></Field>)
  if ((t === 'checks' || t === 'choice') && str('layout', 'list') === 'inline') look.push(<Field key="indicator" label="Selection shows as" hint={str('indicator', 'mark') === 'fill' ? 'A picked pill fills in. Screen readers still hear it as checked.' : t === 'checks' ? 'A box in each pill, ticked when picked.' : 'A circle in each pill, dotted when picked.'}><Seg value={str('indicator', 'mark') === 'fill' ? 'fill' : 'mark'} options={[{ value: 'mark', label: t === 'checks' ? 'Box and fill' : 'Circle and fill' }, { value: 'fill', label: 'Fill only' }]} onChange={v => set({ indicator: v })} grow label="Selection style" testId="insp-indicator" /></Field>)
  if (t === 'yesno') rows.push(<div key="yn" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Field label="Yes label"><Input value={str('yesLabel', 'Yes')} onChange={e => set({ yesLabel: e.target.value }, true)} /></Field><Field label="No label"><Input value={str('noLabel', 'No')} onChange={e => set({ noLabel: e.target.value }, true)} /></Field></div>)
  if (t === 'switch') rows.push(<Field key="on" label="Text beside the switch"><Input value={str('onLabel')} onChange={e => set({ onLabel: e.target.value }, true)} placeholder="I agree to the terms" /></Field>)
  if (t === 'date' || t === 'datetime' || t === 'daterange') rows.push(
    <Field key="allow" label="Allowed dates"><Seg value={str('allow', 'any')} options={[{ value: 'any', label: 'Any' }, { value: 'future', label: 'Future' }, { value: 'past', label: 'Past' }]} onChange={v => set({ allow: v })} grow label="Allowed dates" /></Field>,
    <div key="mm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Field label="Earliest"><Input type="date" value={str('min')} onChange={e => set({ min: e.target.value })} /></Field><Field label="Latest"><Input type="date" value={str('max')} onChange={e => set({ max: e.target.value })} /></Field></div>,
  )
  if (t === 'rating') rows.push(<div key="r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><NumberField label="Steps" value={num('max') ?? 5} onChange={v => set({ max: v ?? 5 })} min={3} max={10} /><Field label="Icon"><Select value={str('icon', 'star')} onChange={e => set({ icon: e.target.value })}><option value="star">Star</option><option value="heart">Heart</option><option value="thumb">Thumbs up</option></Select></Field></div>)
  if (t === 'scale') rows.push(<div key="s" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><NumberField label="From" value={num('min') ?? 1} onChange={v => set({ min: v ?? 1 })} min={0} max={10} /><NumberField label="To" value={num('max') ?? 10} onChange={v => set({ max: v ?? 10 })} min={1} max={20} /></div>, <div key="sl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Field label="Low label"><Input value={str('minLabel')} onChange={e => set({ minLabel: e.target.value }, true)} placeholder="Not likely" /></Field><Field label="High label"><Input value={str('maxLabel')} onChange={e => set({ maxLabel: e.target.value }, true)} placeholder="Very likely" /></Field></div>)
  if (t === 'upload') rows.push(
    <Field key="accept" label="Allowed files"><Select value={str('accept', 'docs-images')} onChange={e => set({ accept: e.target.value })} data-testid="upload-accept"><option value="docs-images">Documents and images</option><option value="docs">Documents only</option><option value="images">Images only</option><option value="any">Any file</option></Select></Field>,
    <div key="lim" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Field label="Max size"><Select value={String(num('maxSizeMb') ?? 25)} onChange={e => set({ maxSizeMb: Number(e.target.value) })}><option value="5">5 MB</option><option value="10">10 MB</option><option value="25">25 MB</option><option value="50">50 MB</option><option value="100">100 MB</option></Select></Field><NumberField label="Max files" value={num('maxFiles') ?? 1} onChange={v => set({ maxFiles: v ?? 1 })} min={1} max={10} /></div>,
  )
  if (t === 'signature') rows.push(
    <Field key="sm" label="How people sign" hint={str('mode', 'both') === 'type' ? 'Everyone types their full name.' : 'Drawing works with a mouse, finger or stylus. Typing stays available, so no one is shut out.'}><Seg value={str('mode', 'both') === 'type' ? 'type' : 'both'} options={[{ value: 'both', label: 'Draw or type' }, { value: 'type', label: 'Type only' }]} onChange={v => set({ mode: v })} grow label="How people sign" /></Field>,
    <Field key="ag" label="Agreement" hint="Shown under the signature. Leave it empty to show nothing."><Textarea rows={3} value={str('agreement', DEFAULT_AGREEMENT)} onChange={e => set({ agreement: e.target.value }, true)} data-testid="signature-agreement" /></Field>,
  )
  if (t === 'address') toggles.push(<Toggle key="l2" on={bool('showLine2', true)} onChange={v => set({ showLine2: v })} label="Second address line" />, <Toggle key="co" on={bool('showCountry', true)} onChange={v => set({ showCountry: v })} label="Country" />)
  if (t === 'heading') rows.push(<Field key="lvl" label="Size"><Seg value={String(s.level === 2 ? 2 : 1)} options={[{ value: '1', label: 'Large' }, { value: '2', label: 'Small' }]} onChange={v => set({ level: Number(v) })} grow label="Heading size" /></Field>)
  if (t === 'banner') rows.push(<Field key="tone" label="Tone"><Select value={str('tone', 'info')} onChange={e => set({ tone: e.target.value })}><option value="info">Note</option><option value="success">Success</option><option value="warning">Warning</option><option value="danger">Important</option></Select></Field>)
  if (t === 'image') rows.push(
    <Field key="url" label="Image"><div style={{ display: 'flex', gap: 6 }}><Input value={str('url')} onChange={e => set({ url: e.target.value }, true)} placeholder="https://… or upload" /><ImageUpload onUrl={url => set({ url })} /></div></Field>,
    <Field key="alt" label="Alt text" hint="Read by screen readers. Leave empty for decoration."><Input value={str('alt')} onChange={e => set({ alt: e.target.value }, true)} /></Field>,
    <div key="sz" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Field label="Size"><Select value={str('size', 'full')} onChange={e => set({ size: e.target.value })}><option value="full">Full width</option><option value="half">Half</option><option value="small">Small</option></Select></Field><Field label="Align"><Select value={str('align', 'left')} onChange={e => set({ align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option></Select></Field></div>,
  )
  if (t === 'video') rows.push(<Field key="v" label="Video link" hint="YouTube, Vimeo or Loom."><Input value={str('url')} onChange={e => set({ url: e.target.value }, true)} placeholder="https://www.youtube.com/watch?v=…" /></Field>)
  if (t === 'button') { rows.push(<Field key="u" label="Link"><Input value={str('url')} onChange={e => set({ url: e.target.value }, true)} placeholder="https://" /></Field>, <Field key="st" label="Style"><Seg value={str('style', 'secondary')} options={[{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }]} onChange={v => set({ style: v })} grow label="Button style" /></Field>); toggles.push(<Toggle key="nt" on={bool('newTab', true)} onChange={v => set({ newTab: v })} label="Open in a new tab" />) }
  if (t === 'hidden') rows.push(<Field key="p" label="URL parameter" hint="?source=… fills this field."><Input mono value={str('paramName')} onChange={e => set({ paramName: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') }, true)} placeholder="source" data-testid="hidden-param" /></Field>, <Field key="dv" label="Default value"><Input value={str('defaultValue')} onChange={e => set({ defaultValue: e.target.value }, true)} /></Field>)
  if (t === 'matrix') {
    const mrows = (Array.isArray(s.rows) ? (s.rows as Array<{ id: string; label: string }>) : [])
    rows.push(<Field key="mr" label="Rows" hint="One per line."><Textarea rows={4} value={mrows.map(r => r.label).join('\n')} onChange={e => { const lines = e.target.value.split('\n'); const next = lines.map((label, i) => ({ id: mrows[i]?.id ?? `row_${Math.random().toString(36).slice(2, 10)}`, label })); set({ rows: next }, true) }} /></Field>)
    toggles.push(<Toggle key="mm" on={bool('multiple')} onChange={v => set({ multiple: v })} label="Allow several per row" />)
  }
  return { toggles, rows, look }
}

function ImageUpload({ onUrl }: { onUrl: (url: string) => void }) {
  const api = useBuilder()
  const [busy, setBusy] = useState(false)
  return (
    <label className="fb-btn" style={{ flex: 'none', cursor: 'pointer' }} aria-label="Upload image">
      <Icon name="upload" size={14} />{busy ? '…' : ''}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); const url = await api.uploadAsset(f); setBusy(false); if (url) onUrl(url) }} />
    </label>
  )
}

function DynamicText({ onInsert }: { onInsert: (token: string) => void }) {
  const api = useBuilder()
  const fields = api.def.pages.flatMap(p => p.blocks).filter(b => isInputBlock(b) && b.type !== 'upload' && b.type !== 'signature')
  if (!fields.length) return null
  return (
    <Field label="Insert an answer" hint="Adds {{answer}} text that fills in what the respondent typed earlier.">
      <Select value="" onChange={e => { if (e.target.value) onInsert(answerToken(e.target.value)) ; e.target.value = '' }} data-testid="variable-picker">
        <option value="">Choose a field…</option>
        {fields.map(f => <option key={f.id} value={f.id}>{f.label || componentDef(f.type).label}</option>)}
      </Select>
    </Field>
  )
}

function OptionsText({ block }: { block: Block }) {
  const api = useBuilder()
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? block.options.map(o => o.label).join('\n')
  return <Textarea aria-label="Options, one per line" rows={Math.min(10, Math.max(4, block.options.length + 1))} value={text} data-testid="insp-options"
    onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== null) { api.updateBlock(block.id, b => { void b }, false); api.mutate(def => setOptionsFromText(def, block.id, draft)); setDraft(null) } }} />
}

const PANEL: React.CSSProperties = { flex: 1, minHeight: 0, padding: '0 12px 24px', display: 'flex', flexDirection: 'column', gap: 14 }

/** Field tab: the selected block. Not keyed by block, so picking another
 *  field swaps the content in place and keeps the scroll position. */
export function FieldPanel() {
  const api = useBuilder()
  const loc = api.sel ? locate(api.def, api.sel) : null
  if (!loc) {
    return (
      <section aria-label="Field settings" className="fb-scroll" style={PANEL} data-testid="field-panel">
        <p style={{ margin: 0, padding: '8px 2px', fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }} data-testid="field-panel-empty">Click a field on the form to edit it here.</p>
      </section>
    )
  }
  const block = loc.block
  const d = componentDef(block.type)
  const input = isInputBlock(block)
  const using = rulesUsingBlock(api.def, block.id)
  const rules = using.concat(rulesTargeting(api.def, block.id).filter(r => !using.includes(r)))
  const issues = checkRules(api.def)
  const descOn = block.description !== '' || api.descOpen.has(block.id)
  const textual = block.type !== 'slot' && block.type !== 'divider' && block.type !== 'image' && block.type !== 'video'
  const where = loc.kind === 'page' ? `Page ${api.def.pages.findIndex(p => p.id === loc.containerId) + 1}` : (api.def.endings.find(e => e.id === loc.containerId)?.name ?? 'Ending')
  const { toggles, rows, look } = settingsFor(api, block)
  const openLogic = () => { api.setLogicFilter(block.id); api.setTab('logic') }
  return (
    <section aria-label="Field settings" className="fb-scroll" style={PANEL} data-testid="field-panel">
      <PanelHeader icon={d.icon} title={d.label} sub={`${where} · field ${loc.index + 1} of ${loc.blocks.length}`} menuLabel="Field actions" onMenu={el => api.blockMenu(block.id, menuAnchor(el), el)} testId="field-header" />
      {conversionTargets(block.type).length > 0 && (
        <Field label="Type" hint="Switching keeps the question, its settings where they still apply, and every past response." htmlFor="insp-type">
          <Select id="insp-type" value={block.type} onChange={e => api.changeType(block.id, e.target.value as Block['type'])} data-testid="insp-type">
            {[block.type, ...conversionTargets(block.type)].map(t => <option key={t} value={t}>{componentDef(t).label}</option>)}
          </Select>
        </Field>
      )}
      {look}
      {rules.length > 0 && (
        <Banner tone="gold" inline icon="branch" role="status" style={{ padding: '8px 12px' }} action={<button type="button" className="fb-link" onClick={openLogic} data-testid="field-open-logic">Open logic</button>}>
          Used in {rules.length} rule{rules.length === 1 ? '' : 's'}
        </Banner>
      )}
      {(input || d.hasDescription || toggles.length > 0) && (
        <div className="fb-togglecard" data-testid="field-toggles">
          {input && <Toggle on={block.required} onChange={() => api.toggleRequired(block.id)} label="Required" testId="insp-required" />}
          {d.hasDescription && <Toggle on={descOn} onChange={v => { api.setDescOpen(block.id, v); if (!v) api.updateBlock(block.id, { description: '' }) }} label="Description" testId="insp-description" />}
          {toggles}
        </div>
      )}
      {d.hasPlaceholder && <Field label="Placeholder"><Input value={block.placeholder} onChange={e => api.updateBlock(block.id, { placeholder: e.target.value }, true)} placeholder="Example answer" data-testid="insp-placeholder" /></Field>}
      {d.hasOptions && block.type !== 'matrix' && (
        <Field label={<>{block.type === 'ranking' ? 'Items' : 'Options'} <span className="fb-mono" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--mut2)' }}>· {block.options.length}</span></>} hint="One per line. Paste a list to add many at once.">
          <OptionsText block={block} />
        </Field>
      )}
      {block.type === 'matrix' && <Field label={<>Columns <span className="fb-mono" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--mut2)' }}>· {block.options.length}</span></>} hint="One per line."><OptionsText block={block} /></Field>}
      {rows.length > 0 && <Sect top>{rows}</Sect>}
      {block.type !== 'slot' && (
        <Sect top>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="fb-caps fb-caps--tx2">Width</div>
            <Seg<BlockWidth> value={block.width} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }, { value: 'third', label: 'Third' }]} onChange={w => api.setWidth(block.id, w)} grow label="Width" className="fb-seg--card" />
            <span style={{ fontSize: 12, color: 'var(--mut2)' }}>Columns stack on phones. Neighbouring fields with the same width share a row.</span>
          </div>
        </Sect>
      )}
      {textual && <Sect top><DynamicText onInsert={tok => api.updateBlock(block.id, b => { b.label = b.label ? `${b.label} ${tok}` : tok })} /></Sect>}
      {input && (
        <details className="fb-details" open={rules.length > 0} style={{ borderTop: '1.5px solid var(--line2)', paddingTop: 12 }} data-testid="insp-logic">
          <summary><span style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={14} /></span><span style={{ flex: 1 }}>Logic</span><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mut2)' }}>{rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : 'none'}</span></summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            {rules.map(r => { const broken = issues.some(i => i.ruleId === r.id); return <button key={r.id} type="button" className={`fb-rule-link${broken ? ' fb-rule-link--broken' : ''}`} onClick={openLogic}>{ruleSentence(api.def, r)}</button> })}
            <Btn dashed size="sm" icon="plus" onClick={() => { api.addRule({ fieldId: block.id }); openLogic() }} testId="insp-add-rule">Rule using this field</Btn>
          </div>
        </details>
      )}
      <details className="fb-details" style={{ borderTop: '1.5px solid var(--line2)', paddingTop: 12 }}>
        <summary><span style={{ flex: 1 }}>Advanced</span><span style={{ color: 'var(--mut2)', display: 'grid', placeItems: 'center' }}><Icon name="chevron-down" size={14} /></span></summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
          <Field label="Field key" hint="Stable id used in CSV columns, rules and dynamic text."><Input readOnly value={block.id} /></Field>
        </div>
      </details>
    </section>
  )
}

function PageSettings({ page }: { page: Page }) {
  const api = useBuilder()
  const cond = isConditionalPage(api.def, page.id)
  const rules = api.def.rules.filter(r => (r.then.type === 'show_page' || r.then.type === 'skip_page' || r.then.type === 'go_to_page') && r.then.target === page.id)
  const pages = answerPages(api.def)
  const isLast = pages[pages.length - 1]?.id === page.id
  return (
    <>
      <Field label="Page name" hint="Only you see this. It labels the page in the strip and in results."><Input value={page.name} onChange={e => api.updatePage(page.id, { name: e.target.value }, true)} data-testid="insp-page-name" /></Field>
      <Field label="Button label"><Input value={page.buttonLabel} onChange={e => api.updatePage(page.id, { buttonLabel: e.target.value }, true)} placeholder={page.kind === 'cover' ? 'Start' : isLast ? 'Submit' : 'Continue'} data-testid="insp-page-button" /></Field>
      <Field label={<>Progress <span style={{ fontWeight: 600, color: 'var(--mut2)', textTransform: 'none', letterSpacing: 0 }}>· whole form</span></>}>
        <Select value={api.def.settings.progress} onChange={e => api.updateSettings({ progress: e.target.value as typeof api.def.settings.progress })} data-testid="insp-progress"><option value="bar">Bar with page count</option><option value="pages">Page count only</option><option value="stages">Named stages</option><option value="none">None</option></Select>
      </Field>
      {api.def.settings.progress === 'stages' && page.kind === 'page' && <Field label="Stage name" hint="Pages with the same stage share a step."><Input value={page.stage} onChange={e => api.updatePage(page.id, { stage: e.target.value }, true)} placeholder="About you" /></Field>}
      {page.kind === 'page' && (
        <Sect top>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}><span style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={14} /></span>Shown</span>
          {cond ? rules.map(r => <button key={r.id} type="button" className="fb-rule-link" onClick={() => api.setTab('logic')}>{ruleSentence(api.def, r)}</button>)
            : <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Always, in order. <button type="button" className="fb-link" onClick={() => { api.addRule({ action: 'show_page', target: page.id }); api.setTab('logic') }} data-testid="insp-add-condition">Add a condition</button></span>}
        </Sect>
      )}
      <Sect top>
        <div className="fb-caps fb-caps--tx2">Shortcuts</div>
        {[['Add a field', '/'], ['Field after this one', '↵'], ['Duplicate', '⌘D'], ['Delete', '⌫'], ['Undo · Redo', '⌘Z · ⌘⇧Z'], ['Preview', '⌘↵'], ['Switch section', '← →']].map(([what, key]) => <div key={what} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx2)' }}><span style={{ flex: 1 }}>{what}</span><Kbd>{key}</Kbd></div>)}
      </Sect>
    </>
  )
}

function EndingSettings({ ending }: { ending: Ending }) {
  const api = useBuilder()
  const rules = rulesTargeting(api.def, ending.id)
  const isDefault = rules.length === 0 && (api.def.endings.find(e => rulesTargeting(api.def, e.id).length === 0)?.id === ending.id)
  return (
    <>
      <Field label="Ending name"><Input value={ending.name} onChange={e => api.updateEnding(ending.id, { name: e.target.value }, true)} data-testid="insp-ending-name" /></Field>
      <Field label="Type"><Seg value={ending.kind} options={[{ value: 'message', label: 'Message' }, { value: 'redirect', label: 'Redirect' }, { value: 'restart', label: 'Restart' }]} onChange={v => api.updateEnding(ending.id, { kind: v })} grow label="Ending type" /></Field>
      {ending.kind === 'message' && <Field label="Button link" hint="Where the optional button goes."><Input value={ending.buttonUrl} onChange={e => api.updateEnding(ending.id, { buttonUrl: e.target.value }, true)} placeholder="https://" data-testid="insp-ending-url" /></Field>}
      {ending.kind === 'redirect' && <Field label="Redirect to"><Input value={ending.redirectUrl} onChange={e => api.updateEnding(ending.id, { redirectUrl: e.target.value }, true)} placeholder="https://" /></Field>}
      {ending.kind !== 'redirect' && <Toggle on={ending.confetti} onChange={v => api.updateEnding(ending.id, { confetti: v })} label="Confetti" sub="A short burst when the ending shows." />}
      <Sect top><DynamicText onInsert={tok => api.updateEnding(ending.id, { title: ending.title ? `${ending.title} ${tok}` : tok })} /></Sect>
      <Sect top>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}><span style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={14} /></span>Reached</span>
        {rules.map(r => <button key={r.id} type="button" className="fb-rule-link" onClick={() => api.setTab('logic')}>{ruleSentence(api.def, r)}</button>)}
        {isDefault && <span style={{ fontSize: 13, color: 'var(--tx2)' }} data-testid="default-ending-copy">By everyone no other rule sends elsewhere. This is the default ending.</span>}
        {!isDefault && rules.length === 0 && <span style={{ fontSize: 13, color: 'var(--tx2)' }}>No rule sends anyone here yet. <button type="button" className="fb-link" onClick={() => { api.addRule({ action: 'go_to_ending', target: ending.id }); api.setTab('logic') }}>Add a rule</button></span>}
      </Sect>
    </>
  )
}

/** Page tab: the current page, or the ending when one is open. */
export function PagePanel() {
  const api = useBuilder()
  const page = api.curPage, ending = api.curEnding
  const pages = api.def.pages, endings = api.def.endings
  const title = page ? page.name : ending ? ending.name : ''
  const sub = page ? `${page.kind === 'cover' ? 'Cover · ' : ''}Page ${pages.findIndex(p => p.id === page.id) + 1} of ${pages.length}` : ending ? `Ending ${endings.findIndex(e => e.id === ending.id) + 1} of ${endings.length}` : ''
  return (
    <section aria-label={page ? 'Page settings' : 'Ending settings'} className="fb-scroll" style={PANEL} data-testid="page-panel">
      <PanelHeader icon={page ? 'file-text' : 'check-circle'} title={title} sub={sub} menuLabel={page ? 'Page actions' : 'Ending actions'} onMenu={el => { if (page) api.pageMenu(page.id, menuAnchor(el)); else if (ending) api.endingMenu(ending.id, menuAnchor(el)) }} testId="page-header" />
      {page ? <PageSettings page={page} /> : ending ? <EndingSettings ending={ending} /> : null}
    </section>
  )
}
