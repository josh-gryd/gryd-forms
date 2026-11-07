import { test, expect } from '@playwright/test'
import { apiCreateForm, apiPublish, apiSubmit, openBuilder, openResponses, BASE } from './helpers'
import { seedComplexForm } from '../../engine/forms/core/index'

test.describe('Results', () => {
  test('list and open response: counts, search, filters, sort, keyboard, copy, delete and CSV', async ({ page, request, context }) => {
    const def = seedComplexForm()
    const f = await apiCreateForm(request, { title: 'Results form', definition: def })
    await apiPublish(request, f.id)
    const p1 = def.pages[0], p2 = def.pages[1]
    const id = (label: string) => [...p1.blocks, ...p2.blocks, ...def.pages[3].blocks].find(b => b.label === label)!
    const size = id('Company size'), role = id('Which best describes your role?')
    const base = (first: string, last: string, email: string, sizeIdx: number, roleIdx: number) => ({
      [id('First name').id]: first, [id('Last name').id]: last, [id('Work email').id]: email, [id('Company').id]: `${last} Ltd`,
      [size.id]: size.options[sizeIdx].id, [role.id]: role.options[roleIdx].id, [id('What are you looking to fix first?').id]: 'Things.',
    })
    const r1 = await apiSubmit(request, f.id, base('Ada', 'Lovelace', 'ada@example.com', 0, 0), { pagesVisited: [p1.id, p2.id, def.pages[3].id] })
    expect(r1.status).toBe(200)
    const r2 = await apiSubmit(request, f.id, base('Grace', 'Hopper', 'grace@example.com', 3, 1), { pagesVisited: [p1.id, p2.id, def.pages[2].id, def.pages[3].id] })
    expect(r2.body.endingId).toBe(def.endings[1].id)
    const r3 = await apiSubmit(request, f.id, base('Linus', 'Torvalds', 'linus@example.com', 0, 4), { pagesVisited: [p1.id, p2.id, def.pages[3].id] })
    expect(r3.body.endingId).toBe(def.endings[2].id)
    const partial = await request.post(`${BASE}/api/public/forms/${f.id}/draft`, { data: { answers: { [id('First name').id]: 'Part', [id('Last name').id]: 'Way' }, currentPageId: p2.id, pagesVisited: [p1.id] } })
    expect(partial.ok()).toBeTruthy()

    await openResponses(page, f.id)
    const rows = page.getByTestId('response-row')
    await expect(rows).toHaveCount(4)
    // The counts ride on the status switch; the newest is open beside the list.
    await expect(page.getByTestId('filter-all')).toContainText('4')
    await expect(page.getByTestId('filter-completed')).toContainText('3')
    await expect(page.getByTestId('filter-partial')).toContainText('1')
    await expect(page.getByTestId('results-showing')).toHaveText('4 of 4')
    await expect(page.getByTestId('response-detail')).toBeVisible()
    await page.getByTestId('filter-partial').click()
    await expect(rows).toHaveCount(1)
    await expect(page.getByTestId('row-status')).toHaveText('Partial')
    await expect(page.getByTestId('response-detail')).toContainText('Left at page 2')
    await page.getByTestId('filter-completed').click()
    await expect(rows).toHaveCount(3)
    await page.getByTestId('filter-all').click()
    await expect(rows).toHaveCount(4)

    await page.getByLabel('Search any answer').fill('grace')
    await expect(rows).toHaveCount(1)
    await expect(page.getByTestId('results-showing')).toHaveText('1 of 1')
    await expect(rows.first()).toContainText('Grace')
    await page.getByTestId('clear-filters').click()
    await expect(rows).toHaveCount(4)

    await page.getByTestId('add-filter').click()
    const pop = page.getByTestId('filter-popover')
    await pop.getByRole('combobox', { name: 'Field' }).selectOption({ label: 'Company size' })
    await pop.getByRole('combobox', { name: 'Value' }).selectOption({ label: size.options[3].label })
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-chip')).toContainText(`Company size: ${size.options[3].label}`)
    await expect(rows).toHaveCount(1)
    await page.getByTestId('filter-chip').getByRole('button').click()
    await expect(rows).toHaveCount(4)

    const firstBefore = await rows.first().innerText()
    await page.getByTestId('sort-submitted').click()
    await expect(rows.first()).not.toHaveText(firstBefore)
    await page.getByTestId('sort-submitted').click()

    await rows.filter({ hasText: 'Ada' }).first().click()
    const detail = page.getByTestId('response-detail')
    await expect(page.getByTestId('sheet-name')).toHaveText('Ada Lovelace')
    await expect(page.getByTestId('sheet-ending')).toContainText('Thanks')
    await expect(page.getByTestId('answer-group')).toHaveCount(3)
    await expect(page.getByTestId('answer-row').filter({ hasText: 'Work email' })).toContainText('ada@example.com')
    await expect(page.getByTestId('answer-row').filter({ hasText: 'Company size' })).toContainText(size.options[0].label)
    await expect(rows.filter({ hasText: 'Ada' }).first()).toHaveAttribute('aria-selected', 'true')
    const idBefore = (await detail.getAttribute('data-response-id'))!
    await page.keyboard.press('k')
    await expect(detail).not.toHaveAttribute('data-response-id', idBefore)
    await expect(page.getByTestId('sheet-name')).not.toHaveText('Ada Lovelace')
    await page.keyboard.press('j')
    await expect(detail).toHaveAttribute('data-response-id', idBefore)
    await expect(page.getByTestId('sheet-name')).toHaveText('Ada Lovelace')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByTestId('detail-menu').click()
    await page.getByTestId('copy-answers').click()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('First name\nAda')
    expect(clip).toContain('Work email\nada@example.com')

    await rows.filter({ hasText: 'Linus' }).first().click()
    await page.getByTestId('detail-menu').click()
    await page.getByTestId('sheet-delete').click()
    await expect(page.getByTestId('confirm')).toContainText('Delete this response?')
    await page.getByTestId('confirm-yes').click()
    await expect(page.getByTestId('toast')).toContainText('Response deleted.')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId('filter-all')).toContainText('3')
    // The next one opens in its place.
    await expect(page.getByTestId('sheet-name')).not.toHaveText('Linus Torvalds')

    const csv = await request.get(`${BASE}/api/forms/${f.id}/responses.csv?status=all`)
    expect(csv.status()).toBe(200)
    const bytes = await csv.body()
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    const text = bytes.toString('utf8')
    expect(text).toContain('First name')
    expect(text.split('\n').filter(Boolean).length).toBe(4)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()])
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('empty states: no responses yet, and no responses match', async ({ page, request }) => {
    const f = await apiCreateForm(request, { title: 'Empty results' })
    await openResponses(page, f.id)
    await expect(page.getByTestId('results-empty')).toContainText('No responses yet.')
    await page.getByLabel('Search any answer').fill('nothing')
    await expect(page.getByTestId('results-empty-filtered')).toContainText('No responses match.')
  })
})
