import { test, expect } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, apiSaveDraft, apiSubmit, BASE } from './helpers'
import { seedComplexForm } from '../../engine/forms/core/index'

// The destruction test: publish, collect, then rename / reorder / delete /
// re-publish — and prove nothing already collected changes or breaks.
test('versions are immutable: old responses keep their labels, the CSV spans versions, broken rules cannot publish', async ({ page, request }) => {
  const v1def = seedComplexForm()
  const f = await apiCreateForm(request, { title: 'Destruction', definition: v1def })
  const v1 = await apiPublish(request, f.id)
  const p1 = v1def.pages[0], p2 = v1def.pages[1]
  const by = (label: string) => [...p1.blocks, ...p2.blocks].find(b => b.label === label)!
  const size = by('Company size'), role = by('Which best describes your role?')
  const answers = (first: string, sizeIdx: number) => ({ [by('First name').id]: first, [by('Last name').id]: 'One', [by('Work email').id]: `${first.toLowerCase()}@example.com`, [by('Company').id]: 'Co', [size.id]: size.options[sizeIdx].id, [role.id]: role.options[0].id, [by('What are you looking to fix first?').id]: 'x' })
  const r1 = await apiSubmit(request, f.id, answers('Vone', 2), { pagesVisited: [p1.id, p2.id] })
  expect(r1.status).toBe(200)
  const partial = await request.post(`${BASE}/api/public/forms/${f.id}/draft`, { data: { answers: { [by('First name').id]: 'Partial' }, currentPageId: p2.id, pagesVisited: [p1.id] } })
  const partialToken = (await partial.json()).token as string

  // Wreck the draft: rename the field, reverse and rename options, delete a field, add one, reorder pages, rename an ending.
  const form = await apiGetForm(request, f.id)
  const d2 = JSON.parse(JSON.stringify(form.draft))
  const sizeBlock = d2.pages[0].blocks.find((b: { id: string }) => b.id === size.id)
  sizeBlock.label = 'Team size'
  sizeBlock.options.reverse()
  sizeBlock.options.find((o: { id: string }) => o.id === size.options[2].id).label = 'Fifty to two hundred'
  d2.pages[0].blocks = d2.pages[0].blocks.filter((b: { id: string }) => b.id !== by('Last name').id)
  d2.pages[0].blocks.push({ id: 'b_budget00001', type: 'number', label: 'Budget', description: '', required: false, width: 'full', placeholder: '', options: [], settings: {} })
  const [about, work, ...rest] = d2.pages
  d2.pages = [work, about, ...rest]
  d2.endings[0].name = 'Renamed thanks'
  const saved = await apiSaveDraft(request, f.id, d2, form.revision)
  expect(saved.status).toBe(200)
  const v2 = await apiPublish(request, f.id)
  expect(v2.version.number).toBe(2)
  const r2 = await apiSubmit(request, f.id, { ...answers('Vtwo', 2), b_budget00001: 42 }, { pagesVisited: [work.id, about.id] })
  expect(r2.status).toBe(200)

  // Results: the same block id reads back with the labels of the version each respondent saw.
  const list = await (await request.get(`${BASE}/api/forms/${f.id}/responses?status=all`)).json()
  expect(list.total).toBe(3)
  const cols = list.columns as Array<{ id: string; label: string }>
  expect(cols.find(c => c.id === size.id)?.label).toBe('Team size')
  expect(cols.some(c => c.id === by('Last name').id)).toBeTruthy()
  expect(cols.some(c => c.id === 'b_budget00001')).toBeTruthy()
  const rowV1 = list.rows.find((r: { cells: Record<string, string> }) => r.cells[by('First name').id] === 'Vone')
  const rowV2 = list.rows.find((r: { cells: Record<string, string> }) => r.cells[by('First name').id] === 'Vtwo')
  expect(rowV1.cells[size.id]).toBe('51–200')
  expect(rowV2.cells[size.id]).toBe('Fifty to two hundred')
  expect(rowV1.versionNumber).toBe(1)
  expect(rowV2.versionNumber).toBe(2)
  expect(rowV1.endingName).toBe('Enterprise — we call you')
  const d1 = await (await request.get(`${BASE}/api/forms/${f.id}/responses/${rowV1.id}?status=all`)).json()
  expect(d1.definition.pages[0].name).toBe('About you')
  expect(d1.definition.pages[0].blocks.find((b: { id: string }) => b.id === size.id).label).toBe('Company size')
  const csv = (await (await request.get(`${BASE}/api/forms/${f.id}/responses.csv?status=all`)).body()).toString('utf8')
  const lines = csv.split('\n').filter(Boolean)
  expect(lines[0]).toContain('Team size')
  expect(lines[0]).toContain('Last name')
  expect(lines[0]).toContain('Budget')
  expect(csv).toContain('51–200')
  expect(csv).toContain('Fifty to two hundred')

  // The partial started on v1 is still listed with its version, and keeps its own labels.
  const partials = await (await request.get(`${BASE}/api/forms/${f.id}/responses?status=partial`)).json()
  expect(partials.total).toBe(1)
  expect(partials.rows[0].versionNumber).toBe(1)
  const resumed = await request.get(`${BASE}/api/public/forms/${f.id}/draft?token=${partialToken}`)
  expect(resumed.ok()).toBeTruthy()
  expect((await resumed.json()).versionId).toBe(v1.version.id)

  // Break a rule in the draft: publishing is refused, the live version is untouched.
  const form2 = await apiGetForm(request, f.id)
  const d3 = JSON.parse(JSON.stringify(form2.draft))
  d3.pages[1].blocks = d3.pages[1].blocks.filter((b: { id: string }) => b.id !== size.id)
  expect((await apiSaveDraft(request, f.id, d3, form2.revision)).status).toBe(200)
  const refused = await request.post(`${BASE}/api/forms/${f.id}/publish`, { data: {} })
  expect(refused.status()).toBe(422)
  const live = await (await request.get(`${BASE}/api/public/forms/by-slug/${v2.slug}`)).json()
  expect(live.version.id).toBe(v2.version.id)
  expect(live.definition.pages[1].blocks.some((b: { id: string }) => b.id === size.id)).toBeTruthy()

  // The Results UI renders both generations without error.
  await page.goto(`/forms/${f.id}?tab=results`)
  await expect(page.getByTestId('response-row')).toHaveCount(3)
  await page.getByTestId('response-row').filter({ hasText: 'Vone' }).click()
  await expect(page.getByTestId('answer-row').filter({ hasText: 'Company size' })).toContainText('51–200')
  await page.keyboard.press('Escape')
  await page.getByTestId('response-row').filter({ hasText: 'Vtwo' }).click()
  await expect(page.getByTestId('answer-row').filter({ hasText: 'Team size' })).toContainText('Fifty to two hundred')
  await expect(page.getByTestId('answer-row').filter({ hasText: 'Budget' })).toContainText('42')
})

test('a schema v1 document migrates deterministically on read and keeps working', async ({ request }) => {
  const legacy = {
    schemaVersion: 1, title: 'Legacy',
    pages: [{ id: 'p1', name: 'Page 1', blocks: [
      { id: 'q1', type: 'short', label: 'Name', required: true },
      { id: 'q2', type: 'choice', label: 'Pick', options: ['A', 'B'] },
    ] }],
    endings: [{ id: 'e1', name: 'Thanks', title: 'Done' }],
    rules: [{ id: 'r1', when: { join: 'AND', items: [{ field: 'q2', op: 'is', value: 'B' }] }, then: { action: 'end with', target: 'e1' } }],
    theme: { preset: 'paper' },
  }
  const f = await apiCreateForm(request, { title: 'Legacy', definition: legacy })
  const got = await apiGetForm(request, f.id)
  expect(got.draft.schemaVersion).toBe(2)
  expect(got.draft.pages[0].blocks[1].options.map((o: { label: string }) => o.label)).toEqual(['A', 'B'])
  const again = await apiCreateForm(request, { title: 'Legacy 2', definition: legacy })
  const got2 = await apiGetForm(request, again.id)
  expect(got2.draft.pages[0].blocks[1].options[0].id).toBe(got.draft.pages[0].blocks[1].options[0].id)
  expect(got.draft.rules[0].then.type).toBe('go_to_ending')
  const pub = await apiPublish(request, f.id)
  const r = await apiSubmit(request, f.id, { q1: 'Legacy user', q2: got.draft.pages[0].blocks[1].options[1].id })
  expect(r.status).toBe(200)
  expect(r.body.endingId).toBe('e1')
  void pub
})
