// Constructors for new documents and parts, plus the seed form used by tests
// and the stress harness. All ids come from ids.ts so nothing collides.

import { componentDef } from './registry'
import type { LibraryPreset } from './registry'
import { shortId } from './ids'
import { DEFAULT_SETTINGS, DEFAULT_THEME, SCHEMA_VERSION, type Block, type ComponentType, type Ending, type FormDefinition, type Page } from './schema'
import { makeOptions } from './components/choices'

export function newBlock(type: ComponentType, overrides: Partial<Block> = {}): Block {
  const d = componentDef(type)
  const defaults = d.defaults()
  return {
    id: shortId('b'),
    type,
    label: overrides.label ?? defaults.label ?? d.label,
    description: overrides.description ?? defaults.description ?? '',
    required: overrides.required ?? defaults.required ?? false,
    width: overrides.width ?? defaults.width ?? 'full',
    placeholder: overrides.placeholder ?? defaults.placeholder ?? '',
    options: (overrides.options ?? defaults.options ?? []).map(o => ({ ...o })),
    settings: { ...(defaults.settings ?? {}), ...(overrides.settings ?? {}) },
  }
}

export function blockFromPreset(preset: LibraryPreset): Block {
  return newBlock(preset.type, preset.block)
}

export function newPage(n: number, overrides: Partial<Page> = {}): Page {
  return { id: shortId('p'), kind: 'page', name: `Page ${n}`, buttonLabel: '', stage: '', blocks: [], ...overrides }
}

export function newCoverPage(overrides: Partial<Page> = {}): Page {
  return { id: shortId('p'), kind: 'cover', name: 'Cover', buttonLabel: 'Start', stage: '', blocks: [newBlock('heading', { label: 'Welcome' }), newBlock('paragraph', { label: 'A sentence about what this form is for and how long it takes.' })], ...overrides }
}

export function newEnding(n: number, overrides: Partial<Ending> = {}): Ending {
  return { id: shortId('e'), name: n === 1 ? 'Thanks' : `Ending ${n}`, kind: 'message', title: 'Thanks, we got it.', body: '', buttonLabel: '', buttonUrl: '', redirectUrl: '', confetti: false, blocks: [], ...overrides }
}

export function emptyForm(title = 'Untitled form'): FormDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    title,
    settings: { ...DEFAULT_SETTINGS },
    pages: [newPage(1)],
    endings: [newEnding(1)],
    rules: [],
    theme: { ...DEFAULT_THEME },
  }
}

/** Duplicate a block with fresh ids for it and its options / matrix rows. */
export function cloneBlock(block: Block): Block {
  const optionMap = new Map<string, string>()
  const options = block.options.map(o => { const id = shortId('o'); optionMap.set(o.id, id); return { ...o, id } })
  const settings = { ...block.settings }
  if (Array.isArray(settings.rows)) settings.rows = (settings.rows as Array<{ id: string; label: string }>).map(r => ({ ...r, id: shortId('row') }))
  return { ...block, id: shortId('b'), options, settings }
}

export function clonePage(page: Page): Page {
  return { ...page, id: shortId('p'), name: `${page.name} copy`, blocks: page.blocks.map(cloneBlock) }
}

export function cloneEnding(ending: Ending): Ending {
  return { ...ending, id: shortId('e'), name: `${ending.name} copy`, blocks: ending.blocks.map(cloneBlock) }
}

/** The prototype's complex seed, expressed in the current schema. */
export function seedComplexForm(): FormDefinition {
  const sizeOpts = makeOptions(['1–10', '11–50', '51–200', '201–1,000', '1,000+'])
  const roleOpts = makeOptions(['Founder or CEO', 'Operations', 'Engineering', 'Sales and marketing', 'Just exploring'])
  const size = newBlock('dropdown', { label: 'Company size', required: true, options: sizeOpts })
  const role = newBlock('choice', { label: 'Which best describes your role?', required: true, options: roleOpts })
  const firstName = newBlock('short', { label: 'First name', required: true, width: 'half', placeholder: 'Ada', settings: { autoComplete: 'given-name' } })
  const p1 = newPage(1, { name: 'About you', blocks: [
    newBlock('heading', { label: 'Get your team set up' }),
    newBlock('paragraph', { label: 'Ten questions, about three minutes. We use your answers to draft an operating blueprint before our first call.' }),
    firstName,
    newBlock('short', { label: 'Last name', required: true, width: 'half', placeholder: 'Lovelace', settings: { autoComplete: 'family-name' } }),
    newBlock('email', { label: 'Work email', required: true, width: 'half', placeholder: 'ada@company.com' }),
    newBlock('phone', { label: 'Phone', width: 'half', description: 'Only if you would like us to call.' }),
    newBlock('short', { label: 'Company', required: true, placeholder: 'Company name', settings: { autoComplete: 'organization' } }),
    size,
  ] })
  const p2 = newPage(2, { name: 'Your work', blocks: [
    role,
    newBlock('long', { label: 'What are you looking to fix first?', required: true, description: 'One or two sentences is plenty.' }),
    newBlock('checks', { label: 'Which tools does your team live in?', options: makeOptions(['Slack', 'Jira', 'HubSpot', 'Notion', 'Google Workspace']) }),
  ] })
  const p3 = newPage(3, { name: 'Enterprise questions', blocks: [
    newBlock('heading', { label: 'A few more for larger teams' }),
    newBlock('number', { label: 'How many teams would use this?', width: 'half', placeholder: '4' }),
    newBlock('dropdown', { label: 'Rollout timeline', width: 'half', options: makeOptions(['This quarter', 'Next quarter', 'This year', 'Not sure']) }),
    newBlock('long', { label: 'Security or procurement requirements we should know about' }),
    newBlock('upload', { label: 'Current process document', description: 'PDF, DOCX or a screenshot. Up to 25 MB.' }),
  ] })
  const p4 = newPage(4, { name: 'Wrap up', buttonLabel: 'Send answers', blocks: [
    newBlock('yesno', { label: 'Can we call you to walk through the blueprint?' }),
    newBlock('dropdown', { label: 'Best time to reach you', width: 'half', options: makeOptions(['Morning', 'Afternoon', 'Evening']) }),
    newBlock('date', { label: 'Earliest start date', width: 'half' }),
    newBlock('rating', { label: 'How urgent is this for you?' }),
    newBlock('long', { label: 'Anything else?' }),
  ] })
  const e1 = newEnding(1, { name: 'Thanks', title: `Thanks {{answer:${firstName.id}|there}} — your blueprint is on its way.`, body: 'We will email a draft within two working days. Reply to that email if anything changes.', buttonLabel: 'Back to example.com', buttonUrl: 'https://example.com' })
  const e2 = newEnding(2, { name: 'Enterprise — we call you', title: 'Thanks. Expect a call.', body: 'Larger teams get a 30-minute walkthrough. Someone from our team will call at the time you picked.' })
  const e3 = newEnding(3, { name: 'Redirect to guides', kind: 'redirect', redirectUrl: 'https://example.com/guides' })
  const big = [sizeOpts[2].id, sizeOpts[3].id, sizeOpts[4].id]
  const rules = [
    { id: shortId('r'), when: { id: shortId('c'), join: 'and' as const, items: [{ id: shortId('c'), field: size.id, op: 'in' as const, value: big }] }, then: { type: 'show_page' as const, target: p3.id } },
    { id: shortId('r'), when: { id: shortId('c'), join: 'and' as const, items: [{ id: shortId('c'), field: size.id, op: 'in' as const, value: big }] }, then: { type: 'go_to_ending' as const, target: e2.id } },
    { id: shortId('r'), when: { id: shortId('c'), join: 'or' as const, items: [
      { id: shortId('c'), field: role.id, op: 'eq' as const, value: roleOpts[4].id },
      { id: shortId('c'), join: 'and' as const, items: [{ id: shortId('c'), field: size.id, op: 'eq' as const, value: sizeOpts[0].id }, { id: shortId('c'), field: role.id, op: 'neq' as const, value: roleOpts[0].id }] },
    ] }, then: { type: 'go_to_ending' as const, target: e3.id } },
  ]
  return { schemaVersion: SCHEMA_VERSION, title: 'Ops Blueprint', settings: { ...DEFAULT_SETTINGS }, pages: [p1, p2, p3, p4], endings: [e1, e2, e3], rules, theme: { ...DEFAULT_THEME } }
}
