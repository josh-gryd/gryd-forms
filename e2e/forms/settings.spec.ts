import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, openBuilder, uniq, BASE } from './helpers'
import { emptyForm, newBlock, type FormDefinition } from '../../engine/forms/core/index'

// Form Settings, 2026-09-26: an option with details is a switch that
// opens them and clears them when turned off; Data is gone; the section list
// follows the scroll; Slack is a channel-or-person picker, a message, and the
// answers to include. Slack itself can't be reached from the harness, so the
// picker's list is served here and the test post is expected to say why.

const SHOTS = '/tmp/forms-dev/shots/settings'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

async function liveForm(request: APIRequestContext, title: string) {
  const def = emptyForm(title)
  def.pages[0].blocks = [newBlock('short', { label: 'Your name', required: true }), newBlock('email', { label: 'Email', required: true }), newBlock('long', { label: 'What should we know?' })]
  const f = await apiCreateForm(request, { title, definition: def })
  await apiPublish(request, f.id)
  const got = await apiGetForm(request, f.id)
  return { ...f, def: got.draft as FormDefinition }
}

const opsOf = async (request: APIRequestContext, id: string) => (await (await request.get(`${BASE}/api/forms/${id}`)).json()).ops

test.describe('Form settings', () => {
  test('switches open their details and clear them when turned off; no Data section', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Switches'))
    await openBuilder(page, f.id, 'settings')
    await expect(page.getByTestId('settings-data')).toHaveCount(0)
    await expect(page.getByTestId('settings-nav').getByRole('link')).toHaveText(['General', 'Availability', 'Access', 'Form behavior', 'After submission', 'Notifications'])

    // Schedule: off shows nothing; on opens the dates; off again clears them.
    await expect(page.getByTestId('settings-opens')).toHaveCount(0)
    await page.getByTestId('settings-schedule').click()
    await expect(page.getByTestId('settings-schedule-details')).toBeVisible()
    await page.getByTestId('settings-opens').fill('2031-05-04T09:30')
    await expect.poll(async () => (await opsOf(request, f.id)).opensAt).not.toBeNull()
    await page.getByTestId('settings-limit-switch').click()
    await page.getByTestId('settings-limit').fill('25')
    await page.getByTestId('settings-limit').press('Enter')
    await expect.poll(async () => (await opsOf(request, f.id)).maxResponses).toBe(25)
    await page.getByTestId('settings-availability').scrollIntoViewIfNeeded()
    await shot(page, 'availability-open')
    await page.getByTestId('settings-schedule').click()
    await expect.poll(async () => (await opsOf(request, f.id)).opensAt).toBeNull()
    await expect(page.getByTestId('settings-opens')).toHaveCount(0)
    await page.getByTestId('settings-limit-switch').click()
    await expect.poll(async () => (await opsOf(request, f.id)).maxResponses).toBeNull()
    // The stock closed note isn't a custom one: off until someone writes their own.
    await expect(page.getByTestId('settings-closed-switch')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('settings-closed-switch').click()
    await page.getByTestId('settings-closed-message').fill('QA-TEST: back next week.')
    // A save elsewhere mid-typing never wipes the box (the click is the page's own, so focus stays put).
    for (const access of ['restricted', 'public']) {
      await page.getByTestId('settings-signin').evaluate(el => (el as HTMLElement).click())
      await expect.poll(async () => (await opsOf(request, f.id)).access).toBe(access)
      await expect(page.getByTestId('settings-signin')).toHaveAttribute('aria-checked', String(access === 'restricted'))
      await expect(page.getByTestId('settings-closed-message')).toHaveValue('QA-TEST: back next week.')
    }
    await page.getByTestId('settings-closed-message').blur()
    await expect.poll(async () => (await apiGetForm(request, f.id) as unknown as { closedMessage: string }).closedMessage).toBe('QA-TEST: back next week.')
    await page.getByTestId('settings-closed-switch').click()
    await expect.poll(async () => (await apiGetForm(request, f.id) as unknown as { closedMessage: string }).closedMessage).toBe('This form is closed. Thanks for your interest.')
    await expect(page.getByTestId('settings-closed-switch')).toHaveAttribute('aria-checked', 'false')

    // Access: a password behind its switch; one response each saves at once and picks how it counts.
    await page.getByTestId('settings-password-switch').click()
    await page.getByTestId('settings-password').fill('open sesame')
    await page.getByTestId('settings-password-save').click()
    await expect(page.getByTestId('settings-password-set')).toBeVisible()
    await page.getByTestId('settings-once').click()
    await expect.poll(async () => (await opsOf(request, f.id)).duplicates).toBe('device')
    await page.getByTestId('settings-duplicates').selectOption('email')
    await expect.poll(async () => (await opsOf(request, f.id)).duplicates).toBe('email')
    await page.getByTestId('settings-access').scrollIntoViewIfNeeded()
    await shot(page, 'access-open')
    await page.getByTestId('settings-password-switch').click()
    await expect.poll(async () => (await opsOf(request, f.id)).hasPassword).toBe(false)
    await page.getByTestId('settings-once').click()
    await expect.poll(async () => (await opsOf(request, f.id)).duplicates).toBe('allow')
  })

  test('a switch with a long description never touches the next one', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Spacing'))
    await openBuilder(page, f.id, 'settings')
    const card = page.getByTestId('settings-behavior')
    await card.scrollIntoViewIfNeeded()
    const rows = card.locator('.fb-toggle')
    await expect(rows).toHaveCount(4)
    const boxes = await rows.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); const t = e.firstElementChild!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, textTop: t.top, textBottom: t.bottom } }))
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i].textTop, `row ${i} text inside its row`).toBeGreaterThanOrEqual(boxes[i].top)
      expect(boxes[i].textBottom, `row ${i} text inside its row`).toBeLessThanOrEqual(boxes[i].bottom + 0.5)
      if (i) expect(boxes[i].top - boxes[i - 1].bottom, `gap above row ${i}`).toBeGreaterThanOrEqual(2)
    }
    await shot(page, 'behavior-spacing')
  })

  test('the section list follows the scroll, and a click lands on its section', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Scroll'))
    await page.setViewportSize({ width: 1440, height: 800 })
    await openBuilder(page, f.id, 'settings')
    const nav = (id: string) => page.getByTestId(`settings-nav-${id}`)
    await expect(nav('general')).toHaveAttribute('aria-current', 'location')
    await page.getByTestId('settings-access').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await expect(nav('access')).toHaveAttribute('aria-current', 'location')
    await expect(nav('general')).not.toHaveAttribute('aria-current', 'location')
    await page.getByTestId('settings-tab').evaluate(el => el.scrollTo({ top: el.scrollHeight }))
    await expect(nav('notifications')).toHaveAttribute('aria-current', 'location')
    await shot(page, 'nav-follows-scroll')
    await nav('behavior').click()
    await expect(nav('behavior')).toHaveAttribute('aria-current', 'location')
    await page.waitForTimeout(1200)
    await expect(nav('behavior')).toHaveAttribute('aria-current', 'location')
    const top = await page.getByTestId('settings-behavior').evaluate(el => el.getBoundingClientRect().top - el.closest('[data-testid="settings-tab"]')!.getBoundingClientRect().top)
    expect(top).toBeLessThan(120)
  })

  test('Slack: pick a channel, set the message and the answers; a test post says why it can’t post from here', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Slack'))
    const [name, email, topic] = f.def.pages[0].blocks
    const all = [
      { kind: 'channel', id: 'C0BSYMJ365N', label: '#automation-test-flows2' },
      { kind: 'channel', id: 'C0GENERAL01', label: '#general' },
      { kind: 'user', id: 'U0ALEX00001', label: 'Alex Doe', sub: 'owner@example.com' },
    ]
    await page.route('**/api/forms/slack/targets**', route => {
      const q = (new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase().replace(/^[#@]/, '')
      return route.fulfill({ json: { options: all.filter(o => !q || o.label.toLowerCase().includes(q) || (o.sub ?? '').includes(q)) } })
    })
    await openBuilder(page, f.id, 'settings')
    await page.getByTestId('settings-slack').click()
    await expect(page.getByTestId('slack-option')).toHaveCount(3)
    await page.getByTestId('settings-notifications').scrollIntoViewIfNeeded()
    await shot(page, 'slack-picker')
    await page.getByTestId('slack-search').fill('auto')
    await expect(page.getByTestId('slack-option')).toHaveCount(1)
    await page.getByTestId('slack-search').press('Enter')
    await expect(page.getByTestId('slack-target-label')).toHaveText('automation-test-flows2')
    await expect.poll(async () => (await opsOf(request, f.id)).slack).toEqual({ on: true, target: { kind: 'channel', id: 'C0BSYMJ365N', label: '#automation-test-flows2' }, message: '', fields: null })

    // The message, with an answer in it.
    await page.getByTestId('settings-slack-message').fill('New lead:')
    await page.getByTestId('settings-slack-insert').selectOption(name.id)
    await expect.poll(async () => (await opsOf(request, f.id)).slack.message).toBe(`New lead: {{answer:${name.id}}}`)
    await expect(page.getByTestId('settings-notifications')).toContainText('Reads as: New lead: {Your name}')

    // The answers: every question, or the ones ticked.
    await page.getByTestId('settings-slack-all').uncheck()
    await expect.poll(async () => (await opsOf(request, f.id)).slack.fields).toEqual([name.id, email.id, topic.id])
    await page.locator(`[data-testid="settings-slack-field"][data-block="${email.id}"]`).uncheck()
    await expect.poll(async () => (await opsOf(request, f.id)).slack.fields).toEqual([name.id, topic.id])
    await shot(page, 'slack-set')

    // No Slack token in the harness: the test post says what to fix, and the log has it.
    await page.getByTestId('settings-slack-test').click()
    await expect(page.getByTestId('settings-slack-test-result')).toContainText("Slack isn't connected")
    await expect(page.getByTestId('notify-log-row').first()).toContainText('Slack')
    await expect(page.getByTestId('notify-log-row').first()).toContainText('Failed')
    await shot(page, 'slack-test-result')

    // Changing where it posts; off keeps the choice for next time.
    await page.getByTestId('slack-target-change').click()
    await page.getByTestId('slack-search').fill('alex')
    await expect(page.getByTestId('slack-option')).toHaveCount(1)
    await page.getByTestId('slack-option').click()
    await expect(page.getByTestId('slack-target-label')).toHaveText('Alex Doe')
    await page.getByTestId('settings-slack').click()
    await expect.poll(async () => (await opsOf(request, f.id)).slack.on).toBe(false)
    expect((await opsOf(request, f.id)).slack.target).toEqual({ kind: 'user', id: 'U0ALEX00001', label: 'Alex Doe' })
    await expect(page.getByTestId('settings-slack-details')).toHaveCount(0)
  })

  test('Slack: with no Slack connection the picker says so instead of an empty list', async ({ page, request }) => {
    const f = await liveForm(request, uniq('QA-TEST Slack offline'))
    await openBuilder(page, f.id, 'settings')
    await page.getByTestId('settings-slack').click()
    await expect(page.getByTestId('slack-unavailable')).toContainText("Slack isn't connected")
    // Nothing is saved until somewhere to post is chosen.
    expect((await opsOf(request, f.id)).slack.on).toBe(false)
  })
})
