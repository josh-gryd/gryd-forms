import { register, str, boolOr } from '../registry'
import type { ComponentType } from '../schema'
import { isHttpUrl, normalizeUrl } from './text'

const none = {
  normalize: () => undefined,
  isEmpty: () => true,
  validate: () => null,
  logic: { ops: [] as never[], valueKind: 'none' as const },
  logicValue: () => null,
  display: () => '',
}

register<{ level: 1 | 2 }>({
  type: 'heading', label: 'Heading', icon: 'heading', category: 'Display content', keywords: 'title h1 h2', kind: 'display',
  defaults: () => ({ label: 'Heading' }),
  settings: raw => ({ level: raw.level === 2 ? 2 : 1 }),
  ...none,
})

register<Record<string, never>>({
  type: 'paragraph', label: 'Paragraph', icon: 'text', category: 'Display content', keywords: 'text description intro body', kind: 'display',
  defaults: () => ({ label: 'Write a sentence or two.' }),
  settings: () => ({}),
  ...none,
})

register<{ tone: 'info' | 'success' | 'warning' | 'danger' }>({
  type: 'banner', label: 'Banner', icon: 'megaphone', category: 'Display content', keywords: 'callout notice alert highlight', kind: 'display',
  defaults: () => ({ label: 'Something worth knowing.', settings: { tone: 'info' } }),
  settings: raw => ({ tone: raw.tone === 'success' || raw.tone === 'warning' || raw.tone === 'danger' ? raw.tone : 'info' }),
  ...none,
})

register<Record<string, never>>({
  type: 'divider', label: 'Divider', icon: 'minus', category: 'Display content', keywords: 'line separator rule', kind: 'display',
  defaults: () => ({ label: '' }),
  settings: () => ({}),
  ...none,
})

export interface ImageSettings { url: string; alt: string; size: 'full' | 'half' | 'small'; align: 'left' | 'center' }
register<ImageSettings>({
  type: 'image', label: 'Image', icon: 'image', category: 'Media', keywords: 'picture photo logo', kind: 'display',
  defaults: () => ({ label: 'Image', settings: { url: '', alt: '', size: 'full', align: 'left' } }),
  settings: raw => ({
    url: safeMediaUrl(str(raw.url, '', 2048)), alt: str(raw.alt, '', 300),
    size: raw.size === 'half' || raw.size === 'small' ? raw.size : 'full', align: raw.align === 'center' ? 'center' : 'left',
  }),
  ...none,
})

export interface VideoSettings { url: string }
register<VideoSettings>({
  type: 'video', label: 'Video', icon: 'play', category: 'Media', keywords: 'youtube vimeo loom embed', kind: 'display',
  defaults: () => ({ label: 'Video', settings: { url: '' } }),
  settings: raw => ({ url: str(raw.url, '', 2048) }),
  ...none,
})

export interface ButtonSettings { url: string; style: 'primary' | 'secondary'; newTab: boolean }
register<ButtonSettings>({
  type: 'button', label: 'URL button', icon: 'external', category: 'Display content', keywords: 'link cta call to action', kind: 'display',
  defaults: () => ({ label: 'Open link', settings: { url: 'https://', style: 'secondary', newTab: true } }),
  settings: raw => ({ url: str(raw.url, '', 2048), style: raw.style === 'primary' ? 'primary' : 'secondary', newTab: boolOr(raw.newTab, true) }),
  ...none,
})

register<Record<string, never>>({
  type: 'section', label: 'Section', icon: 'rows', category: 'Layout', keywords: 'group heading block conditional', kind: 'display', hasDescription: true,
  defaults: () => ({ label: 'Section' }),
  settings: () => ({}),
  ...none,
})

register<Record<string, never>>({
  type: 'slot', label: 'Column', icon: 'columns', category: 'Layout', keywords: 'column slot', kind: 'layout',
  defaults: () => ({ label: '' }),
  settings: () => ({}),
  ...none,
})

/** Only http(s) (or our own relative asset path) may be rendered as a src. */
export function safeMediaUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('/api/public/forms/assets/')) return v
  const n = normalizeUrl(v)
  return isHttpUrl(n) ? n : ''
}

/** Turn a pasted YouTube / Vimeo / Loom link into an embeddable, sandboxed
 *  player URL. Anything else is refused — a video block never becomes an
 *  arbitrary iframe. */
export function videoEmbedUrl(raw: string): string | null {
  const v = normalizeUrl(raw.trim())
  if (!isHttpUrl(v, true)) return null
  let u: URL
  try { u = new URL(v) } catch { return null }
  const host = u.hostname.replace(/^www\./, '')
  const id = (s: string) => /^[A-Za-z0-9_\-]{4,64}$/.test(s) ? s : null
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const yid = id(u.searchParams.get('v') ?? '') ?? id(u.pathname.split('/').filter(Boolean)[1] ?? '')
    return yid ? `https://www.youtube-nocookie.com/embed/${yid}` : null
  }
  if (host === 'youtu.be') { const yid = id(u.pathname.slice(1)); return yid ? `https://www.youtube-nocookie.com/embed/${yid}` : null }
  if (host === 'youtube-nocookie.com') { const yid = id(u.pathname.split('/')[2] ?? ''); return yid ? `https://www.youtube-nocookie.com/embed/${yid}` : null }
  if (host === 'vimeo.com') { const vid = /^\d{5,12}$/.test(u.pathname.split('/')[1] ?? '') ? u.pathname.split('/')[1] : null; return vid ? `https://player.vimeo.com/video/${vid}` : null }
  if (host === 'player.vimeo.com') { const vid = /^\d{5,12}$/.test(u.pathname.split('/')[2] ?? '') ? u.pathname.split('/')[2] : null; return vid ? `https://player.vimeo.com/video/${vid}` : null }
  if (host === 'loom.com') { const parts = u.pathname.split('/').filter(Boolean); const lid = /^[a-f0-9]{32}$/.test(parts[1] ?? '') ? parts[1] : null; return lid ? `https://www.loom.com/embed/${lid}` : null }
  return null
}

export const DISPLAY_ONLY: ComponentType[] = ['heading', 'paragraph', 'banner', 'divider', 'image', 'video', 'button', 'section']
