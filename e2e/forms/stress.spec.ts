import { test, expect } from '@playwright/test'
import { apiCreateForm, apiPublish, openBuilder, waitSaved, BASE } from './helpers'
import { emptyForm, newBlock, newPage, makeOptions, shortId, type FormDefinition, type ComponentType } from '../../engine/forms/core/index'

const TYPES: ComponentType[] = ['short', 'email', 'long', 'number', 'dropdown', 'choice', 'checks', 'yesno', 'date', 'rating', 'scale', 'phone', 'url', 'heading', 'paragraph']

function stressForm(): FormDefinition {
  const def = emptyForm('Stress form')
  const gate = newBlock('choice', { label: 'Which sections apply?', options: makeOptions(['All of them', 'Only the first']) })
  def.pages[0].name = 'Gate'
  def.pages[0].blocks.push(gate)
  for (let p = 2; p <= 20; p++) {
    const page = newPage(p, { name: `Section ${p}` })
    for (let i = 0; i < 5; i++) {
      const type = TYPES[(p * 5 + i) % TYPES.length]
      page.blocks.push(newBlock(type, { label: `${type} ${p}.${i + 1}`, width: i % 3 === 0 ? 'half' : 'full' }))
    }
    def.pages.push(page)
  }
  def.endings.push({ id: shortId('e'), name: 'Short path', kind: 'message', title: 'Short and sweet.', body: '', buttonLabel: '', buttonUrl: '', redirectUrl: '', confetti: false, blocks: [] })
  for (let p = 1; p < 20; p++) {
    def.rules.push({ id: shortId('r'), when: { id: shortId('c'), join: 'and', items: [{ id: shortId('c'), field: gate.id, op: 'eq', value: gate.options[0].id }] }, then: { type: 'show_page', target: def.pages[p].id } })
  }
  def.rules.push({ id: shortId('r'), when: { id: shortId('c'), join: 'and', items: [{ id: shortId('c'), field: gate.id, op: 'eq', value: gate.options[1].id }] }, then: { type: 'go_to_ending', target: def.endings[1].id } })
  return def
}

test.describe('Stress: 20 pages, 96 components, 20 rules', () => {
  test('the builder stays responsive and the public form runs end to end both ways', async ({ page, request }) => {
    const def = stressForm()
    const total = def.pages.reduce((n, p) => n + p.blocks.length, 0)
    expect(total).toBe(96)
    expect(def.rules.length).toBe(20)
    const f = await apiCreateForm(request, { title: def.title, definition: def })
    const t0 = Date.now()
    await openBuilder(page, f.id)
    await expect(page.getByTestId('tab-page-19')).toBeVisible()
    const opened = Date.now() - t0
    await page.getByTestId('tab-page-10').click()
    await expect(page.getByTestId('block')).toHaveCount(5)
    const label = page.getByTestId('block').first().getByTestId('block-label')
    await label.click()
    const t1 = Date.now()
    await label.pressSequentially(' edited quickly', { delay: 0 })
    const typed = Date.now() - t1
    expect(typed).toBeLessThan(4000)
    await waitSaved(page)
    await page.getByTestId('tab-logic').click()
    await expect(page.getByTestId('rule-card')).toHaveCount(20)
    await page.getByRole('tab', { name: 'Flow' }).click()
    const nodes = page.getByTestId('flow-node-page')
    await expect(nodes).toHaveCount(20)
    const boxes = await nodes.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBeFalsy()
    }
    test.info().annotations.push({ type: 'perf', description: `builder opened in ${opened}ms, 15 keystrokes in ${typed}ms` })

    const pub = await apiPublish(request, f.id)
    const gate = def.pages[0].blocks[0]
    await page.goto(`/f/${pub.slug}`)
    await page.getByRole('radio', { name: 'All of them' }).check()
    await page.getByTestId('continue').click()
    for (let p = 2; p <= 20; p++) {
      await expect(page.getByTestId('form-page')).toHaveAttribute('aria-label', `Section ${p}`)
      await expect(page.getByRole('progressbar', { name: 'Form progress' })).toHaveAttribute('aria-valuetext', `Page ${p} of 20`)
      await page.getByTestId('continue').click()
    }
    await expect(page.getByTestId('ending')).toHaveAttribute('data-ending-id', def.endings[0].id)
    await page.goto(`/f/${pub.slug}`)
    await page.getByRole('radio', { name: 'Only the first' }).check()
    await expect(page.getByTestId('continue')).toHaveText(/Submit/)
    await page.getByTestId('continue').click()
    await expect(page.getByTestId('ending')).toHaveAttribute('data-ending-id', def.endings[1].id)
    const list = await (await request.get(`${BASE}/api/forms/${f.id}/responses?status=all`)).json()
    expect(list.total).toBe(2)
    void gate
  })
})
