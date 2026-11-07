import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDefinition, SCHEMA_VERSION, definitionHash, cloneDefinition } from './schema'
import { seedComplexForm, emptyForm, newBlock } from './factory'
import './components/index'

test('a fresh form parses cleanly and round-trips', () => {
  const def = seedComplexForm()
  const r = parseDefinition(def)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.deepEqual(r.definition, def)
})

test('unknown keys are dropped and defaults applied', () => {
  const raw = JSON.parse(JSON.stringify(emptyForm('X'))) as Record<string, unknown>
  ;(raw as any).evil = 'x'
  ;(raw as any).pages[0].blocks = [{ id: 'b_1', type: 'short', label: 'Q', mystery: 1 }]
  const r = parseDefinition(raw)
  assert.equal(r.ok, true)
  assert.equal((r.definition as any).evil, undefined)
  assert.deepEqual(r.definition!.pages[0].blocks[0], { id: 'b_1', type: 'short', label: 'Q', description: '', required: false, width: 'full', placeholder: '', options: [], settings: {} })
})

test('identity is strict: missing or duplicate ids fail', () => {
  const def = seedComplexForm()
  const dup = cloneDefinition(def)
  dup.pages[1].blocks[0].id = dup.pages[0].blocks[2].id
  assert.equal(parseDefinition(dup).ok, false)
  const missing = cloneDefinition(def) as any
  delete missing.pages[0].blocks[0].id
  assert.equal(parseDefinition(missing).ok, false)
  const badType = cloneDefinition(def) as any
  badType.pages[0].blocks[0].type = 'wizard'
  assert.equal(parseDefinition(badType).ok, false)
})

test('a wrong schemaVersion is refused rather than guessed', () => {
  const def = seedComplexForm() as any
  def.schemaVersion = SCHEMA_VERSION + 1
  const r = parseDefinition(def)
  assert.equal(r.ok, false)
  assert.match(r.issues[0].message, /schemaVersion/)
})

test('cover pages may only hold display content and must be first', () => {
  const def = emptyForm()
  def.pages.unshift({ id: 'p_cover', kind: 'cover', name: 'Cover', buttonLabel: 'Start', stage: '', blocks: [newBlock('heading'), newBlock('short')] })
  const r = parseDefinition(def)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some(i => /display content only/.test(i.message)))
})

test('theme colours must be 6-digit hex; anything else falls back', () => {
  const def = emptyForm() as any
  def.theme.primary = 'javascript:alert(1)'
  def.theme.width = 99999
  const r = parseDefinition(def)
  assert.equal(r.ok, true)
  assert.equal(r.definition!.theme.primary, '#8dc63f')
  assert.equal(r.definition!.theme.width, 1200)
})

test('definitionHash is stable and order independent', () => {
  const a = seedComplexForm()
  const b = JSON.parse(JSON.stringify(a))
  assert.equal(definitionHash(a), definitionHash(b))
  b.title = 'changed'
  assert.notEqual(definitionHash(a), definitionHash(b))
})

test('theme numbers survive a trip through a form control as text', () => {
  const def = emptyForm('Theme') as unknown as Record<string, unknown>
  def.theme = { ...(def.theme as Record<string, unknown>), radius: '18', width: '560' }
  const r = parseDefinition(def)
  assert.equal(r.ok, true)
  assert.equal(r.definition!.theme.radius, 18, 'was silently reset to 10')
  assert.equal(r.definition!.theme.width, 560, 'was silently reset to 680')
  const bad = parseDefinition({ ...def, theme: { radius: 'round', width: '' } })
  assert.equal(bad.definition!.theme.radius, 10)
  assert.equal(bad.definition!.theme.width, 680)
})

test('theme star: optional, kept when set, absent themes parse (and hash) exactly as before', async () => {
  const { parseTheme, DEFAULT_THEME } = await import('./schema')
  const { THEME_PRESETS, contrastWarnings } = await import('./theme')
  assert.equal('star' in parseTheme({ ...DEFAULT_THEME }), false)
  assert.deepEqual(parseTheme({ ...DEFAULT_THEME }), DEFAULT_THEME)
  assert.equal(parseTheme({ ...DEFAULT_THEME, star: '#FF9B8F' }).star, '#ff9b8f')
  assert.equal('star' in parseTheme({ ...DEFAULT_THEME, star: 'red' }), false)
  const lagoon = parseTheme(THEME_PRESETS.lagoon)
  assert.deepEqual(lagoon, THEME_PRESETS.lagoon)
  assert.deepEqual(contrastWarnings(lagoon), [], 'the Lagoon preset passes WCAG AA for text, help text, pill labels and the button')
  const def = seedComplexForm()
  assert.equal(definitionHash(parseDefinition(def).definition!), definitionHash(def))
})
