import test from 'node:test'
import assert from 'node:assert/strict'
import { componentDef } from './registry'
import { newBlock } from './factory'
import { makeOptions } from './components/choices'
import { ERR } from './errors'
import { fileGate } from './components/upload'
import './components/index'

const v = (type: Parameters<typeof newBlock>[0], overrides: Parameters<typeof newBlock>[1], raw: unknown, ctx = {}) => {
  const b = newBlock(type, overrides)
  const d = componentDef(type)
  const value = d.normalize(b, raw)
  return { error: d.validate(b, value, ctx), value, display: d.display(b, value), block: b }
}

test('required copy matches the handoff', () => {
  assert.equal(v('short', { label: 'First name', required: true }, '').error, 'Enter your first name.')
  assert.equal(v('email', { required: true }, '').error, 'Enter your email address.')
  assert.equal(v('phone', { required: true }, '').error, 'Enter a phone number.')
  assert.equal(v('dropdown', { required: true, options: makeOptions(['a']) }, '').error, 'Choose one option.')
  assert.equal(v('checks', { required: true, options: makeOptions(['a']) }, []).error, 'Choose at least one.')
  assert.equal(v('yesno', { required: true }, '').error, 'Choose yes or no.')
  assert.equal(v('rating', { required: true }, '').error, 'Pick a rating.')
  assert.equal(v('scale', { required: true }, '').error, 'Pick a number.')
  assert.equal(v('long', { required: true }, '').error, 'This one needs an answer.')
  assert.equal(v('upload', { required: true }, []).error, 'Add a file to continue.')
})

test('optional empty answers are fine; format errors only when there is a value', () => {
  assert.equal(v('email', {}, '').error, null)
  assert.equal(v('email', {}, 'ada@company').error, ERR.invalidEmail)
  assert.equal(v('email', {}, 'ada@company.com').error, null)
  assert.equal(v('email', { settings: { workOnly: true } }, 'ada@gmail.com').error, ERR.workEmail)
  assert.equal(v('url', {}, 'not a url').error, ERR.invalidUrl)
  assert.equal(v('url', {}, 'example.com/guides').value, 'https://example.com/guides')
  assert.equal(v('url', {}, 'http://x.io').error, null)
  assert.equal(v('url', { settings: { httpsOnly: true } }, 'http://x.io').error, ERR.invalidUrl)
})

test('numbers accept normal formatting and enforce bounds', () => {
  assert.equal(v('number', {}, '1,200').value, 1200)
  assert.equal(v('number', {}, 'abc').error, ERR.invalidNumber)
  assert.equal(v('number', { settings: { min: 5 } }, '4').error, ERR.minNumber(5))
  assert.equal(v('number', { settings: { max: 5 } }, '6').error, ERR.maxNumber(5))
  assert.equal(v('number', { settings: { integer: true } }, '1.5').error, ERR.integer)
  assert.equal(v('number', {}, '1e400').error, ERR.invalidNumber)
  assert.equal(v('number', {}, '99999999999999999999').error, null)
})

test('text length limits', () => {
  assert.equal(v('short', { settings: { minLength: 3 } }, 'ab').error, ERR.minLength(3))
  assert.equal(v('long', { settings: { maxLength: 3 } }, 'abcd').error, ERR.maxLength(3))
  assert.equal(v('short', {}, '<script>alert(1)</script>').value, '<script>alert(1)</script>')
})

test('phone is lenient about formatting but wants at least 7 digits', () => {
  assert.equal(v('phone', {}, '(415) 555-0132').error, null)
  assert.equal(v('phone', {}, '+44 20 7946 0958').display, '+44 207 946 0958')
  assert.equal(v('phone', {}, '12345').error, ERR.invalidPhone)
  assert.deepEqual(v('phone', {}, '+1 415 555 0132').value, { country: 'US', dial: '1', national: '4155550132', e164: '+14155550132' })
  assert.deepEqual(v('phone', { settings: { defaultCountry: 'GB' } }, { country: 'GB', national: '020 7946 0958' }).value, { country: 'GB', dial: '44', national: '2079460958', e164: '+442079460958' })
})

test('choices store option ids and reject ids that do not exist', () => {
  const opts = makeOptions(['Red', 'Green', 'Blue'])
  assert.equal(v('choice', { options: opts }, opts[1].id).display, 'Green')
  assert.equal(v('choice', { options: opts }, 'o_nope').error, ERR.invalidOption)
  const multi = v('checks', { options: opts, settings: { max: 2 } }, [opts[2].id, opts[0].id])
  assert.deepEqual(multi.value, [opts[0].id, opts[2].id])
  assert.equal(multi.display, 'Red, Blue')
  assert.equal(v('checks', { options: opts, settings: { max: 2 } }, [opts[0].id, opts[1].id, opts[2].id]).error, ERR.maxSelections(2))
  assert.equal(v('checks', { options: opts, settings: { min: 2 } }, [opts[0].id]).error, ERR.minSelections(2))
})

test('yes/no, switch, rating, scale', () => {
  assert.equal(v('yesno', {}, 'Yes').value, true)
  assert.equal(v('yesno', {}, false).display, 'No')
  assert.equal(v('switch', { required: true }, false).error, 'Turn this on to continue.')
  assert.equal(v('rating', {}, 6).error, ERR.invalidOption)
  assert.equal(v('rating', {}, 4).display, '4 of 5')
  assert.equal(v('scale', { settings: { min: 0, max: 10 } }, 0).error, null)
})

test('dates', () => {
  assert.equal(v('date', {}, '2026-02-30').error, ERR.invalidDate)
  assert.equal(v('date', {}, '2026-02-28').display, '28 Feb 2026')
  assert.equal(v('date', { settings: { allow: 'future' } }, '2020-01-01', { today: '2026-09-24' }).error, ERR.futureOnly)
  assert.equal(v('date', { settings: { min: '2026-01-01' } }, '2025-12-31').error, ERR.minDate('1 Jan 2026'))
  assert.equal(v('daterange', {}, { start: '2026-03-02', end: '2026-03-01' }).error, ERR.rangeOrder)
  assert.equal(v('datetime', {}, '2026-03-01T25:00').error, ERR.invalidDate)
  assert.equal(v('time', {}, '09:30').error, null)
})

test('upload gate: types, sizes, statuses', () => {
  const b = newBlock('upload', { settings: { accept: 'docs-images', maxSizeMb: 1 } })
  assert.equal(fileGate(b, { name: 'photo.heic', size: 10 }), ERR.fileType('PDF, DOCX, PNG'))
  assert.equal(fileGate(b, { name: 'evil.exe', size: 10 }), ERR.fileType('PDF, DOCX, PNG'))
  assert.equal(fileGate(b, { name: 'doc.pdf', size: 2 * 1024 * 1024 }), ERR.fileSize(1))
  assert.equal(fileGate(b, { name: 'doc.PDF', size: 100 }), null)
  const any = newBlock('upload', { settings: { accept: 'any' } })
  assert.equal(fileGate(any, { name: 'archive.zip', size: 100 }), null)
  assert.equal(fileGate(any, { name: 'page.html', size: 100 }), ERR.fileType('a different file'))
  const file = [{ fileId: 'fil_abcdef1234', name: 'doc.pdf', size: 100, mime: 'application/pdf' }]
  const d = componentDef('upload')
  assert.equal(d.validate(b, file, { fileStatus: () => ({ status: 'pending' }) }), ERR.uploadBusy)
  assert.equal(d.validate(b, file, { fileStatus: () => ({ status: 'failed' }) }), ERR.uploadFailed)
  assert.equal(d.validate(b, file, { fileStatus: () => ({ status: 'uploaded' }) }), null)
})

test('matrix and ranking', () => {
  const cols = makeOptions(['Poor', 'Great'])
  const rows = [{ id: 'row_a', label: 'Speed' }, { id: 'row_b', label: 'Price' }]
  const m = v('matrix', { required: true, options: cols, settings: { rows, multiple: false } }, { row_a: cols[1].id, row_b: cols[0].id, row_zzz: cols[0].id })
  assert.equal(m.error, null)
  assert.equal(m.display, 'Speed: Great; Price: Poor')
  const opts = makeOptions(['A', 'B', 'C'])
  assert.equal(v('ranking', { required: true, options: opts }, [opts[2].id, opts[0].id]).error, 'Rank the options to continue.')
  assert.equal(v('ranking', { options: opts }, [opts[2].id, opts[0].id, opts[1].id]).display, '1. C, 2. A, 3. B')
})

test('required copy keeps the label as the author wrote it (QA 2026-09-24 P3)', () => {
  const req = (label: string) => v('short', { label, required: true }, '').error
  assert.equal(req('QA-TEST Name'), 'Enter your QA-TEST Name.', 'an acronym keeps its capitals — was "qA-TEST Name"')
  assert.equal(req('Company'), 'Enter your company.')
  assert.equal(req('First name'), 'Enter your first name.')
  assert.equal(req('URL slug'), 'Enter your URL slug.')
  assert.equal(req("McDonald's order"), "Enter your McDonald's order.")
  assert.equal(req('iPhone model'), 'Enter your iPhone model.')
  assert.equal(req('Your company'), 'Enter your company.', 'no "Enter your your company"')
  assert.equal(req('Job title:'), 'Enter your job title.')
  assert.equal(req('What should we call you?'), 'This one needs an answer.', 'a question is not bolted onto "Enter your"')
  assert.equal(req('How many seats'), 'This one needs an answer.')
  assert.equal(req('Issue summary'), 'Enter your issue summary.', '"Is" only counts as a whole word')
  assert.equal(req('Hi {{answer:b_1|there}}, your role'), 'This one needs an answer.')
  assert.equal(req(''), 'This answer is required.')
})

test('a date range must not end before it starts; both ends are checked against the bounds', () => {
  assert.equal(v('daterange', {}, { start: '2026-09-30', end: '2026-09-01' }).error, ERR.rangeOrder)
  assert.equal(v('daterange', {}, { start: '2026-09-01', end: '2026-09-01' }).error, null, 'a one-day range is fine')
  assert.equal(v('daterange', { settings: { max: '2026-09-15' } }, { start: '2026-09-01', end: '2026-09-20' }).error, 'Choose a date on or before 15 Sep 2026.')
})
