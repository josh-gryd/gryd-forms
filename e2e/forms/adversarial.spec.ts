import { test, expect } from '@playwright/test'
import { apiCreateForm, apiPublish, apiSubmit, BASE } from './helpers'
import { seedComplexForm, emptyForm, newBlock, makeOptions } from '../../engine/forms/core/index'

test.describe('Adversarial', () => {
  test('unpublished forms take nothing; bad option ids, oversized bodies, honeypot and duplicate keys are all handled', async ({ request, page }) => {
    const def = seedComplexForm()
    const draftOnly = await apiCreateForm(request, { title: 'Draft only', definition: def })
    const notLive = await apiSubmit(request, draftOnly.id, {})
    expect(notLive.status).toBe(404)
    const f = await apiCreateForm(request, { title: 'Hardened', definition: def })
    await apiPublish(request, f.id)
    const p1 = def.pages[0], p2 = def.pages[1]
    const by = (label: string) => [...p1.blocks, ...p2.blocks].find(b => b.label === label)!
    const size = by('Company size'), role = by('Which best describes your role?')
    const good = { [by('First name').id]: 'A', [by('Last name').id]: 'B', [by('Work email').id]: 'a@b.co', [by('Company').id]: 'C', [size.id]: size.options[0].id, [role.id]: role.options[0].id, [by('What are you looking to fix first?').id]: 'x' }
    const badOption = await apiSubmit(request, f.id, { ...good, [size.id]: 'o_notanoption' })
    expect(badOption.status).toBe(422)
    expect(badOption.body.errors[size.id]).toBe('Choose one of the listed options.')
    const wrongType = await apiSubmit(request, f.id, { ...good, [role.id]: { $ne: 1 } })
    expect(wrongType.status).toBe(422)
    const shortKey = await apiSubmit(request, f.id, good, { idempotencyKey: 'x' })
    expect(shortKey.status).toBe(400)
    const spam = await apiSubmit(request, f.id, good, { website: 'http://spam.example' })
    expect(spam.status).toBe(200)
    const listAfterSpam = await (await request.get(`${BASE}/api/forms/${f.id}/responses?status=all`)).json()
    expect(listAfterSpam.total).toBe(0)
    expect(listAfterSpam.counts.spam).toBe(1)
    const big = await request.post(`${BASE}/api/public/forms/${f.id}/submit`, { data: { idempotencyKey: 'bigbody-00000001', answers: { ...good, [by('What are you looking to fix first?').id]: 'x'.repeat(1_100_000) } } })
    expect(big.status()).toBe(413)
    const key = 'same-key-00000001'
    const one = await apiSubmit(request, f.id, good, { idempotencyKey: key })
    const two = await apiSubmit(request, f.id, { ...good, [by('First name').id]: 'Changed' }, { idempotencyKey: key })
    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(two.body.duplicate).toBe(true)
    expect(two.body.submissionId).toBe(one.body.submissionId)
    const list = await (await request.get(`${BASE}/api/forms/${f.id}/responses?status=all`)).json()
    expect(list.total).toBe(1)
    expect(list.rows[0].cells[by('First name').id]).toBe('A')
    // Another form's token cannot read or write this form's submission.
    const other = await apiCreateForm(request, { title: 'Other', definition: def })
    await apiPublish(request, other.id)
    const draft = await (await request.post(`${BASE}/api/public/forms/${other.id}/draft`, { data: { answers: {}, currentPageId: p1.id, pagesVisited: [] } })).json()
    const cross = await request.get(`${BASE}/api/public/forms/${f.id}/draft?token=${draft.token}`)
    expect([403, 404]).toContain(cross.status())
    // Answers are data, never markup: a script payload renders as text in Results.
    const payload = '<img src=x onerror="document.title=\'pwned\'"><script>document.title="pwned"</script>'
    const xss = await apiSubmit(request, f.id, { ...good, [by('First name').id]: payload })
    expect(xss.status).toBe(200)
    await page.goto(`/forms/${f.id}?tab=results&r=${xss.body.submissionId}`)
    await expect(page.getByTestId('answer-row').filter({ hasText: 'First name' })).toContainText('<img src=x')
    expect(await page.title()).not.toContain('pwned')
    await expect(page.getByTestId('response-detail').locator('img[src="x"]')).toHaveCount(0)
  })

  test('the draft API rejects stale revisions and malformed documents; deleting a form hides it everywhere', async ({ request }) => {
    const f = await apiCreateForm(request, { title: 'Guarded' })
    const bad = await request.put(`${BASE}/api/forms/${f.id}/draft`, { data: { definition: { schemaVersion: 2, pages: 'nope' }, baseRevision: f.revision } })
    expect(bad.status()).toBe(400)
    const stale = await request.put(`${BASE}/api/forms/${f.id}/draft`, { data: { definition: emptyForm('Stale'), baseRevision: f.revision + 5 } })
    expect(stale.status()).toBe(409)
    const dupOptions = emptyForm('Dup')
    const choice = newBlock('choice', { options: makeOptions(['A', 'B']) })
    choice.options[1].id = choice.options[0].id
    dupOptions.pages[0].blocks.push(choice)
    const dup = await request.put(`${BASE}/api/forms/${f.id}/draft`, { data: { definition: dupOptions, baseRevision: f.revision } })
    expect(dup.status()).toBe(400)
    const def = seedComplexForm()
    const g = await apiCreateForm(request, { title: 'Gone', definition: def })
    const pub = await apiPublish(request, g.id)
    const del = await request.delete(`${BASE}/api/forms/${g.id}`)
    expect(del.ok()).toBeTruthy()
    expect((await request.get(`${BASE}/api/forms/${g.id}`)).status()).toBe(404)
    expect((await (await request.get(`${BASE}/api/public/forms/by-slug/${pub.slug}`)).json()).status).toBe('unavailable')
    const list = await (await request.get(`${BASE}/api/forms`)).json()
    expect(list.forms.some((x: { id: string }) => x.id === g.id)).toBeFalsy()
  })
})
