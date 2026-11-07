import test from 'node:test'
import assert from 'node:assert/strict'
import { UI_CATALOGS, uiFor, formatWhen, ERROR_CATALOGS, FORM_LANGUAGES, withLanguage, newBlock, emptyForm, validatePage, evaluate, isStockThanks } from './index'

function strings(v: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof v === 'string') out.push([path, v])
  else if (typeof v === 'function') { const r = (v as (...a: unknown[]) => unknown)(2, 3); if (typeof r === 'string') out.push([path, r]) }
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out)
}

test('every language has every respondent string, none empty or left in English by mistake', () => {
  const en: Array<[string, string]> = []
  strings(UI_CATALOGS.en, 'en', en)
  for (const { code } of FORM_LANGUAGES) {
    const got: Array<[string, string]> = []
    strings(UI_CATALOGS[code], code, got)
    assert.equal(got.length, en.length, code)
    for (const [p, v] of got) assert.ok(v.trim().length > 0, `${p} is empty`)
    if (code !== 'en') {
      const same = got.filter(([, v], i) => v === en[i][1] && v.length > 12)
      assert.deepEqual(same.map(([p]) => p), [], `${code} copies English`)
    }
    assert.ok(ERROR_CATALOGS[code].duplicateEmail, code)
  }
  assert.equal(uiFor('xx'), UI_CATALOGS.en)
})

test('dates at the door read in the form’s language and time zone', () => {
  assert.match(formatWhen('2026-10-01T13:00:00Z', 'fr', 'America/New_York'), /1 octobre 2026.*09:00/)
  assert.match(formatWhen('2026-10-01T13:00:00Z', 'en', 'Europe/London'), /October 1, 2026.*2:00/)
})

test('validation messages follow the form’s language', () => {
  const def = emptyForm('Idioma')
  const email = newBlock('email', { label: 'Correo', required: true })
  def.pages[0].blocks = [email]
  def.settings.language = 'es'
  const errs = validatePage(def, def.pages[0], { [email.id]: 'no-es-un-correo' }, evaluate(def, {}))
  assert.match(errs[email.id], /correo/i)
  assert.equal(withLanguage('de', () => ERROR_CATALOGS.de.duplicateEmail), 'Mit dieser E-Mail-Adresse wurde bereits geantwortet.')
})

test('the stock thank-you title is recognised in every language; a written one is not', () => {
  assert.ok(isStockThanks(emptyForm().endings[0].title))
  for (const { code } of FORM_LANGUAGES) assert.ok(isStockThanks(` ${UI_CATALOGS[code].thanks} `), code)
  assert.equal(isStockThanks('Thanks, Ada — see you Friday.'), false)
})
