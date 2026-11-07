import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, apiSubmit, openBuilder, uniq, BASE } from './helpers'
import { emptyForm, newBlock, makeOptions, type FormDefinition } from '../../engine/forms/core/index'

// every response lives on the Forms app's Responses page — the
// inbox with no form picked, a form's full view with one — and the builder
// keeps Build · Logic · Design · Share · Settings, each centred like Share.
// Then his layout: the form picker in the band, a toolbar, and the list beside
// the open response.

const SHOTS = '/tmp/forms-dev/shots/responses-page'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

async function liveForm(request: APIRequestContext, title: string) {
  const def = emptyForm(title)
  const plan = newBlock('choice', { label: 'Plan', required: true, options: makeOptions(['Basic', 'Pro']) })
  def.pages[0].blocks = [newBlock('short', { label: 'Your name', required: true }), newBlock('email', { label: 'Email', required: true }), plan]
  const f = await apiCreateForm(request, { title, definition: def })
  await apiPublish(request, f.id)
  const got = await apiGetForm(request, f.id)
  return { ...f, def: got.draft as FormDefinition }
}

test.describe('Responses page', () => {
  test('the band’s Responses button opens this form’s responses; old ?tab=responses links land on the same response', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Responses door'))
    const [n, e, plan] = f.def.pages[0].blocks
    const r = await apiSubmit(request, f.id, { [n.id]: 'QA-TEST Ada', [e.id]: 'qa-test-ada@example.com', [plan.id]: plan.options[0].id })
    expect(r.status).toBe(200)
    await openBuilder(page, f.id)
    const door = page.getByTestId('band-responses')
    await expect(door.getByTestId('responses-unread')).toHaveText('1')
    await expect(page.getByTestId('section-bar').getByRole('tab')).toHaveText(['Build', 'Logic', 'Design', 'Share', 'Settings'])
    await shot(page, 'band-door')
    await door.click()
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}$`))
    await expect(page.getByTestId('responses-form')).toContainText(f.title)
    await expect(page.getByTestId('response-row')).toHaveCount(1)
    await expect(page.getByTestId('responses-form-state')).toHaveText('Live')
    await shot(page, 'form-view')
    // Edit form goes back to the builder.
    await page.getByTestId('responses-open-form').click()
    await expect(page.getByTestId('builder-band')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/forms/${f.id}$`))

    // A link from before the move (a Slack post, an email, a bookmark) opens the same response here.
    await page.goto(`/forms/${f.id}?tab=responses&r=${r.body.submissionId}`)
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}&r=${r.body.submissionId}$`))
    await expect(page.getByTestId('response-detail')).toContainText('QA-TEST Ada')
    await shot(page, 'old-link-detail')
    await page.goto(`/forms/${f.id}?tab=results&view=summary`)
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}&view=summary$`))
    await expect(page.getByTestId('summary-view')).toBeVisible()
  })

  test('the picker lists forms with their new responses; a deleted form says so', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Picker'))
    const [n, e, plan] = f.def.pages[0].blocks
    await apiSubmit(request, f.id, { [n.id]: 'QA-TEST Grace', [e.id]: 'qa-test-grace@example.com', [plan.id]: plan.options[1].id })
    await page.goto('/forms/responses')
    await expect(page.getByTestId('forms-inbox')).toBeVisible()
    await expect(page.getByTestId('responses-form')).toContainText('All forms')
    await page.getByTestId('responses-form').click()
    await expect(page.getByTestId(`responses-form-${f.id}`)).toHaveText(/ · 1 new$/)
    await shot(page, 'picker')
    await page.getByTestId(`responses-form-${f.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}$`))
    await expect(page.getByTestId('response-row')).toHaveCount(1)
    await page.getByTestId('inbox-mark-all').click()
    await expect(page.getByTestId('row-unread')).toHaveCount(0)
    await page.getByTestId('responses-form').click()
    await expect(page.getByTestId(`responses-form-${f.id}`)).not.toHaveText(/new/)
    await page.keyboard.press('Escape')
    await page.goto('/forms/responses?form=frm_qatestnosuchform000')
    await expect(page.getByTestId('responses-form-missing')).toBeVisible()
  })

  test('the list sits beside the open response: the page’s own pick stays unread, a picked one is read, ↑/↓ move, the menu marks unread', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Panes'))
    const [n, e, plan] = f.def.pages[0].blocks
    for (const who of ['Ada', 'Grace', 'Linus']) {
      const r = await apiSubmit(request, f.id, { [n.id]: `QA-TEST ${who}`, [e.id]: `qa-test-${who.toLowerCase()}@example.com`, [plan.id]: plan.options[0].id })
      expect(r.status).toBe(200)
    }
    await page.goto(`/forms/responses?form=${f.id}`)
    const rows = page.getByTestId('response-row')
    await expect(rows).toHaveCount(3)
    // The newest opens by itself — arriving is not reading, so it keeps its dot.
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Linus')
    await expect(rows.first()).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('row-unread')).toHaveCount(3)
    await expect(rows.first()).toContainText('qa-test-linus@example.com')
    await expect(page.getByTestId('sheet-position')).toHaveText('1 of 3')
    await expect(page.getByTestId('sheet-prev')).toBeDisabled()
    await expect(page.getByTestId('answer-row').filter({ hasText: 'Email' })).toContainText('qa-test-linus@example.com')
    await shot(page, 'panes')
    // Moving to one reads it.
    await page.getByTestId('sheet-next').click()
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Grace')
    await expect(page.getByTestId('sheet-position')).toHaveText('2 of 3')
    await expect(rows.nth(1).getByTestId('row-unread')).toHaveCount(0)
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Ada')
    await expect(page.getByTestId('sheet-next')).toBeDisabled()
    await expect(rows.nth(2).getByTestId('row-unread')).toHaveCount(0)
    // Picking the first one reads it too.
    await rows.first().click()
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Linus')
    await expect(page.getByTestId('row-unread')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`form=${f.id}&r=rsp_`))
    // The menu puts it back to unread, and it stays that way while it is open.
    await page.getByTestId('detail-menu').click()
    await page.getByTestId('detail-mark-unread').click()
    await expect(rows.first().getByTestId('row-unread')).toHaveCount(1)
    await page.keyboard.press('ArrowUp')
    await expect(rows.first().getByTestId('row-unread')).toHaveCount(1)
  })

  test('All forms is the same layout: each response names its form and opens it there', async ({ page, request }) => {
    await request.post(`${BASE}/api/forms/responses/read`, { data: { all: true } })
    const f = await liveForm(request, uniq('QA-TEST Across'))
    const [n, e, plan] = f.def.pages[0].blocks
    for (const who of ['Hedy', 'Alan']) await apiSubmit(request, f.id, { [n.id]: `QA-TEST ${who}`, [e.id]: `qa-test-${who.toLowerCase()}@example.com`, [plan.id]: plan.options[1].id })
    await page.goto('/forms/responses')
    const rows = page.getByTestId('inbox-row')
    await expect(rows.first()).toContainText('QA-TEST Alan')
    await expect(rows.first()).toContainText(f.title)
    await expect(page.getByTestId('response-detail')).toBeVisible()
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Alan')
    await expect(page.getByTestId('inbox-unread-count')).toHaveText('2')
    await shot(page, 'all-forms')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Hedy')
    await expect(page.getByTestId('inbox-unread-count')).toHaveText('1')
    await expect(rows.nth(1)).not.toHaveAttribute('data-unread', 'true')
    await page.getByTestId('detail-form-link').click()
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}&r=rsp_`))
    await expect(page.getByTestId('responses-form')).toContainText(f.title)
    await expect(page.getByTestId('sheet-name')).toHaveText('QA-TEST Hedy')
  })

  test('a slow list load can’t land over a newer one', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Race'))
    const [n, e, plan] = f.def.pages[0].blocks
    await apiSubmit(request, f.id, { [n.id]: 'QA-TEST Done', [e.id]: 'qa-test-done@example.com', [plan.id]: plan.options[0].id })
    const draft = await request.post(`${BASE}/api/public/forms/${f.id}/draft`, { data: { answers: { [n.id]: 'QA-TEST Halfway' }, currentPageId: f.def.pages[0].id, pagesVisited: [] } })
    expect(draft.ok()).toBeTruthy()
    await page.goto(`/forms/responses?form=${f.id}`)
    const rows = page.getByTestId('response-row')
    await expect(rows).toHaveCount(2)
    // Completed answers slowly; Partial, clicked straight after, answers at once.
    await page.route(/\/responses\?status=completed/, async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue() })
    await page.getByTestId('filter-completed').click()
    await page.getByTestId('filter-partial').click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('QA-TEST Halfway')
    await page.waitForTimeout(2200)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('QA-TEST Halfway')
  })

  test('Logic, Design, Share and Settings sit centred in the space beside the sidebar; the Settings list is held mid-view', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Centred'))
    await page.setViewportSize({ width: 1600, height: 900 })
    await openBuilder(page, f.id)
    const region = await page.getByTestId('builder-region').boundingBox()
    const centre = region!.x + region!.width / 2
    const offCentre = async (testId: string, column: string) => {
      const box = await page.getByTestId(testId).locator(column).first().boundingBox()
      return Math.abs(box!.x + box!.width / 2 - centre)
    }
    await page.getByTestId('tab-logic').click()
    await page.waitForTimeout(600)
    expect(await offCentre('logic-tab', ':scope > div'), 'Logic').toBeLessThan(2)
    await shot(page, 'logic-centred')
    await page.getByTestId('tab-theme').click()
    await expect(page.getByTestId('theme-panel')).toBeVisible()
    await shot(page, 'design')
    await page.getByTestId('tab-share').click()
    await page.waitForTimeout(600)
    expect(await offCentre('share-tab', ':scope > div'), 'Share').toBeLessThan(2)
    await page.getByTestId('tab-settings').click()
    // The tab rises in; measure once it has landed.
    await page.waitForTimeout(600)
    expect(await offCentre('settings-tab', '.fb-settings-main'), 'Settings cards').toBeLessThan(2)
    const nav = await page.getByTestId('settings-nav').boundingBox()
    const main = await page.getByTestId('settings-tab').locator('.fb-settings-main').boundingBox()
    expect(nav!.x + nav!.width, 'the list sits left of the cards').toBeLessThanOrEqual(main!.x - 20)
    // Mid-view is the middle of the scroll area below the floating section bar (Build's page strip isn't here).
    const area = await page.getByTestId('settings-tab').boundingBox()
    const midView = area!.y + 60 + (area!.height - 60) / 2
    expect(Math.abs(nav!.y + nav!.height / 2 - midView), 'the list is held mid-view').toBeLessThan(4)
    await page.getByTestId('settings-tab').evaluate(el => el.scrollTo({ top: 600 }))
    await page.waitForTimeout(200)
    const scrolled = await page.getByTestId('settings-nav').boundingBox()
    expect(Math.abs(scrolled!.y - nav!.y), 'and stays there as the cards scroll').toBeLessThan(2)
    await shot(page, 'settings-centred')
    // Where there isn't room for both, the cards give way and the list keeps its space.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(200)
    const tightNav = await page.getByTestId('settings-nav').boundingBox()
    const tightMain = await page.getByTestId('settings-tab').locator('.fb-settings-main').boundingBox()
    const tightRegion = await page.getByTestId('builder-region').boundingBox()
    expect(tightNav!.x, 'the list never slides under the sidebar').toBeGreaterThanOrEqual(tightRegion!.x + 16)
    expect(tightNav!.x + tightNav!.width).toBeLessThanOrEqual(tightMain!.x - 20)
    await shot(page, 'settings-1280')
  })
})
