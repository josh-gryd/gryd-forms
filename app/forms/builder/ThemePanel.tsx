'use client'

// Theme section: the sidebar shows this in place of Fields · Page · Field —
// presets, the eight colours, type, width / radius / spacing / container /
// alignment, brand. Theme is whole-form: nothing here is per field. Contrast
// is checked live and the fix is one click, per §14.

import { useId, useRef, useState } from 'react'
import { DEFAULT_THEME, THEME_PRESETS, PRESET_NAMES, contrastWarnings, type Theme } from '@/lib/forms-core/index'
import { Banner, Btn, Seg, Toggle } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder } from './context'

const COLOURS: Array<{ key: keyof Theme; label: string }> = [
  { key: 'bg', label: 'Background' }, { key: 'content', label: 'Content' }, { key: 'text', label: 'Text' }, { key: 'muted', label: 'Muted text' },
  { key: 'primary', label: 'Primary' }, { key: 'accent', label: 'Accent' }, { key: 'input', label: 'Inputs' }, { key: 'line', label: 'Lines' },
]

function hexColour(raw: string): string | null {
  const hex = raw.trim().replace(/^#/, '')
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null
  return `#${(hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).toLowerCase()}`
}

function ColourField({ label, colourKey, value, onChange }: { label: string; colourKey: keyof Theme; value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const inputValue = draft ?? value
  const invalid = draft !== null && hexColour(draft) === null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, padding: '0 4px' }}>
        <span style={{ position: 'relative', width: 22, height: 22, border: '1.5px solid var(--ink)', borderRadius: 6, background: value, overflow: 'hidden', flex: 'none' }}>
          <input type="color" aria-label={`${label} colour picker`} value={hexColour(value) ?? DEFAULT_THEME.line} onChange={e => { setDraft(null); onChange(e.target.value) }} data-testid={`colour-${colourKey}`} style={{ position: 'absolute', inset: -8, width: 40, height: 40, opacity: 0, cursor: 'pointer' }} />
        </span>
        <label htmlFor={id} style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: 'text' }}>{label}</label>
        <input id={id} className="fb-input fb-mono" type="text" aria-label={`${label} hex code`} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
          value={inputValue} spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="Hex code" data-testid={`colour-hex-${colourKey}`}
          onFocus={e => { setDraft(value); e.currentTarget.select() }}
          onChange={e => { const raw = e.target.value; setDraft(raw); const hex = hexColour(raw); if (hex) onChange(hex) }}
          onBlur={() => setDraft(null)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur() } }}
          style={{ width: 92, flex: 'none', minHeight: 28, padding: '3px 6px', fontSize: 12, textAlign: 'right', ...(invalid ? { borderColor: 'var(--coral-tx)' } : {}) }} />
      </div>
      {invalid && <span id={`${id}-error`} style={{ padding: '0 4px', fontSize: 11, color: 'var(--coral-tx)' }}>Use 3 or 6 hex digits. The last valid colour is kept.</span>}
    </div>
  )
}

export default function ThemePanel() {
  const api = useBuilder()
  return (
    <section aria-label="Theme" className="fb-scroll" style={{ flex: 1, minHeight: 0, padding: '0 12px 24px', display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="theme-panel">
      <div className="fb-caps" style={{ padding: '2px 2px 0' }}>Theme · whole form</div>
      <ThemeEditor theme={api.def.theme} onChange={api.updateTheme} onUpload={api.uploadAsset} />
      <p style={{ margin: '2px 4px 0', fontSize: 12, color: 'var(--mut2)', lineHeight: 1.5 }}>Theme applies to the whole form. Individual fields can&apos;t be styled — that keeps every form consistent and every change one click.</p>
    </section>
  )
}

/** The theme controls, for a form (the builder's Design) or the workspace's
 *  branding (Forms › Settings): presets, contrast fixes, colours, type, layout,
 *  logo and footer. `coalesce` marks a drag of a colour picker as one change. */
export function ThemeEditor({ theme: t, onChange, onUpload }: { theme: Theme; onChange: (patch: Partial<Theme>, coalesce?: boolean) => void; onUpload: (file: File) => Promise<string | null | undefined> }) {
  const warnings = contrastWarnings(t)
  const fileRef = useRef<HTMLInputElement>(null)
  const seg = <T extends string>(label: string, key: keyof Theme, opts: Array<[T, string]>, current: T) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="fb-caps fb-caps--tx2">{label}</div>
      {/* The theme field decides the type, not the seg: its values are always strings, so
          "Round" used to store radius "18" — the card became an 186px oval and the server
          quietly reset it to the default (QA 2026-09-24 P2). */}
      <Seg value={current} options={opts.map(([value, l]) => ({ value, label: l }))} onChange={v => onChange({ [key]: (typeof t[key] === 'number' ? Number(v) : v) } as Partial<Theme>)} grow label={label} className="fb-seg--card" />
    </div>
  )
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="fb-caps fb-caps--tx2" style={{ paddingTop: 6 }}>Presets</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Object.entries(THEME_PRESETS).map(([key, pr]) => (
            <button key={key} type="button" onClick={() => onChange({ ...pr, star: pr.star })} aria-pressed={t.preset === key} data-testid={`preset-${key}`}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '2px solid var(--ink)', borderRadius: 10, background: 'var(--card)', cursor: 'pointer', textAlign: 'left', boxShadow: t.preset === key ? 'var(--el-2)' : 'none', transform: t.preset === key ? 'translate(-1px,-1px)' : 'none' }}>
              <span style={{ display: 'flex', height: 34, borderRadius: 6, overflow: 'hidden', border: '1.5px solid var(--ink)' }}><span style={{ flex: 2, background: pr.bg }} /><span style={{ flex: 1, background: pr.content }} /><span style={{ flex: 1, background: pr.primary }} /></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)' }}>{PRESET_NAMES[key] ?? key}</span>
            </button>
          ))}
        </div>
      </div>
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {warnings.map(w => (
            <Banner key={w.pair} tone="coral" inline icon="alert" role="status" action={<Btn size="sm" onClick={() => onChange({ ...w.fix, preset: 'custom' })}>Fix</Btn>}>
              <span style={{ fontSize: 12.5 }}>{w.suggestion} <span className="fb-mono" style={{ fontSize: 11 }}>({w.ratio.toFixed(1)}:1)</span></span>
            </Banner>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="fb-caps fb-caps--tx2">Colours</div>
        {COLOURS.map(c => <ColourField key={c.key} label={c.label} colourKey={c.key} value={String(t[c.key])} onChange={value => onChange({ [c.key]: value, preset: 'custom' } as Partial<Theme>, true)} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="fb-caps fb-caps--tx2">Typography</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Headings
          <select className="fb-select" value={t.headFont} onChange={e => onChange({ headFont: e.target.value as Theme['headFont'] })} data-testid="font-head"><option>Syne</option><option>Plus Jakarta Sans</option><option>Serif</option><option>System</option></select></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Body and inputs
          <select className="fb-select" value={t.font} onChange={e => onChange({ font: e.target.value as Theme['font'] })} data-testid="font-body"><option>Plus Jakarta Sans</option><option>Syne</option><option>Serif</option><option>System</option></select></label>
      </div>
      {seg('Form width', 'width', [['560', 'Narrow'], ['680', 'Regular'], ['820', 'Wide']], String(t.width))}
      {seg('Corner radius', 'radius', [['4', 'Sharp'], ['10', 'Soft'], ['18', 'Round']], String(t.radius))}
      {seg('Spacing', 'spacing', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['airy', 'Airy']], t.spacing)}
      {seg('Container', 'container', [['card', 'Card'], ['outline', 'Outline'], ['flat', 'Flat']], t.container)}
      {seg('Alignment', 'align', [['left', 'Left'], ['center', 'Centre']], t.align)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="fb-caps fb-caps--tx2">Brand</div>
        <Toggle on={t.logo} onChange={v => onChange({ logo: v })} label="Show logo" testId="toggle-logo" />
        {t.logo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
            {t.logoUrl ? <img src={t.logoUrl} alt="Logo" style={{ height: 28, maxWidth: 100, objectFit: 'contain', border: '1.5px solid var(--line2)', borderRadius: 6, background: 'var(--card)' }} /> : <span style={{ fontSize: 12, color: 'var(--mut2)', flex: 1 }}>Placeholder mark until you upload one.</span>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const url = await onUpload(f); if (url) onChange({ logoUrl: url }) }} data-testid="logo-file" />
            <Btn size="sm" onClick={() => fileRef.current?.click()} icon="upload">{t.logoUrl ? 'Replace' : 'Upload logo'}</Btn>
            {t.logoUrl && <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Remove logo" onClick={() => onChange({ logoUrl: '' })}><Icon name="x" size={14} /></button>}
          </div>
        )}
        <Toggle on={t.bgImage} onChange={v => onChange({ bgImage: v })} label="Background pattern" testId="toggle-pattern" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--tx2)', padding: '4px 4px 0' }}>Footer
          <input className="fb-input" value={t.footer} maxLength={120} placeholder="Nothing under the form" onChange={e => onChange({ footer: e.target.value }, true)} data-testid="theme-footer" />
          <span style={{ fontWeight: 600, color: 'var(--mut2)' }}>The line under the form. Leave it empty to show nothing.</span>
        </label>
      </div>
    </>
  )
}
