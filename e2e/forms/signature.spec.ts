import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, openBuilder, waitSaved, axeCheck, BASE } from './helpers'
import { emptyForm, newBlock, newPage, type FormDefinition } from '../../engine/forms/core/index'

// The e-signature field: found in the palette, set up in the Field panel,
// signed by drawing (mouse, finger) or typing (keyboard), carried across a
// refresh, and read back in Results and the CSV.

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `/tmp/forms-dev/shots/signature/${name}.png`, fullPage: false })
}

/** A loopy signature-like path across the pad, as fractions of its box. */
function curve(from = 0.1, to = 0.85, n = 36): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return [from + (to - from) * t, 0.55 - 0.22 * Math.sin(t * Math.PI * 5) * (1 - 0.4 * t)] as [number, number]
  })
}

async function drawWithMouse(page: Page, pad: Locator, pts = curve()) {
  const box = (await pad.boundingBox())!
  const at = ([fx, fy]: [number, number]) => [box.x + fx * box.width, box.y + fy * box.height] as const
  await page.mouse.move(...at(pts[0]))
  await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 2 })
  await page.mouse.up()
}

async function responses(request: APIRequestContext, id: string) {
  return (await (await request.get(`${BASE}/api/forms/${id}/responses?status=all`)).json()) as { counts: { completed: number; partial: number }; rows: Array<{ id: string; cells: Record<string, string> }> }
}

async function signForm(request: APIRequestContext, title: string, edit?: (def: FormDefinition, ids: { name: string; sig: string }) => void) {
  const def = emptyForm(title)
  const name = newBlock('short', { label: 'QA-TEST Name', required: true })
  const sig = newBlock('signature', { label: 'QA-TEST Signature', required: true })
  def.pages[0].blocks = [name, sig]
  edit?.(def, { name: name.id, sig: sig.id })
  const f = await apiCreateForm(request, { title, definition: def })
  const pub = await apiPublish(request, f.id)
  return { f, pub, name, sig }
}

test.describe('E-signature field', () => {
  test('is found by searching "esign", added from the palette, and set up in the Field panel', async ({ page, request }) => {
    const f = await apiCreateForm(request, { title: 'QA-TEST E-sign builder' })
    await openBuilder(page, f.id)
    await page.getByLabel('Search fields').fill('esign')
    await expect(page.getByTestId('lib-signature')).toBeVisible()
    await expect(page.getByTestId('lib-signature')).toContainText('E-signature')
    await page.getByTestId('lib-signature').click()
    const block = page.locator('[data-testid="block"][data-type="signature"]')
    await expect(block).toHaveCount(1)
    await expect(block.getByTestId('signature-pad')).toBeVisible()
    await expect(block.getByText('Sign here')).toBeVisible()
    await expect(block.getByText('I agree that my electronic signature is as valid as a handwritten one.')).toBeVisible()
    await page.getByTestId('side-field').click()
    await expect(page.getByText('How people sign')).toBeVisible()
    await shot(page, 'builder-added')
    await page.getByRole('radio', { name: 'Type only' }).click()
    await page.getByTestId('signature-agreement').fill('QA-TEST I sign this on behalf of my company.')
    await expect(block.getByTestId('signature-typed')).toBeVisible()
    await expect(block.getByTestId('signature-pad')).toHaveCount(0)
    await waitSaved(page)
    const saved = await apiGetForm(request, f.id)
    const b = saved.draft.pages[0].blocks.find((x: { type: string }) => x.type === 'signature')
    expect(b.settings.mode).toBe('type')
    expect(b.settings.agreement).toBe('QA-TEST I sign this on behalf of my company.')
    await shot(page, 'builder-type-only')
  })

  test('a respondent draws with a mouse; a tap is refused, Clear empties the pad, Results shows the drawing', async ({ page, request }) => {
    const { f, pub, name, sig } = await signForm(request, 'QA-TEST E-sign draw')
    await page.goto(`/f/${pub.slug}`)
    const pad = page.getByTestId('signature-pad')
    await expect(page.locator(`[data-anchor="${sig.id}"] [data-required-mark]`)).toBeVisible()
    await page.locator(`#in-${name.id}`).fill('QA-TEST Ada')
    await page.getByTestId('continue').click()
    await expect(page.locator(`#er-${sig.id}`)).toHaveText(/Add your signature to continue\./)
    await expect(pad).toBeFocused()
    const box = (await pad.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(pad).toHaveAttribute('data-signed', 'true')
    await page.getByTestId('continue').click()
    await expect(page.locator(`#er-${sig.id}`)).toHaveText(/Draw your full signature\./)
    await page.getByTestId('signature-clear').click()
    await expect(pad).toHaveAttribute('data-signed', 'false')
    await expect(page.getByText('Sign here')).toBeVisible()
    await drawWithMouse(page, pad)
    await drawWithMouse(page, pad, curve(0.62, 0.8, 8).map(([x]) => [x, 0.3] as [number, number]))
    await expect(pad).toHaveAttribute('data-signed', 'true')
    await expect(page.locator(`#er-${sig.id}`)).toHaveCount(0)
    await shot(page, 'public-drawn')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    const list = await responses(request, f.id)
    expect(list.counts.completed).toBe(1)
    expect(list.rows[0].cells[sig.id]).toBe('Drawn signature')
    const detail = await (await request.get(`${BASE}/api/forms/${f.id}/responses/${list.rows[0].id}`)).json()
    expect(detail.answers[sig.id].kind).toBe('drawn')
    expect(detail.answers[sig.id].strokes.length).toBe(2)
    expect(detail.answers[sig.id].strokes[0].length).toBeGreaterThan(40)
    const csv = await (await request.get(`${BASE}/api/forms/${f.id}/responses.csv?status=all`)).text()
    expect(csv).toContain('Drawn signature')
    expect(csv).not.toContain('strokes')
    await page.goto(`/forms/${f.id}?tab=results`)
    await page.getByTestId('response-row').first().click()
    const shown = page.getByTestId('response-detail').getByTestId('answer-signature')
    await expect(shown).toHaveAttribute('data-kind', 'drawn')
    expect(((await shown.locator('path').getAttribute('d')) ?? '').length).toBeGreaterThan(100)
    await shot(page, 'results-drawn')
  })

  test('keyboard only: Enter on the pad switches to typing, and the typed name is the signature', async ({ page, request }) => {
    const { f, pub, name, sig } = await signForm(request, 'QA-TEST E-sign type')
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Grace')
    await page.getByTestId('signature-pad').focus()
    await page.keyboard.press('Enter')
    const typed = page.getByTestId('signature-typed')
    await expect(typed).toBeFocused()
    await expect(page.getByTestId('signature-mode-type')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.type('Q')
    await page.keyboard.press('Enter')
    await expect(page.locator(`#er-${sig.id}`)).toHaveText(/Type your full name to sign\./)
    await typed.fill('QA-TEST Grace Hopper')
    await shot(page, 'public-typed')
    await typed.press('Enter')
    await expect(page.getByTestId('ending')).toBeVisible()
    const list = await responses(request, f.id)
    expect(list.rows[0].cells[sig.id]).toBe('Typed signature: QA-TEST Grace Hopper')
    await page.goto(`/forms/${f.id}?tab=results`)
    await page.getByTestId('response-row').first().click()
    const shown = page.getByTestId('response-detail').getByTestId('answer-signature')
    await expect(shown).toHaveAttribute('data-kind', 'typed')
    await expect(shown).toContainText('QA-TEST Grace Hopper')
    await shot(page, 'results-typed')
  })

  test('switching from Draw to Type starts afresh, so a drawing never hides behind a typed name', async ({ page, request }) => {
    const { f, pub, name, sig } = await signForm(request, 'QA-TEST E-sign switch')
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Switch')
    await drawWithMouse(page, page.getByTestId('signature-pad'))
    await page.getByTestId('signature-mode-type').click()
    await expect(page.getByTestId('signature-typed')).toHaveValue('')
    await page.getByTestId('signature-typed').fill('QA-TEST Typed Instead')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    expect((await responses(request, f.id)).rows[0].cells[sig.id]).toBe('Typed signature: QA-TEST Typed Instead')
  })

  test('a drawn signature survives a refresh and comes back when the respondent returns to its page', async ({ page, request }) => {
    const { pub, sig } = await signForm(request, 'QA-TEST E-sign resume', def => {
      def.pages.push(newPage(2, { name: 'After', blocks: [newBlock('short', { label: 'QA-TEST After' })] }))
    })
    await page.goto(`/f/${pub.slug}`)
    await page.locator('input[id^="in-"]').first().fill('QA-TEST Resume')
    await drawWithMouse(page, page.getByTestId('signature-pad'))
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('form-page')).toHaveAttribute('aria-label', 'After')
    await page.reload()
    await expect(page.getByTestId('resume-banner')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByTestId('signature-pad')).toHaveAttribute('data-signed', 'true')
    await expect(page.locator(`#er-${sig.id}`)).toHaveCount(0)
  })

  test('on a phone, a finger draws on the pad without scrolling the page', async ({ browser, request }) => {
    const { f, pub, name, sig } = await signForm(request, 'QA-TEST E-sign touch', def => {
      def.pages[0].blocks.unshift(newBlock('long', { label: 'QA-TEST Notes' }))
    })
    const ctx = await browser.newContext({ viewport: { width: 392, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Touch')
    const pad = page.getByTestId('signature-pad')
    await pad.scrollIntoViewIfNeeded()
    const scrollBefore = await page.evaluate(() => window.scrollY)
    const box = (await pad.boundingBox())!
    const cdp = await ctx.newCDPSession(page)
    const pts = curve().map(([fx, fy]) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height }))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] })
    for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(pad).toHaveAttribute('data-signed', 'true')
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
    await page.screenshot({ path: '/tmp/forms-dev/shots/signature/phone-drawn.png' })
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    expect((await responses(request, f.id)).rows[0].cells[sig.id]).toBe('Drawn signature')
    await ctx.close()
  })

  test('a second finger or a palm mid-stroke does not replace the stroke being drawn', async ({ page, request }) => {
    const { f, pub, name, sig } = await signForm(request, 'QA-TEST E-sign two pointers')
    await page.goto(`/f/${pub.slug}`)
    await page.locator(`#in-${name.id}`).fill('QA-TEST Palm')
    await page.getByTestId('signature-pad').evaluate((pad: HTMLElement) => {
      const r = pad.getBoundingClientRect()
      const fire = (type: string, id: number, fx: number, fy: number) => pad.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, bubbles: true, cancelable: true, button: 0, buttons: 1 }))
      fire('pointerdown', 1, 0.1, 0.5)
      for (let i = 1; i <= 10; i++) fire('pointermove', 1, 0.1 + i * 0.03, 0.5 + (i % 2 ? 0.1 : -0.1))
      fire('pointerdown', 2, 0.9, 0.9)
      for (let i = 1; i <= 5; i++) fire('pointermove', 2, 0.9 - i * 0.02, 0.9)
      fire('pointerup', 2, 0.8, 0.9)
      for (let i = 11; i <= 20; i++) fire('pointermove', 1, 0.1 + i * 0.03, 0.5 + (i % 2 ? 0.1 : -0.1))
      fire('pointerup', 1, 0.7, 0.5)
    })
    await expect(page.getByTestId('signature-pad')).toHaveAttribute('data-signed', 'true')
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toBeVisible()
    const list = await responses(request, f.id)
    const detail = await (await request.get(`${BASE}/api/forms/${f.id}/responses/${list.rows[0].id}`)).json()
    const strokes = detail.answers[sig.id].strokes as number[][]
    expect(strokes.length).toBe(1)
    expect(strokes[0][0]).toBe(50)
    expect(strokes[0].length).toBe(42)
  })

  test('has no serious accessibility problems, drawn or typed', async ({ page, request }) => {
    const { pub, sig } = await signForm(request, 'QA-TEST E-sign a11y')
    await page.goto(`/f/${pub.slug}`)
    const drawMode = await axeCheck(page, `[data-anchor="${sig.id}"]`)
    expect(drawMode.serious.map(v => `${v.id}: ${v.help}`)).toEqual([])
    await page.getByTestId('signature-mode-type').click()
    const typeMode = await axeCheck(page, `[data-anchor="${sig.id}"]`)
    expect(typeMode.serious.map(v => `${v.id}: ${v.help}`)).toEqual([])
  })
})
