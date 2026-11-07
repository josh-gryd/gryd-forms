import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiSaveDraft, apiPublish, openBuilder, openResponses, ghostAdd, waitSaved, BASE } from './helpers'
import { emptyForm, newBlock, newPage, newEnding, makeOptions, type FormDefinition } from '../../engine/forms/core/index'

// One test per finding in the 2026-09-24 browser QA report (GRYD Forms, 2/5).
// Each asserts the behaviour the report expected; the screenshots land in
// /tmp/forms-dev/shots/qa/<QA_PHASE>/ so a run before the fix and a run after
// it can be compared side by side.

const PHASE = process.env.QA_PHASE || 'after'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400) // let entrance animations settle so the picture shows the state, not a fade
  await page.screenshot({ path: `/tmp/forms-dev/shots/qa/${PHASE}/${name}.png`, fullPage: false })
}

async function responses(request: APIRequestContext, id: string) {
  return (await (await request.get(`${BASE}/api/forms/${id}/responses?status=all`)).json()) as { total: number; counts: { completed: number; partial: number }; rows: Array<{ status: string; versionNumber: number; cells: Record<string, string> }> }
}

/** Edit the draft through the API the way the builder does, then publish it. */
async function editAndPublish(request: APIRequestContext, id: string, edit: (def: FormDefinition) => void) {
  const f = await apiGetForm(request, id)
  const def = JSON.parse(JSON.stringify(f.draft)) as FormDefinition
  edit(def)
  const saved = await apiSaveDraft(request, id, def, f.revision)
  expect(saved.status).toBe(200)
  return apiPublish(request, id)
}

function respondentFlowForm() {
  const def = emptyForm('QA-TEST Respondent Flow')
  const name = newBlock('short', { label: 'QA-TEST Name', required: true })
  const email = newBlock('email', { label: 'QA-TEST Email', required: true })
  const choice = newBlock('choice', { label: 'QA-TEST Pick one', required: true, options: makeOptions(['QA-TEST Alpha', 'QA-TEST Beta', 'QA-TEST Other']) })
  def.pages[0].blocks = [name, email, choice]
  const seats = newBlock('number', { label: 'QA-TEST Seats', required: true })
  const details = newBlock('short', { label: 'QA-TEST Other details' })
  def.pages.push(newPage(2, { name: 'Details', blocks: [seats, details] }))
  const other = choice.options[2]
  // The "Other details" question only shows for Other — the rule the owner must repair when Other goes.
  def.rules = [{ id: 'r_qaother01', when: { id: 'c_qaother01', join: 'and', items: [{ id: 'c_qaother02', field: choice.id, op: 'eq', value: other.id }] }, then: { type: 'show_field', target: details.id } }]
  return { def, name, email, choice, seats, details, other }
}

test.describe('QA report 2026-09-24', () => {
  test('P0 · a publish mid-session: the open tab submits against the version it started on and nothing is lost', async ({ page, request }) => {
    const { def, name, email, choice, seats, details, other } = respondentFlowForm()
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const v1 = await apiPublish(request, f.id)
    await page.goto(`/f/${v1.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Pat')
    await page.locator(`#in-${email.id}`).fill('pat@example.com')
    await page.getByRole('radio', { name: 'QA-TEST Other' }).click()
    // The owner removes "QA-TEST Other", repairs the rule that used it and publishes v2 while the tab is open.
    await editAndPublish(request, f.id, d => {
      const c = d.pages[0].blocks.find(b => b.id === choice.id)!
      c.options = c.options.filter(o => o.id !== other.id)
      d.rules = []
    })
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('form-page')).toHaveAttribute('aria-label', 'Details')
    await page.locator(`#in-${seats.id}`).fill('3')
    await page.locator(`#in-${details.id}`).fill('QA-TEST reasons')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    await shot(page, 'p0-open-tab-submit')
    const list = await responses(request, f.id)
    expect(list.counts.completed).toBe(1)
    expect(list.counts.partial).toBe(0)
    const row = list.rows.find(r => r.status === 'completed')!
    expect(row.versionNumber).toBe(1)
    expect(row.cells[choice.id]).toBe('QA-TEST Other')
    expect(row.cells[seats.id]).toBe('3')
    expect(row.cells[details.id]).toBe('QA-TEST reasons')
  })

  test('P0 · a refresh after a publish resumes the session on its version with every answer', async ({ page, request }) => {
    const { def, name, email, choice, seats } = respondentFlowForm()
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const v1 = await apiPublish(request, f.id)
    await page.goto(`/f/${v1.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Robin')
    await page.locator(`#in-${email.id}`).fill('robin@example.com')
    await page.getByRole('radio', { name: 'QA-TEST Beta' }).click()
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('form-page')).toHaveAttribute('aria-label', 'Details')
    await page.locator(`#in-${seats.id}`).fill('4')
    await page.waitForTimeout(400)
    // Beta goes in v2; the respondent refreshes mid-page.
    await editAndPublish(request, f.id, d => { const c = d.pages[0].blocks.find(b => b.id === choice.id)!; c.options = c.options.filter(o => o.label !== 'QA-TEST Beta') })
    await page.reload()
    await expect(page.getByTestId('resume-banner')).toBeVisible()
    await expect(page.getByTestId('form-page')).toHaveAttribute('aria-label', 'Details')
    await expect(page.locator(`#in-${seats.id}`)).toHaveValue('4')
    await shot(page, 'p0-refresh-resumed')
    await page.getByTestId('back').click()
    await expect(page.locator(`#in-${name.id}`)).toHaveValue('QA-TEST Robin')
    await expect(page.getByRole('radio', { name: 'QA-TEST Beta' })).toBeChecked()
    await page.getByTestId('continue').click()
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    const list = await responses(request, f.id)
    expect(list.counts.completed).toBe(1)
    expect(list.counts.partial).toBe(0)
    const row = list.rows[0]
    expect(row.versionNumber).toBe(1)
    expect(row.cells[choice.id]).toBe('QA-TEST Beta')
    expect(row.cells[seats.id]).toBe('4')
  })

  test('P0 · a session whose version is gone moves to the live one, keeps what still fits and says so', async ({ page, request }) => {
    const { def, name, email, choice, other } = respondentFlowForm()
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const v1 = await apiPublish(request, f.id)
    const live = await apiGetForm(request, f.id)
    // A session this device saved on a version the server no longer accepts (older than the
    // grace window), planted before the page's own scripts run.
    await page.addInitScript(({ formId, pageId, answers }) => {
      if (sessionStorage.getItem('qa-planted')) return
      sessionStorage.setItem('qa-planted', '1')
      localStorage.setItem(`forms:resp:${formId}:ver_retired0000000000`, JSON.stringify({ v: 1, answers, pageId, visited: [], token: null, idempotencyKey: 'qa-retired-session-0001', at: Date.now() - 60_000 }))
    }, { formId: f.id, pageId: live.draft.pages[0].id, answers: { [name.id]: 'QA-TEST Kim', [email.id]: 'kim@example.com', [choice.id]: 'o_notanoption' } })
    await page.goto(`/f/${v1.slug}`)
    await expect(page.getByTestId('version-notice')).toBeVisible()
    await expect(page.getByTestId('version-notice')).toContainText('This form was updated since you started. Your answers were kept, except one that no longer fits')
    await expect(page.locator(`#in-${name.id}`)).toHaveValue('QA-TEST Kim')
    await expect(page.locator(`#in-${email.id}`)).toHaveValue('kim@example.com')
    await expect(page.getByRole('radio', { name: 'QA-TEST Other' })).not.toBeChecked()
    await shot(page, 'p0-migrated-notice')
    void other
  })

  test('P0 · a refused submit says what happened instead of promising nothing was lost', async ({ page, request }) => {
    const { def, name, email, choice } = respondentFlowForm()
    def.pages = [def.pages[0]]
    def.rules = []
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const v1 = await apiPublish(request, f.id)
    await page.goto(`/f/${v1.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Lee')
    await page.locator(`#in-${email.id}`).fill('lee@example.com')
    await page.getByRole('radio', { name: 'QA-TEST Alpha' }).click()
    // The server disagrees about one answer: the runner shows it on the field, not a generic failure.
    await page.route('**/api/public/forms/*/submit', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'some answers need attention', errors: { [email.id]: 'Use a work email address (not gmail, outlook, yahoo…).' }, pageId: def.pages[0].id }) }))
    await page.getByTestId('continue').click()
    await expect(page.locator('[data-error-summary]')).toContainText('1 answer needs attention')
    await expect(page.getByText('Use a work email address')).toBeVisible()
    await expect(page.getByTestId('submit-failed')).toHaveCount(0)
    await shot(page, 'p0-server-field-error')
    await page.unroute('**/api/public/forms/*/submit')
    // Closed while answering: say so plainly.
    await page.route('**/api/public/forms/*/submit', route => route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'form is closed', closed: true }) }))
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('submit-failed')).toContainText('stopped accepting responses')
    await expect(page.getByTestId('submit-failed')).not.toContainText('Nothing was lost')
    await shot(page, 'p0-closed-while-answering')
    await page.unroute('**/api/public/forms/*/submit')
    void choice
  })

  test('P1 · publishing changes keeps a closed form closed', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Closed Form')
    def.pages[0].blocks = [newBlock('short', { label: 'QA-TEST Question', required: true })]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const v1 = await apiPublish(request, f.id)
    await openBuilder(page, f.id, 'settings')
    await page.getByTestId('settings-accept').click()
    await expect(page.getByTestId('publish-state')).toHaveText('Closed')
    await page.getByTestId('tab-build').click()
    await ghostAdd(page, 'QA-TEST Added later')
    await waitSaved(page)
    await expect(page.getByTestId('publish')).toHaveText('Publish changes')
    await shot(page, 'p1-closed-before-publish')
    await page.getByTestId('publish').click()
    await expect(page.getByTestId('toast-published')).toBeVisible()
    await expect(page.getByTestId('toast-published')).toContainText('still closed')
    await expect(page.getByTestId('publish-state')).toHaveText('Closed')
    await shot(page, 'p1-closed-after-publish')
    await page.getByTestId('tab-settings').click()
    await expect(page.getByTestId('settings-accept')).toHaveAttribute('aria-checked', 'false')
    const after = await apiGetForm(request, f.id)
    expect(after.status).toBe('closed')
    expect(after.live!.number).toBe(2)
    await page.goto(`/f/${v1.slug}`)
    await expect(page.getByTestId('form-closed')).toBeVisible()
  })

  test('P2 · Round and Narrow picked in the Theme panel stay numbers: no oval outline on a phone, and the choice survives a save', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Theme')
    def.pages[0].blocks = [newBlock('short', { label: 'QA-TEST Name', required: true }), newBlock('choice', { label: 'QA-TEST Pick', options: makeOptions(['One', 'Two']) }), newBlock('email', { label: 'QA-TEST Email' })]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id, 'theme')
    const panel = page.getByTestId('theme-panel')
    await panel.getByTestId('preset-paper').click()
    for (const [group, opt] of [['Form width', 'Narrow'], ['Corner radius', 'Round'], ['Spacing', 'Compact'], ['Container', 'Outline'], ['Alignment', 'Centre']] as const) {
      await panel.getByRole('radiogroup', { name: group }).getByRole('radio', { name: opt }).click()
    }
    await waitSaved(page)
    const canvasCard = page.getByTestId('canvas-page')
    expect(await canvasCard.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe('24px')
    expect((await canvasCard.boundingBox())!.width).toBeLessThanOrEqual(561)
    await shot(page, 'p2-theme-canvas')
    const saved = await apiGetForm(request, f.id)
    expect(saved.draft.theme.radius).toBe(18)
    expect(saved.draft.theme.width).toBe(560)
    expect(saved.draft.theme.container).toBe('outline')
    await page.getByTestId('preview').click()
    await page.getByTestId('device-phone').click()
    const frame = page.getByTestId('preview-frame-phone')
    await expect(frame).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, 'p2-phone-outline')
    const card = frame.getByTestId('form-page')
    const box = (await card.boundingBox())!
    const radius = await card.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    expect(radius).toBe(24)
    const pad = await card.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))
    // A rounded corner cuts (1 − 1/√2)·r into the box: the padding clears it.
    expect(pad).toBeGreaterThanOrEqual(radius * (1 - Math.SQRT1_2) + 2)
    const controls = await card.locator('input, button, label').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }).filter(r => r.w > 0 && r.h > 0))
    for (const c of controls) {
      expect(c.x).toBeGreaterThanOrEqual(box.x + 2)
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.width - 2)
    }
  })

  test('P2 · Preview starts at the beginning even with page 2 selected, so page 1 cannot be skipped', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Preview')
    def.pages[0].blocks = [newBlock('short', { label: 'QA-TEST Name', required: true })]
    const p2 = newPage(2, { blocks: [newBlock('short', { label: 'QA-TEST Page two' })] })
    def.pages.push(p2)
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await openBuilder(page, f.id)
    await page.getByTestId('tab-page-1').click()
    await expect(page.getByTestId('canvas-page')).toHaveAttribute('aria-label', 'Page 2')
    await page.getByTestId('preview').click()
    const frame = page.getByTestId('preview-frame-desktop')
    await expect(frame.getByTestId('form-page')).toHaveAttribute('aria-label', 'Page 1')
    await shot(page, 'p2-preview-starts-page-1')
    await frame.getByTestId('continue').click()
    await expect(frame.locator('[data-error-summary]')).toContainText('1 answer needs attention')
    await expect(frame.getByTestId('ending')).toHaveCount(0)
  })

  test('P2 · a date range that ends before it starts is refused, in preview and on the live form', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Dates')
    const name = newBlock('short', { label: 'QA-TEST Name', required: true })
    const range = newBlock('daterange', { label: 'QA-TEST Stay' })
    def.pages[0].blocks = [name, range]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const pub = await apiPublish(request, f.id)
    await openBuilder(page, f.id)
    await page.getByTestId('preview').click()
    const frame = page.getByTestId('preview-frame-desktop')
    await frame.locator(`#in-${name.id}`).fill('QA-TEST Dee')
    await frame.getByLabel('Start date').fill('2026-09-30')
    await frame.getByLabel('End date').fill('2026-09-01')
    await frame.getByTestId('continue').click()
    await expect(frame.getByText('The end date has to be after the start date.')).toBeVisible()
    await expect(frame.getByTestId('ending')).toHaveCount(0)
    await shot(page, 'p2-date-range-refused')
    // The way the QA's browser tool filled them: el.value = … plus input/change events. React
    // alone never saw those values, so the form showed dates it did not hold and "accepted".
    await page.getByTestId('preview-restart').click()
    await frame.locator(`#in-${name.id}`).fill('QA-TEST Dee')
    for (const [label, v] of [['Start date', '2026-09-30'], ['End date', '2026-09-01']] as const) {
      await frame.getByLabel(label).evaluate((el: HTMLInputElement, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, v)
    }
    await frame.getByTestId('continue').click()
    await expect(frame.getByText('The end date has to be after the start date.')).toBeVisible()
    await expect(frame.getByTestId('ending')).toHaveCount(0)
    await shot(page, 'p2-date-range-tool-filled-refused')
    // Both ends set by one script, with no re-render in between: neither overwrites the other.
    await page.getByTestId('preview-restart').click()
    await frame.locator(`#in-${name.id}`).fill('QA-TEST Dee')
    await frame.getByLabel('Start date').evaluate((start: HTMLInputElement) => {
      const end = start.parentElement!.querySelector<HTMLInputElement>('input[aria-label="End date"]')!
      for (const [el, val] of [[start, '2026-09-30'], [end, '2026-09-01']] as Array<[HTMLInputElement, string]>) {
        el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await expect(frame.getByLabel('Start date')).toHaveValue('2026-09-30')
    await expect(frame.getByLabel('End date')).toHaveValue('2026-09-01')
    await frame.getByTestId('continue').click()
    await expect(frame.getByText('The end date has to be after the start date.')).toBeVisible()
    await expect(frame.getByTestId('ending')).toHaveCount(0)
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Dee')
    await page.getByLabel('Start date').fill('2026-09-30')
    await page.getByLabel('End date').fill('2026-09-01')
    await page.getByTestId('continue').click()
    await expect(page.getByText('The end date has to be after the start date.')).toBeVisible()
    // The end picker cannot even offer a day before the start.
    await expect(page.getByLabel('End date')).toHaveAttribute('min', '2026-09-30')
    const list = await responses(request, f.id)
    expect(list.counts.completed).toBe(0)
  })

  test('P3 · the required message keeps the label as written', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Copy')
    const a = newBlock('short', { label: 'QA-TEST Name', required: true })
    const b = newBlock('short', { label: 'Your company', required: true })
    const c = newBlock('short', { label: 'What should we call you?', required: true })
    def.pages[0].blocks = [a, b, c]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const pub = await apiPublish(request, f.id)
    await page.goto(`/f/${pub.slug}`)
    await page.getByTestId('continue').click()
    await expect(page.locator(`#er-${a.id}`)).toHaveText(/Enter your QA-TEST Name\./)
    await expect(page.locator(`#er-${b.id}`)).toHaveText(/Enter your company\./)
    await expect(page.locator(`#er-${c.id}`)).toHaveText(/This one needs an answer\./)
    await shot(page, 'p3-required-copy')
  })

  test('UX · required questions are marked before anyone presses Continue, for eyes and for screen readers', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Marks')
    const a = newBlock('short', { label: 'QA-TEST Name', required: true })
    const b = newBlock('short', { label: 'QA-TEST Nickname' })
    const c = newBlock('choice', { label: 'QA-TEST Pick', required: true, options: makeOptions(['One', 'Two']) })
    def.pages[0].blocks = [a, b, c]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const pub = await apiPublish(request, f.id)
    await page.goto(`/f/${pub.slug}`)
    // A star after the label, not the word; aria-required carries it for screen readers.
    await expect(page.locator(`[data-anchor="${a.id}"] [data-required-mark]`)).toHaveText('*')
    await expect(page.locator(`[data-anchor="${c.id}"] [data-required-mark]`)).toBeVisible()
    await expect(page.locator(`[data-anchor="${b.id}"] [data-required-mark]`)).toHaveCount(0)
    await expect(page.locator(`[data-anchor="${a.id}"]`).getByText('Required', { exact: true })).toHaveCount(0)
    await expect(page.locator(`#in-${a.id}`)).toHaveAttribute('aria-required', 'true')
    await expect(page.locator(`#in-${b.id}`)).not.toHaveAttribute('aria-required', 'true')
    await expect(page.locator(`[data-anchor="${c.id}"] [role="radiogroup"]`)).toHaveAttribute('aria-required', 'true')
    await shot(page, 'ux-required-marks')
  })

  test('UX · a very long answer is collapsed in the open response until asked for', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Long')
    const a = newBlock('short', { label: 'QA-TEST Name', required: true })
    const b = newBlock('long', { label: 'QA-TEST Essay' })
    const c = newBlock('short', { label: 'QA-TEST After' })
    def.pages[0].blocks = [a, b, c]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    await apiPublish(request, f.id)
    const essay = 'QA-TEST long answer. '.repeat(260)
    const r = await request.post(`${BASE}/api/public/forms/${f.id}/submit`, { data: { idempotencyKey: `qa-long-${Date.now()}`, answers: { [a.id]: 'QA-TEST Essayist', [b.id]: essay, [c.id]: 'QA-TEST visible without scrolling' }, pagesVisited: [] } })
    expect(r.ok()).toBeTruthy()
    await openResponses(page, f.id)
    await page.getByTestId('response-row').first().click()
    const toggle = page.getByTestId('answer-expand')
    await expect(toggle).toBeVisible()
    await expect(toggle).toContainText(/Show all · 5,\d{3} characters/)
    await expect(page.getByTestId('response-detail').getByText('QA-TEST visible without scrolling')).toBeInViewport()
    await shot(page, 'ux-long-answer-collapsed')
    await toggle.click()
    await expect(page.getByTestId('answer-expand')).toContainText('Show less')
  })

  test('UX · address parts filled in one go (autofill, a script) keep each other and reach the response', async ({ page, request }) => {
    const def = emptyForm('QA-TEST Address')
    const addr = newBlock('address', { label: 'QA-TEST Address', required: true })
    def.pages[0].blocks = [addr]
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const pub = await apiPublish(request, f.id)
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${addr.id}`).evaluate((line1: HTMLInputElement) => {
      const root = line1.closest('[data-anchor]')!
      const parts: Array<[string, string]> = [['Street address', 'QA-TEST 1 Main St'], ['City', 'QA-TEST Springfield'], ['Postal code', '12345']]
      for (const [label, val] of parts) {
        const el = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
        el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await expect(page.getByLabel('Street address')).toHaveValue('QA-TEST 1 Main St')
    await expect(page.getByLabel('City')).toHaveValue('QA-TEST Springfield')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    const list = await responses(request, f.id)
    expect(list.counts.completed).toBe(1)
    expect(list.rows[0].cells[addr.id]).toBe('QA-TEST 1 Main St, QA-TEST Springfield, 12345')
  })
})
