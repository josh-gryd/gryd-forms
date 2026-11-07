import test from 'node:test'
import assert from 'node:assert/strict'
import { renderTemplate, tokensIn, answerToken, describeTemplate } from './interpolate'
import { rowsOf, sectionMembers } from './layout'
import { contrastRatio, contrastWarnings, errorTones, THEME_PRESETS, themeStyles, onPrimaryColor } from './theme'
import { csvLine, csvCell } from './csv'
import { normalizePhone, countryFromInternational, formatPhone, PHONE_COUNTRIES } from './phone'
import { videoEmbedUrl, safeMediaUrl } from './components/display'
import { libraryItems, PRESETS } from './registry'
import { seedComplexForm, newBlock, emptyForm, cloneBlock, blockFromPreset } from './factory'
import { makeOptions } from './components/choices'
import './components/index'

test('interpolation resolves labels by stable id and falls back', () => {
  const def = seedComplexForm()
  const first = def.pages[0].blocks[2]
  const size = def.pages[0].blocks.find(b => b.label === 'Company size')!
  const t = `Hi ${answerToken(first.id, 'there')}, size ${answerToken(size.id)} / ${answerToken('b_deleted', 'unknown')}`
  assert.equal(renderTemplate(t, def, {}), 'Hi there, size  / unknown')
  assert.equal(renderTemplate(t, def, { [first.id]: 'Ada', [size.id]: size.options[2].id }), 'Hi Ada, size 51–200 / unknown')
  assert.deepEqual(tokensIn(t), [first.id, size.id, 'b_deleted'])
  first.label = 'Given name'
  assert.equal(renderTemplate(t, def, { [first.id]: 'Ada' }), 'Hi Ada, size  / unknown')
  assert.equal(describeTemplate(`Thanks ${answerToken(first.id)}`, def), 'Thanks {Given name}')
})

test('rows group by width with caps', () => {
  const h = () => newBlock('short', { width: 'half' }), t = () => newBlock('short', { width: 'third' }), f = () => newBlock('short')
  const rows = rowsOf([f(), h(), h(), h(), t(), t(), t(), t(), f()])
  assert.deepEqual(rows.map(r => r.blocks.length), [1, 2, 1, 3, 1, 1])
})

test('section members run until the next section', () => {
  const def = emptyForm()
  const s1 = newBlock('section'), a = newBlock('short'), b = newBlock('short'), s2 = newBlock('section'), c = newBlock('short')
  def.pages[0].blocks = [newBlock('short'), s1, a, b, s2, c]
  assert.deepEqual(sectionMembers(def.pages[0], s1.id), [a.id, b.id])
  assert.deepEqual(sectionMembers(def.pages[0], s2.id), [c.id])
})

test('theme presets pass contrast and the checker suggests fixes', () => {
  for (const [name, t] of Object.entries(THEME_PRESETS)) {
    assert.deepEqual(contrastWarnings(t), [], `${name} should pass`)
  }
  const bad = { ...THEME_PRESETS.paper, text: '#cccccc', primary: '#ffffff' }
  const w = contrastWarnings(bad)
  assert.ok(w.some(x => x.pair === 'text/content' && contrastRatio(x.suggestion, bad.content) >= 4.5))
  assert.equal(onPrimaryColor(THEME_PRESETS.ink), '#161616')
  assert.equal(onPrimaryColor(THEME_PRESETS.studio), '#ffffff')
  const s = themeStyles(THEME_PRESETS.paper)
  assert.equal(s.gap, 24); assert.equal(s.pad, 40)
  assert.equal(themeStyles(THEME_PRESETS.studio).container.border, '0')
})

test('error colours pass AA on every preset; light themes keep the GRYD coral pair', () => {
  for (const [name, t] of Object.entries(THEME_PRESETS)) {
    const e = errorTones(t)
    assert.ok(contrastRatio(e.text, t.content) >= 4.5, `${name} error text`)
    assert.ok(contrastRatio(e.line, t.content) >= 3 && contrastRatio(e.line, t.input) >= 3, `${name} error edge`)
  }
  assert.deepEqual(errorTones(THEME_PRESETS.paper), { text: '#9a1f0a', line: '#ee4b2b' })
})

test('csv escaping: quotes, newlines, unicode, formula injection', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"')
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvCell('émoji 🎉'), 'émoji 🎉')
  assert.equal(csvLine(['a', 1, null]), 'a,1,\r\n')
})

test('phone country table and normalisation', () => {
  assert.ok(PHONE_COUNTRIES.length > 200)
  assert.equal(countryFromInternational('+44 20 7946 0958')!.iso, 'GB')
  assert.equal(countryFromInternational('+1 415 555 0132')!.iso, 'US')
  assert.equal(countryFromInternational('+353 1 234 5678')!.iso, 'IE')
  assert.deepEqual(normalizePhone('US', '415-555-0132'), { country: 'US', dial: '1', national: '4155550132', e164: '+14155550132' })
  assert.deepEqual(normalizePhone('US', '1 415 555 0132'), { country: 'US', dial: '1', national: '4155550132', e164: '+14155550132' })
  assert.equal(normalizePhone('GB', '020 7946 0958')!.e164, '+442079460958')
  assert.equal(normalizePhone('DE', '+49 30 901820')!.national, '30901820')
  assert.equal(formatPhone(normalizePhone('US', '4155550132')!), '+1 415 555 0132')
  assert.equal(normalizePhone('US', 'abc'), null)
})

test('media urls are sanitized and video embeds are whitelisted', () => {
  assert.equal(safeMediaUrl('javascript:alert(1)'), '')
  assert.equal(safeMediaUrl('data:text/html,hi'), '')
  assert.equal(safeMediaUrl('https://example.com/a.png'), 'https://example.com/a.png')
  assert.equal(safeMediaUrl('/api/public/forms/assets/ast_x'), '/api/public/forms/assets/ast_x')
  assert.equal(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(videoEmbedUrl('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789')
  assert.equal(videoEmbedUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef'), 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef')
  assert.equal(videoEmbedUrl('https://evil.com/embed'), null)
  assert.equal(videoEmbedUrl('javascript:alert(1)'), null)
})

test('library search and presets', () => {
  const all = libraryItems('')
  assert.equal(all.groups[0].category, 'Frequently used')
  assert.ok(all.flat.some(i => i.key === 'preset:first_name'))
  assert.deepEqual(libraryItems('phone').flat.map(i => i.label), ['Phone'])
  assert.equal(libraryItems('zzzz').groups[0].category, 'No fields match')
  assert.ok(!libraryItems('', { displayOnly: true }).flat.some(i => i.type === 'short'))
  const b = blockFromPreset(PRESETS[0])
  assert.equal(b.type, 'short'); assert.equal(b.label, 'First name'); assert.equal(b.settings.autoComplete, 'given-name')
})

test('cloneBlock gives fresh ids to the block and its options', () => {
  const b = newBlock('choice', { options: makeOptions(['a', 'b']) })
  const c = cloneBlock(b)
  assert.notEqual(c.id, b.id)
  assert.notEqual(c.options[0].id, b.options[0].id)
  assert.equal(c.options[0].label, 'a')
})

test('a theme number that arrives as text never becomes an oval (QA 2026-09-24 P2)', () => {
  const t = { ...THEME_PRESETS.paper, radius: '18' as unknown as number, container: 'outline' as const }
  const s = themeStyles(t)
  assert.equal(s.container.borderRadius, '24px', "'18' + 6 used to make 186px")
  assert.equal(s.input.borderRadius, '18px')
  assert.equal(themeStyles({ ...THEME_PRESETS.paper, radius: 900 }).container.borderRadius, '38px', 'clamped like the parser')
})
