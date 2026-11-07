// Respondent theme: user data, the one place raw colours live. Presets and
// the derivation from theme → concrete styles (ported from builder-logic.js
// themeStyles), plus WCAG contrast checks for the theme editor.

import { DEFAULT_THEME, type Theme } from './schema'
import { spacingFor } from './layout'

export const THEME_PRESETS: Record<string, Theme> = {
  paper: { ...DEFAULT_THEME, preset: 'paper' },
  ink: { ...DEFAULT_THEME, preset: 'ink', bg: '#161616', content: '#1e1d18', text: '#f3ebcb', muted: '#cfc8ab', primary: '#a6dc5a', accent: '#ffd35c', input: '#22201a', line: '#f3ebcb' },
  studio: { ...DEFAULT_THEME, preset: 'studio', bg: '#ffffff', content: '#ffffff', text: '#111111', muted: '#5b5b5b', primary: '#111111', accent: '#ffc72c', input: '#f6f6f4', line: '#d9d9d4', headFont: 'Plus Jakarta Sans', radius: 8, container: 'flat', width: 620, spacing: 'airy', logo: false },
  gold: { ...DEFAULT_THEME, preset: 'gold', bg: '#ffc72c', content: '#fff7dc', text: '#161616', muted: '#6b4400', primary: '#161616', accent: '#ee4b2b', input: '#ffffff', line: '#161616', radius: 16, width: 640, align: 'center' },
  // The teal Fillout look as a preset (white type, translucent-looking
  // pills, a red star). Teal deepened from the reference (#4395aa sampled) so white text
  // and pill labels pass WCAG AA; the pill fill and edge are white-over-teal mixes, since
  // a theme colour is a solid hex.
  lagoon: { ...DEFAULT_THEME, preset: 'lagoon', bg: '#077286', content: '#077286', text: '#ffffff', muted: '#e3f4f7', primary: '#ffffff', accent: '#ffd35c', input: '#177f93', line: '#86c8d3', font: 'Plus Jakarta Sans', headFont: 'Plus Jakarta Sans', radius: 14, container: 'flat', width: 720, spacing: 'comfortable', logo: false, star: '#ff7a6b' },
}
export const PRESET_NAMES: Record<string, string> = { paper: 'Paper', ink: 'Ink', studio: 'Studio', gold: 'Marigold', lagoon: 'Lagoon' }

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

/** Perceived luminance 0..1 (the prototype's hexLum). */
export function hexLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function onPrimaryColor(theme: Pick<Theme, 'primary' | 'bg'>): string {
  const dark = hexLum(theme.bg) < 0.45
  return hexLum(theme.primary) < 0.5 ? (dark ? theme.bg : '#ffffff') : '#161616'
}

export function fontStack(font: Theme['font']): string {
  if (font === 'Syne') return "'Syne', 'Plus Jakarta Sans', system-ui, sans-serif"
  if (font === 'Serif') return "Georgia, 'Times New Roman', serif"
  if (font === 'System') return 'system-ui, -apple-system, sans-serif'
  return "'Plus Jakarta Sans', system-ui, sans-serif"
}

export interface ThemeStyles {
  gap: number
  pad: number
  dark: boolean
  onPrimary: string
  font: string
  headFont: string
  container: Record<string, string>
  input: Record<string, string>
  button: Record<string, string>
  bgImage: string
}

/** The concrete CSS every renderer uses (builder canvas, preview, public). */
export function themeStyles(t: Theme): ThemeStyles {
  const { gap, pad } = spacingFor(t.spacing)
  const dark = hexLum(t.bg) < 0.45
  const onPrimary = onPrimaryColor(t)
  // Number(): a radius that arrives as text ("18") must not concatenate into an 186px oval.
  const radius = Math.max(0, Math.min(32, Number(t.radius) || 0))
  const radiusCard = `${radius + 6}px`
  const container: Record<string, string> = t.container === 'card'
    ? { background: t.content, border: `2px solid ${t.line}`, boxShadow: `6px 7px 0 ${t.line}`, borderRadius: radiusCard }
    : t.container === 'outline'
      ? { background: t.content, border: `2px solid ${t.line}`, borderRadius: radiusCard }
      : { background: t.content, border: '0', borderRadius: `${radius}px` }
  return {
    gap, pad, dark, onPrimary,
    font: fontStack(t.font), headFont: fontStack(t.headFont),
    container,
    input: { background: t.input, color: t.text, border: `2px solid ${t.line}`, borderRadius: `${radius}px` },
    button: { background: t.primary, color: onPrimary, border: `2px solid ${t.line}`, boxShadow: `3px 3px 0 ${t.line}`, borderRadius: `${radius}px` },
    bgImage: t.bgImage ? `radial-gradient(${t.line}22 1.5px, transparent 1.5px)` : 'none',
  }
}

/** Error colours that pass WCAG AA on the theme: text 4.5:1 on the form, edges 3:1 on
 *  the form and inside inputs. GRYD's coral pair reads on light forms but is mud on a
 *  dark one (dark red on Lagoon's teal is 1.5:1), so dark forms get a light coral,
 *  lightened only as far as the background needs. Light themes keep the GRYD pair. */
export function errorTones(t: Pick<Theme, 'content' | 'input'>): { text: string; line: string } {
  const light = contrastRatio('#ffffff', t.content) > contrastRatio('#161616', t.content)
  const to = light ? 255 : 0
  const fit = (base: string, target: number, against: string[]) => {
    const rgb = hexToRgb(base)
    for (let i = 0; i <= 20; i++) {
      const c = rgbToHex(rgb.map(v => v + (to - v) * (i / 20)) as [number, number, number])
      if (against.every(b => contrastRatio(c, b) >= target)) return c
    }
    return light ? '#ffffff' : '#161616'
  }
  return {
    text: fit(light ? '#ff9b84' : '#9a1f0a', 4.5, [t.content]),
    line: fit(light ? '#ff9b84' : '#ee4b2b', 3, [t.content, t.input]),
  }
}

export interface ContrastWarning { pair: 'text/content' | 'muted/content' | 'primary/onPrimary' | 'text/input'; ratio: number; suggestion: string; fix: Partial<Theme> }

function nudgeToContrast(fg: string, against: string, target: number): string {
  // Walk the foreground toward black or white (whichever the background is not)
  // until the ratio passes. Deterministic, a few dozen steps at most.
  const towardsWhite = relativeLuminance(against) < 0.5
  let [r, g, b] = hexToRgb(fg)
  for (let i = 0; i < 40; i++) {
    if (contrastRatio(rgbToHex([r, g, b]), against) >= target) break
    const step = 12
    r = towardsWhite ? Math.min(255, r + step) : Math.max(0, r - step)
    g = towardsWhite ? Math.min(255, g + step) : Math.max(0, g - step)
    b = towardsWhite ? Math.min(255, b + step) : Math.max(0, b - step)
  }
  return rgbToHex([r, g, b])
}

/** The theme editor warns when a pair fails WCAG AA and suggests the nearest pass. */
export function contrastWarnings(t: Theme): ContrastWarning[] {
  const out: ContrastWarning[] = []
  const check = (pair: ContrastWarning['pair'], fg: string, bg: string, target: number, key: keyof Theme) => {
    const ratio = contrastRatio(fg, bg)
    if (ratio >= target) return
    const fixed = nudgeToContrast(fg, bg, target)
    out.push({ pair, ratio: Math.round(ratio * 100) / 100, suggestion: fixed, fix: { [key]: fixed } as Partial<Theme> })
  }
  check('text/content', t.text, t.content, 4.5, 'text')
  check('muted/content', t.muted, t.content, 4.5, 'muted')
  check('text/input', t.text, t.input, 4.5, 'text')
  const on = onPrimaryColor(t)
  const primaryRatio = contrastRatio(on, t.primary)
  if (primaryRatio < 4.5) {
    // The button text is derived, so the fix is a primary the derived text can read on.
    const towardsDark = relativeLuminance(t.primary) > 0.5
    let candidate = t.primary
    for (let i = 0; i < 40 && contrastRatio(onPrimaryColor({ primary: candidate, bg: t.bg }), candidate) < 4.5; i++) {
      const [r, g, b] = hexToRgb(candidate)
      const step = towardsDark ? 10 : -10
      candidate = rgbToHex([r + step, g + step, b + step])
    }
    out.push({ pair: 'primary/onPrimary', ratio: Math.round(primaryRatio * 100) / 100, suggestion: candidate, fix: { primary: candidate } })
  }
  return out
}
