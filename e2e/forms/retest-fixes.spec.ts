import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiSaveDraft, apiPublish, openBuilder, ghostAdd, blockByLabel, waitSaved, uniq, BASE } from './helpers'
import { emptyForm, newBlock, type FormDefinition } from '../../engine/forms/core/index'

// Fixes for the 2026-09-25 QA retest: Start over on a session kept on an older
// version, a new form's link following its name, and a builder tab that was
// open across a deploy saying so.

const PHASE = process.env.QA_PHASE || 'after'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `/tmp/forms-dev/shots/retest/${PHASE}/${name}.png`, fullPage: false })
}

async function editAndPublish(request: APIRequestContext, id: string, edit: (def: FormDefinition) => void) {
  const f = await apiGetForm(request, id)
  const def = JSON.parse(JSON.stringify(f.draft)) as FormDefinition
  edit(def)
  expect((await apiSaveDraft(request, id, def, f.revision)).status).toBe(200)
  return apiPublish(request, id)
}

test.describe('QA retest 2026-09-25 fixes', () => {
  test('P2.4 · Start over on a session kept on an older version begins blank on the current version, and the resume banner says which version it is', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Start over')
    const name = newBlock('short', { label: 'QA-TEST Old label', required: true })
    def.pages[0].blocks = [name]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const pub = await apiPublish(request, f.id)
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Robin')
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('forms:resp:')).length)).toBe(1)
    await editAndPublish(request, f.id, d => { d.pages[0].blocks[0].label = 'QA-TEST New label' })
    const tab = await page.context().newPage()
    await tab.goto(`/f/${pub.slug}`)
    const banner = tab.getByTestId('resume-banner')
    await expect(banner).toContainText('This form has been updated since you started; you’re finishing the version you began.')
    await expect(tab.getByText('QA-TEST Old label')).toBeVisible()
    await expect(tab.locator(`#in-${name.id}`)).toHaveValue('QA-TEST Robin')
    await shot(tab, 'p2-4-resumed-older-version')
    await tab.getByTestId('resume-start-over').click()
    await expect(tab.getByText('QA-TEST New label')).toBeVisible()
    await expect(tab.locator(`#in-${name.id}`)).toHaveValue('')
    await expect(banner).toHaveCount(0)
    await shot(tab, 'p2-4-start-over-new-version')
    expect(await tab.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('forms:resp:')))).toEqual([])
    await tab.reload()
    await expect(tab.getByText('QA-TEST New label')).toBeVisible()
    await expect(tab.getByTestId('resume-banner')).toHaveCount(0)
    // A plain resume on the current version keeps the short banner.
    await tab.locator(`#in-${name.id}`).fill('QA-TEST Again')
    await tab.reload()
    await expect(tab.getByTestId('resume-banner')).toHaveText(/^\s*Picked up where you left off\.\s*Start over\s*$/)
  })

  test('C3 · a new form’s link follows its name until it is published, and then stays', async ({ page, request }) => {
    const f = await apiCreateForm(request, {})
    expect(f.slug).toMatch(/^untitled-form/)
    await openBuilder(page, f.id)
    const name = uniq('QA-TEST Link follows')
    const expected = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    await page.getByTestId('form-title').fill(name)
    await waitSaved(page)
    await expect.poll(async () => (await apiGetForm(request, f.id)).slug).toBe(expected)
    await page.getByTestId('tab-share').click()
    await expect(page.getByTestId('share-slug')).toHaveValue(expected)
    await expect(page.getByText('Until you first publish, the link follows the form’s name.').or(page.getByText("Until you first publish, the link follows the form's name."))).toBeVisible()
    await shot(page, 'c3-link-follows-name')
    await page.getByTestId('tab-build').click()
    await ghostAdd(page, 'QA-TEST First question')
    await page.getByTestId('publish').click()
    await expect(page.getByTestId('toast-published')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('form-title').fill(`${name} renamed`)
    await waitSaved(page)
    await page.waitForTimeout(300)
    expect((await apiGetForm(request, f.id)).slug).toBe(expected)
  })

  test('a builder tab left open across a deploy says so, and Reload saves the latest edit first', async ({ page, request }) => {
    const build = await (await request.get(`${BASE}/api/app-build`)).json()
    expect(build).toEqual({ build: 'local' })
    const f = await apiCreateForm(request, { title: uniq('QA-TEST Deploy') })
    await openBuilder(page, f.id)
    await ghostAdd(page, 'QA-TEST Before the deploy')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(500)
    await expect(page.getByTestId('update-banner')).toHaveCount(0)
    await page.route('**/api/app-build', r => r.fulfill({ json: { build: 'deploy-after' } }))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('update-banner')).toContainText('Forms was updated since you opened this tab. Reload to use the latest version; your work is saved first.')
    await shot(page, 'deploy-banner')
    await ghostAdd(page, 'QA-TEST Typed just before reload')
    await page.unroute('**/api/app-build')
    await page.evaluate(() => { (window as unknown as { __beforeReload?: boolean }).__beforeReload = true })
    await page.getByTestId('update-reload').click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload === true).catch(() => true), { timeout: 15_000 }).toBe(false)
    await expect(page.getByTestId('builder-band')).toBeVisible()
    await expect(blockByLabel(page, 'QA-TEST Typed just before reload')).toHaveCount(1)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(500)
    await expect(page.getByTestId('update-banner')).toHaveCount(0)
  })
})
