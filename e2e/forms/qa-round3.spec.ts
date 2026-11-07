import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, apiSubmit, openBuilder, openResponses, uniq, BASE } from './helpers'
import { emptyForm, newBlock, type FormDefinition } from '../../engine/forms/core/index'

// The third browser QA pass (2026-09-25): one test per finding, each replaying
// the report's own steps. B1 the edit link, B2 duplicate email on its own page,
// B3 the Summary's days, C3 Settings without the field palette, C4 a way out of
// an unavailable link.

const SHOTS = '/tmp/forms-dev/shots/round3'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

async function settings(request: APIRequestContext, id: string, patch: Record<string, unknown>) {
  const res = await request.patch(`${BASE}/api/forms/${id}/settings`, { data: patch })
  expect(res.ok(), await res.text()).toBeTruthy()
}

async function liveForm(request: APIRequestContext, title: string, edit?: (def: FormDefinition) => void) {
  const def = emptyForm(title)
  def.pages[0].blocks = [newBlock('short', { label: 'Your name', required: true }), newBlock('email', { label: 'Email', required: true })]
  edit?.(def)
  const f = await apiCreateForm(request, { title, definition: def })
  const pub = await apiPublish(request, f.id)
  const got = await apiGetForm(request, f.id)
  return { ...f, slug: pub.slug, def: got.draft as FormDefinition }
}

test.describe('QA retest, round 3', () => {
  test('B1 · Edit your response on the thank-you page opens the editor at once, without a refresh', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Round Three edit'), def => { def.settings.allowEdits = true })
    const [n, e] = f.def.pages[0].blocks
    await page.goto(`/f/${f.slug}`)
    await page.locator(`#in-${n.id}`).fill('QA-TEST Ada')
    await page.locator(`#in-${e.id}`).fill('qa-test-ada@example.com')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('edit-link')).toBeVisible()
    await page.evaluate(() => { (window as unknown as { __sameDocument: boolean }).__sameDocument = true })
    await page.getByTestId('edit-link-open').click()
    await expect(page.getByTestId('editing-banner')).toBeVisible()
    await expect(page.locator(`#in-${n.id}`)).toHaveValue('QA-TEST Ada')
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument), 'no reload happened').toBe(true)
    await shot(page, 'b1-editor-open')
    await page.locator(`#in-${n.id}`).fill('QA-TEST Ada L')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('edit-saved')).toBeVisible()
  })

  test('B2 · one response per email: a used address is refused on its own page, and the field says so up front', async ({ page, request }) => {
    const topic = newBlock('long', { label: 'What should we know?', required: true })
    const f = await liveForm(request, uniq('QA-TEST Round Three email'), def => {
      def.pages.push({ id: 'p_twoemail01', kind: 'page', name: 'Two', buttonLabel: '', stage: '', blocks: [topic] })
    })
    await settings(request, f.id, { ops: { duplicates: 'email' } })
    const [n, e] = f.def.pages[0].blocks
    expect((await apiSubmit(request, f.id, { [n.id]: 'QA-TEST First', [e.id]: 'qa-test-used@example.com', [topic.id]: 'Done' })).status).toBe(200)
    await page.goto(`/f/${f.slug}`)
    await expect(page.getByTestId('field-note')).toHaveText('Each email address can respond once.')
    await page.locator(`#in-${n.id}`).fill('QA-TEST Second')
    await page.locator(`#in-${e.id}`).fill('QA-TEST-USED@example.com')
    await page.getByTestId('continue').click()
    await expect(page.locator(`#er-${e.id}`)).toHaveText(/already been used to respond/)
    await expect(page.locator(`#in-${topic.id}`)).toHaveCount(0)
    await shot(page, 'b2-refused-on-page-one')
    await page.locator(`#in-${e.id}`).fill('qa-test-new@example.com')
    await page.getByTestId('continue').click()
    await expect(page.locator(`#in-${topic.id}`)).toBeVisible()
  })

  test('B3 · the Summary names the time zone its days are in', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Round Three summary'))
    await settings(request, f.id, { ops: { timezone: 'America/New_York' } })
    const [n, e] = f.def.pages[0].blocks
    await apiSubmit(request, f.id, { [n.id]: 'QA-TEST Evening', [e.id]: 'qa-test-evening@example.com' })
    await openResponses(page, f.id)
    await page.getByTestId('view-summary').click()
    await expect(page.getByTestId('per-day-zone')).toHaveText('Days in America/New York time')
    const report = await (await request.get(`${BASE}/api/forms/${f.id}/report`)).json()
    expect(report.timezone).toBe('America/New_York')
    expect(report.perDay.at(-1).count).toBe(1)
  })

  test('C3 · Settings and Share show the Forms navigation, not the field palette; General says what goes live when', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Round Three settings'))
    await openBuilder(page, f.id)
    await expect(page.getByTestId('side-fields')).toBeVisible()
    await page.getByTestId('tab-settings').click()
    await expect(page.getByTestId('builder-sidebar-nav')).toBeVisible()
    await expect(page.getByTestId('side-fields')).toHaveCount(0)
    await expect(page.getByTestId('settings-general-team')).toContainText('Live when saved')
    await expect(page.getByTestId('settings-general-public')).toContainText('Goes live on publish')
    await expect(page.getByTestId('settings-access')).not.toContainText('Goes live on publish')
    await shot(page, 'c3-settings-without-palette')
    await page.getByTestId('tab-share').click()
    await expect(page.getByTestId('builder-sidebar-nav')).toBeVisible()
    await page.getByTestId('tab-build').click()
    await expect(page.getByTestId('side-fields')).toBeVisible()
  })

  test('C4 · an unavailable link offers a way on: back to where you came from', async ({ page }) => {
    await page.goto('/f/qa-test-no-such-form-round-three')
    await expect(page.getByTestId('form-unavailable')).toBeVisible()
    await expect(page.getByTestId('unavailable-back')).toHaveCount(0)
    // Arriving from a page (a clicked link) offers the way back to it.
    await page.goto('/forms')
    await page.evaluate(() => { window.location.href = '/f/qa-test-no-such-form-round-three' })
    await expect(page.getByTestId('unavailable-back')).toBeVisible()
    await shot(page, 'c4-unavailable')
    await page.getByTestId('unavailable-back').click()
    await expect(page).toHaveURL(/\/forms$/)
  })
})
