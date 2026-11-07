import { test, expect, devices, type Page, type APIRequestContext } from '@playwright/test'
import { apiCreateForm, apiGetForm, apiPublish, apiSubmit, uniq, BASE } from './helpers'
import { emptyForm, newBlock, type FormDefinition } from '../../engine/forms/core/index'

// All forms shows each form's folder in the folder's color and moves
// it from there, puts the responses at the end of the row as a pill (like a
// link's clicks), and drops the Edited and Last response columns and the counts
// line. A folder's page names the folder in the band, and its ⋯ (or a
// right-click on the folder in the sidebar) renames, recolors and deletes it.
// Reports left the portal the same day.

const SHOTS = '/tmp/forms-dev/shots/all-forms'
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

async function liveForm(request: APIRequestContext, title: string, folderId: string | null = null) {
  const def = emptyForm(title)
  def.pages[0].blocks = [newBlock('short', { label: 'Your name', required: true }), newBlock('email', { label: 'Email', required: true })]
  const f = await apiCreateForm(request, { title, definition: def })
  if (folderId) expect((await request.patch(`${BASE}/api/forms/${f.id}/settings`, { data: { folderId } })).ok()).toBeTruthy()
  await apiPublish(request, f.id)
  const got = await apiGetForm(request, f.id)
  return { ...f, def: got.draft as FormDefinition }
}

async function folder(request: APIRequestContext, name: string, color?: string) {
  const res = await request.post(`${BASE}/api/forms/folders`, { data: color ? { name, color } : { name } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { id: string; name: string; color: string }
}

test.describe('All forms', () => {
  test('a form’s folder shows in its color and moves from there; responses are a pill at the end of the row', async ({ page, request }) => {
    const a = await folder(request, uniq('QA-TEST Clients'), 'blue')
    const b = await folder(request, uniq('QA-TEST Events'), 'coral')
    const f = await liveForm(request, uniq('QA-TEST Folder chip'), a.id)
    const [n, e] = f.def.pages[0].blocks
    for (const who of ['Ada', 'Grace']) expect((await apiSubmit(request, f.id, { [n.id]: `QA-TEST ${who}`, [e.id]: `qa-test-${who.toLowerCase()}@example.com` })).status).toBe(200)

    await page.goto('/forms')
    const row = page.locator(`[data-testid="form-row"][data-form-id="${f.id}"]`)
    await expect(row).toBeVisible()
    // Form · Folder · Status · Responses, and nothing above the list counting forms.
    await expect(page.locator('.fb-table__head [role="columnheader"]')).toHaveText(['Form', 'Folder', 'Status', 'Responses'])
    await expect(page.getByTestId('forms-counts')).toHaveCount(0)
    const chip = row.getByTestId('form-folder')
    await expect(chip).toHaveText(a.name)
    await expect(chip.locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', 'blue')
    const pill = row.getByTestId('form-responses-link')
    await expect(pill).toContainText('2 responses')
    await expect(row.getByTestId('form-unread')).toHaveText('2 new')
    const box = await pill.boundingBox(), menuBox = await row.getByTestId('form-menu').boundingBox()
    expect(box!.x + box!.width, 'the pill ends the row, just before ⋯').toBeLessThanOrEqual(menuBox!.x)
    await shot(page, 'list')

    // The chip moves the form: another folder, out of any folder, or into a new one.
    await chip.click()
    await expect(page.getByTestId(`folder-pick-${a.id}`)).toContainText('current')
    await shot(page, 'chip-menu')
    await page.getByTestId(`folder-pick-${b.id}`).click()
    await expect(chip).toHaveText(b.name)
    await expect(chip.locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', 'coral')
    expect((await apiGetForm(request, f.id) as unknown as { folderId: string }).folderId).toBe(b.id)
    await chip.click()
    await page.getByTestId('folder-pick-none').click()
    await expect(chip).toHaveText('Folder')
    await expect(chip).toHaveClass(/fb-folder-chip--empty/)
    await row.hover()
    await chip.click()
    await page.getByTestId('folder-pick-new').click()
    const fresh = uniq('QA-TEST Fresh')
    await page.getByTestId('new-folder-name').fill(fresh)
    await page.getByTestId('new-folder-confirm').click()
    await expect(chip).toHaveText(fresh)
    await expect(page.locator('aside[data-v2-sidebar]').getByTestId('nav-folder').filter({ hasText: fresh })).toBeVisible()

    // The pill opens the form's responses.
    await pill.click()
    await expect(page).toHaveURL(new RegExp(`/forms/responses\\?form=${f.id}$`))
  })

  test('a folder’s page: the band names it, and its ⋯ recolors, renames and deletes it; the sidebar’s right-click opens the same menu', async ({ page, request }) => {
    const d = await folder(request, uniq('QA-TEST Paint'))
    const f = await liveForm(request, uniq('QA-TEST In paint'), d.id)
    await page.goto(`/forms?folder=${d.id}`)
    // The band: All forms › [tile] name ⋯ — and the page searches the folder, with a count on each filter.
    const band = page.locator('[data-app-slab]')
    await expect(band.getByTestId('folder-name')).toHaveText(d.name)
    await expect(band.getByTestId('folder-crumb')).toHaveText('All forms')
    await expect(band.getByTestId('folder-tile').locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', d.color)
    await expect(page.getByPlaceholder('Search this folder')).toBeVisible()
    await expect(page.getByTestId('forms-filter')).toContainText('All1')
    await shot(page, 'folder-page')

    // ⋯ → Color: the tile, the sidebar and the row's chip follow.
    await band.getByTestId('folder-actions').click()
    await expect(page.getByTestId('folder-menu-rename')).toContainText('F2')
    await shot(page, 'folder-menu')
    await page.getByTestId('folder-menu-color').click()
    await expect(page.getByTestId(`folder-color-${d.color}`)).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('folder-color-teal').click()
    await expect(page.getByTestId('folder-color-dialog')).toHaveCount(0)
    await expect(band.getByTestId('folder-tile').locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', 'teal')
    const sidebar = page.locator('aside[data-v2-sidebar]')
    const navRow = sidebar.getByTestId('nav-folder').filter({ hasText: d.name })
    await expect(navRow.locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', 'teal')
    await expect(page.locator(`[data-testid="form-row"][data-form-id="${f.id}"]`).getByTestId('form-folder').locator('svg[data-folder-color]')).toHaveAttribute('data-folder-color', 'teal')
    const listed = (await (await request.get(`${BASE}/api/forms/folders`)).json()).folders as Array<{ id: string; color: string }>
    expect(listed.find(x => x.id === d.id)?.color).toBe('teal')

    // F2 renames the folder being looked at.
    await page.getByTestId('form-row').first().focus()
    await page.keyboard.press('F2')
    const renamed = uniq('QA-TEST Paint renamed')
    await page.getByTestId('folder-rename-input').fill(renamed)
    await page.getByTestId('folder-rename-save').click()
    await expect(band.getByTestId('folder-name')).toHaveText(renamed)
    await expect(sidebar.getByTestId('nav-folder').filter({ hasText: renamed })).toBeVisible()

    // Right-click the folder in the sidebar: the same menu. A clashing name is refused in the dialog.
    const other = await folder(request, uniq('QA-TEST Taken'))
    await page.reload()
    await sidebar.getByTestId('nav-folder').filter({ hasText: renamed }).click({ button: 'right' })
    for (const id of ['folder-menu-rename', 'folder-menu-color', 'folder-menu-delete']) await expect(page.getByTestId(id)).toBeVisible()
    await shot(page, 'sidebar-menu')
    await page.getByTestId('folder-menu-rename').click()
    await page.getByTestId('folder-rename-input').fill(other.name)
    await page.getByTestId('folder-rename-save').click()
    await expect(page.getByTestId('folder-rename-dialog')).toContainText('already a folder with that name')
    await page.keyboard.press('Escape')

    // Delete from the ⋯: back to All forms, the form still there, the folder gone from the sidebar.
    await band.getByTestId('folder-actions').click()
    await page.getByTestId('folder-menu-delete').click()
    await page.getByTestId('confirm-yes').click()
    await expect(page).toHaveURL(/\/forms$/)
    await expect(sidebar.getByTestId('nav-folder').filter({ hasText: renamed })).toHaveCount(0)
    await expect(page.locator(`[data-testid="form-row"][data-form-id="${f.id}"]`)).toBeVisible()

    // Deleting from the sidebar's right-click, from another page, stays where you are.
    await sidebar.getByTestId('nav-folder').filter({ hasText: other.name }).click({ button: 'right' })
    await page.getByTestId('folder-menu-delete').click()
    await page.getByTestId('confirm-yes').click()
    await expect(sidebar.getByTestId('nav-folder').filter({ hasText: other.name })).toHaveCount(0)
    await expect(page).toHaveURL(/\/forms$/)
  })

})
