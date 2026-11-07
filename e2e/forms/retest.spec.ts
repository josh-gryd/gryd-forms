import { test, expect, type Page } from '@playwright/test'
import { apiCreateForm, openBuilder, waitSaved } from './helpers'
import { emptyForm, newBlock, newPage, makeOptions } from '../../engine/forms/core/index'

// The 2026-09-25 QA retest listed four builder-Preview items as still
// reproducing. Its Preview and Theme checks were made on a form last saved at
// 14:06 UTC, two minutes before the fixed dashboard went live (14:08), in a
// builder tab that kept running the code it had loaded. These replay each
// item with the retest's own steps and stay as regression guards.

const PHASE = process.env.QA_PHASE || 'after'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `/tmp/forms-dev/shots/retest/${PHASE}/${name}.png`, fullPage: false })
}

test.describe('QA retest 2026-09-25', () => {
  test('P2.1 · Paper, Narrow, Round, Compact, Outline, Centre and the background pattern: the outline encloses everything on Phone 392', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Retest theme')
    def.pages[0].blocks = [newBlock('short', { label: 'QA-TEST Name', required: true }), newBlock('choice', { label: 'QA-TEST Pick', options: makeOptions(['QA-TEST One', 'QA-TEST Two']) }), newBlock('email', { label: 'QA-TEST Email' })]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id, 'theme')
    const panel = page.getByTestId('theme-panel')
    await panel.getByTestId('preset-paper').click()
    for (const [group, opt] of [['Form width', 'Narrow'], ['Corner radius', 'Round'], ['Spacing', 'Compact'], ['Container', 'Outline'], ['Alignment', 'Centre']] as const) {
      await panel.getByRole('radiogroup', { name: group }).getByRole('radio', { name: opt }).click()
    }
    await panel.getByTestId('toggle-pattern').click()
    await waitSaved(page)
    await page.getByTestId('preview').click()
    await page.getByTestId('device-phone').click()
    const frame = page.getByTestId('preview-frame-phone')
    await expect(frame).toBeVisible()
    await frame.getByTestId('continue').click() // the retest's view had the error summary open too
    await expect(frame.locator('[data-error-summary]')).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'p2-1-phone-outline')
    const card = frame.getByTestId('form-page')
    const box = (await card.boundingBox())!
    const radius = await card.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    expect(radius).toBeLessThanOrEqual(38)
    const pad = await card.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))
    expect(pad).toBeGreaterThanOrEqual(radius * (1 - Math.SQRT1_2) + 2)
    const parts = await card.locator('input, button, label, p, [data-error-summary]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }).filter(r => r.w > 0 && r.h > 0))
    expect(parts.length).toBeGreaterThan(5)
    for (const c of parts) {
      expect(c.x).toBeGreaterThanOrEqual(box.x + 2)
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.width - 2)
      expect(c.y).toBeGreaterThanOrEqual(box.y + 2)
      expect(c.y + c.h).toBeLessThanOrEqual(box.y + box.height - 2)
    }
  })

  test('P2.2 · Preview from a selected page 2 opens page 1 and cannot reach success without the required page-1 answer', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Retest preview')
    const name = newBlock('short', { label: 'QA-TEST Name', required: true })
    def.pages[0].blocks = [name]
    const two = newBlock('short', { label: 'QA-TEST Page two answer' })
    def.pages.push(newPage(2, { blocks: [two] }))
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id)
    await page.getByTestId('tab-page-1').click()
    await expect(page.getByTestId('canvas-page')).toHaveAttribute('aria-label', 'Page 2')
    await page.getByTestId('preview').click()
    const frame = page.getByTestId('preview-frame-desktop')
    await expect(frame.getByTestId('form-page')).toHaveAttribute('aria-label', 'Page 1')
    await frame.getByTestId('continue').click()
    await expect(frame.locator(`#er-${name.id}`)).toHaveText(/Enter your QA-TEST Name\./)
    await expect(frame.getByTestId('ending')).toHaveCount(0)
    await shot(page, 'p2-2-preview-page-1-required')
    await frame.locator(`#in-${name.id}`).fill('QA-TEST Ada')
    await frame.getByTestId('continue').click()
    await frame.locator(`#in-${two.id}`).fill('QA-TEST only page two')
    await frame.getByTestId('continue').click()
    await expect(frame.getByTestId('ending')).toBeVisible()
  })

  test('P2.3 · Preview refuses a reversed required date range, typed on the keyboard or filled by a tool', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Retest dates')
    const range = newBlock('daterange', { label: 'QA-TEST Stay', required: true })
    def.pages[0].blocks = [range]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id)
    await page.getByTestId('preview').click()
    const frame = page.getByTestId('preview-frame-desktop')
    const start = frame.getByLabel('Start date'), end = frame.getByLabel('End date')
    // Typed segment by segment, the way a person enters a date (US order).
    await start.click(); await page.keyboard.type('09302026')
    await end.click(); await page.keyboard.type('09012026')
    await expect(start).toHaveValue('2026-09-30')
    await frame.getByTestId('continue').click()
    await expect(frame.getByText('The end date has to be after the start date.')).toBeVisible()
    await expect(frame.getByTestId('ending')).toHaveCount(0)
    await shot(page, 'p2-3-preview-reversed-typed')
    await page.getByTestId('preview-restart').click()
    await start.evaluate((el: HTMLInputElement) => { el.value = '2026-09-30'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
    await end.evaluate((el: HTMLInputElement) => { el.value = '2026-09-01'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
    await frame.getByTestId('continue').click()
    await expect(frame.getByText('The end date has to be after the start date.')).toBeVisible()
    await expect(frame.getByTestId('ending')).toHaveCount(0)
  })

  test('P3.5 and P3.6 · Preview shows the Required badges the public form shows, and the error keeps "QA-TEST Name"', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Retest required')
    const name = newBlock('short', { label: 'QA-TEST Name', required: true })
    const email = newBlock('email', { label: 'QA-TEST Email', required: true })
    const note = newBlock('long', { label: 'QA-TEST Note' })
    def.pages[0].blocks = [name, email, note]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id)
    await page.getByTestId('preview').click()
    const frame = page.getByTestId('preview-frame-desktop')
    await expect(frame.locator(`[data-anchor="${name.id}"] [data-required-mark]`)).toBeVisible()
    await expect(frame.locator(`[data-anchor="${email.id}"] [data-required-mark]`)).toBeVisible()
    await expect(frame.locator(`[data-anchor="${note.id}"] [data-required-mark]`)).toHaveCount(0)
    await frame.getByTestId('continue').click()
    await expect(frame.locator(`#er-${name.id}`)).toHaveText(/^\s*Enter your QA-TEST Name\.\s*$/)
    await shot(page, 'p3-preview-badges-and-copy')
  })
})
