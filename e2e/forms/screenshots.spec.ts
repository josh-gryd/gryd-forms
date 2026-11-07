import { test, expect, devices } from '@playwright/test'
import { apiCreateForm, apiPublish, apiSubmit, openBuilder, openResponses } from './helpers'
import { seedComplexForm } from '../../engine/forms/core/index'

// Visual evidence for the report. Not assertions of pixels: the images are
// inspected by a person (or the agent) after the run.
test('capture the surfaces at three widths, light and dark', async ({ page, request, browser }) => {
  const def = seedComplexForm()
  const f = await apiCreateForm(request, { title: 'Screenshot form', definition: def })
  const pub = await apiPublish(request, f.id)
  const p1 = def.pages[0], p2 = def.pages[1]
  const by = (label: string) => [...p1.blocks, ...p2.blocks].find(b => b.label === label)!
  const size = by('Company size'), role = by('Which best describes your role?')
  for (const [first, s, r] of [['Ada', 2, 0], ['Grace', 0, 1], ['Linus', 3, 4]] as const) {
    await apiSubmit(request, f.id, { [by('First name').id]: first, [by('Last name').id]: 'Example', [by('Work email').id]: `${first.toLowerCase()}@example.com`, [by('Company').id]: `${first} Co`, [size.id]: size.options[s].id, [role.id]: role.options[r].id, [by('What are you looking to fix first?').id]: 'Everything.' }, { pagesVisited: [p1.id, p2.id] })
  }
  await page.goto('/forms')
  await expect(page.getByTestId('form-row').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-home.png' })
  await openBuilder(page, f.id)
  await page.getByTestId('block').nth(2).click({ position: { x: 30, y: 60 } })
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-builder-selected.png' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-builder-dark.png' })
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  await openResponses(page, f.id)
  await expect(page.getByTestId('response-row')).toHaveCount(3)
  await page.getByTestId('response-row').first().click()
  await expect(page.getByTestId('sheet-name')).toBeVisible()
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-results-sheet.png' })
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.keyboard.press('Escape')
  await openBuilder(page, f.id)
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-builder-1000.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/f/${pub.slug}`)
  await page.getByTestId('continue').click()
  await expect(page.locator('[data-error-summary]')).toBeVisible()
  await page.screenshot({ path: '/tmp/forms-dev/shots/e2e-public-errors.png' })
  const tablet = await browser.newContext({ ...devices['iPad (gen 7)'], storageState: 'test-results/.auth.json' })
  const tp = await tablet.newPage()
  await tp.goto(`${process.env.FORMS_BASE_URL || 'http://127.0.0.1:3000'}/f/${pub.slug}`)
  await expect(tp.getByTestId('continue')).toBeVisible()
  await tp.screenshot({ path: '/tmp/forms-dev/shots/e2e-public-tablet.png' })
  await tablet.close()
  const phone = await browser.newContext({ ...devices['iPhone 14'], storageState: 'test-results/.auth.json' })
  const pp = await phone.newPage()
  await pp.goto(`${process.env.FORMS_BASE_URL || 'http://127.0.0.1:3000'}/f/${pub.slug}`)
  await pp.getByTestId('continue').click()
  await expect(pp.locator('[data-error-summary]')).toBeVisible()
  await pp.screenshot({ path: '/tmp/forms-dev/shots/e2e-public-phone-errors.png' })
  await phone.close()
})
