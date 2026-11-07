import { expect, type Page, type APIRequestContext } from '@playwright/test'

export const BASE = process.env.FORMS_BASE_URL || 'http://127.0.0.1:3000'

export async function apiCreateForm(request: APIRequestContext, body: { title?: string; definition?: unknown }) {
  const res = await request.post(`${BASE}/api/forms`, { data: body })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { id: string; slug: string; title: string; revision: number; draft: any }
}

export async function apiGetForm(request: APIRequestContext, id: string) {
  const res = await request.get(`${BASE}/api/forms/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { id: string; slug: string; title: string; revision: number; draft: any; publishState: string; status: string; live: { id: string; number: number } | null; versions: Array<{ id: string; number: number }> }
}

export async function apiSaveDraft(request: APIRequestContext, id: string, definition: unknown, baseRevision: number) {
  const res = await request.put(`${BASE}/api/forms/${id}/draft`, { data: { definition, baseRevision } })
  return { status: res.status(), body: await res.json() }
}

export async function apiPublish(request: APIRequestContext, id: string) {
  const res = await request.post(`${BASE}/api/forms/${id}/publish`, { data: {} })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { version: { id: string; number: number }; slug: string }
}

export async function apiSubmit(request: APIRequestContext, formId: string, answers: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const key = extra.idempotencyKey ?? `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const res = await request.post(`${BASE}/api/public/forms/${formId}/submit`, { data: { idempotencyKey: key, answers, pagesVisited: [], ...extra } })
  return { status: res.status(), body: await res.json() }
}

export function uniq(prefix: string) { return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` }

/** Open the builder for a form and wait until it is interactive. */
export async function openBuilder(page: Page, id: string, tab?: string) {
  await page.goto(`/forms/${id}${tab ? `?tab=${tab}` : ''}`)
  await expect(page.getByTestId('builder-band')).toBeVisible()
  await expect(page.getByTestId('form-title')).toBeVisible()
}

/** A form's responses, on the Forms app's Responses page (they left the builder on 09-26). */
export async function openResponses(page: Page, formId: string) {
  await page.goto(`/forms/responses?form=${formId}`)
  await expect(page.getByTestId('results-tab')).toBeVisible()
}

/** The shell's app sidebar, which the builder fills with its panels. */
export function shellSidebar(page: Page) {
  return page.locator('aside[data-forms-builder]')
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toHaveText(/Saved/, { timeout: 15_000 })
}

/** Type a question in the ghost row and press Enter (the "type to build" door). */
export async function ghostAdd(page: Page, label: string) {
  const ghost = page.getByTestId('ghost-input')
  await ghost.click()
  await ghost.fill(label)
  await ghost.press('Enter')
  await expect(page.locator('[data-testid="block"]').filter({ has: page.locator(`[data-testid="block-label"][data-value="${label}"]`) })).toHaveCount(1)
}

export function blockByLabel(page: Page, label: string) {
  return page.locator('[data-testid="block"]').filter({ has: page.locator(`[data-testid="block-label"][data-value="${label}"]`) })
}

export async function selectBlock(page: Page, label: string) {
  const b = blockByLabel(page, label).first()
  // Click the (inert) answer control, not the label input, so focus stays out of a text field.
  const box = (await b.boundingBox())!
  await b.click({ position: { x: Math.min(40, box.width / 2), y: box.height - 12 } })
  await expect(b).toHaveAttribute('data-selected', 'true')
  return b
}

/** Insert a field type through the slash menu from the ghost row. */
export async function slashAdd(page: Page, key: string) {
  const ghost = page.getByTestId('ghost-input')
  await ghost.click()
  await ghost.type('/')
  await expect(page.getByTestId('slash-menu')).toBeVisible()
  await page.getByTestId(`slash-${key}`).click()
  await expect(page.getByTestId('slash-menu')).toHaveCount(0)
}

export async function publishFromBuilder(page: Page) {
  await page.getByTestId('publish').click()
  await expect(page.getByTestId('toast-published')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('publish-state')).toHaveText(/Live|Unpublished edits/)
}

export async function axeCheck(page: Page, context?: string) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const results = await page.evaluate(async (ctx) => {
    // @ts-expect-error axe is injected
    return await window.axe.run(ctx ? document.querySelector(ctx) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  }, context ?? null)
  const serious = (results.violations as Array<{ id: string; impact: string; nodes: Array<{ target: string[]; failureSummary: string }>; help: string }>).filter(v => v.impact === 'serious' || v.impact === 'critical')
  return { violations: results.violations, serious }
}
