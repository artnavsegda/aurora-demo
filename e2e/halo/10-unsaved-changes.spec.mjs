import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

// Кнопка commit в шапке отражает наличие несохранённых изменений:
// disabled/«No uncommitted changes» до первого @set, active после него
// и снова disabled после успешного commit или при ошибке — с сохранением
// dirty-состояния и черновика.

const commitButton = (page) =>
    page.getByRole('button', { name: 'Commit', exact: true })

test('Halo: commit включается после @set и сбрасывается после успеха', async ({ page }) => {
    const requests = collectRequests(page)
    const commits = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper?commit'))
            commits.push(r.postData() || '')
    })

    await login(page, 'halo-dirty-set')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    await expect(commitButton(page)).toBeDisabled()
    await expect(commitButton(page)).toHaveAttribute(
        'title',
        'No uncommitted changes',
    )

    const input = page.locator('input').first()
    await input.fill('777')
    await input.press('Tab')
    await expect
        .poll(() => requests.some((u) => u.includes('@set,/ip/interface')))
        .toBe(true)

    await expect(commitButton(page)).toBeEnabled()
    await expect(commitButton(page)).toHaveAttribute('title', 'Commit')

    // Apply не сбрасывает dirty: изменения ещё не закоммичены
    await page.getByRole('button', { name: /^apply$/i }).click()
    await expect(commitButton(page)).toBeEnabled()

    // во время commit кнопка заблокирована, запрос ровно один
    await page.route('**/script/wrapper?commit', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        await route.continue()
    })

    await commitButton(page).click()
    await expect(page.locator('.overlay')).toContainText('Committing configuration')
    await expect(commitButton(page)).toBeDisabled()
    await expect.poll(() => commits.length, { timeout: 10_000 }).toBe(1)
    expect(commits[0]).toContain('/system/config')

    await expect(page.locator('[data-toast="success"]')).toContainText(
        'Configuration committed.',
    )
    await expect(commitButton(page)).toBeDisabled()
    await expect(commitButton(page)).toHaveAttribute(
        'title',
        'No uncommitted changes',
    )
})

test('Halo: ошибка commit сохраняет dirty-состояние и черновик', async ({ page }) => {
    await login(page, 'halo-dirty-fail')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const input = page.locator('input').first()
    await input.fill('321')
    await input.press('Tab')
    await expect(commitButton(page)).toBeEnabled()

    await page.route('**/script/wrapper?commit', (route) =>
        route.fulfill({ status: 500, body: 'uci: commit failed' }),
    )
    await commitButton(page).click()

    await expect(page.locator('[data-toast="error"]')).toContainText(
        'uci: commit failed',
    )
    await expect(commitButton(page)).toBeEnabled()
    await expect(input).toHaveValue('321')
})

test('Halo: delete включает commit и сбрасывается после commit', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-dirty-delete')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    await expect(commitButton(page)).toBeDisabled()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await page.locator('dialog[open]').getByRole('button', { name: /^ok$/i }).click()
    await expect
        .poll(() => requests.some((u) => u.includes('delete,/ip/interface')))
        .toBe(true)
    await expect(commitButton(page)).toBeEnabled()

    await commitButton(page).click()
    await expect(commitButton(page)).toBeDisabled()
})

test('Halo: clean тоже включает commit и сбрасывается после commit', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-dirty-clean')
    await open(page, '/event')

    await expect(commitButton(page)).toBeDisabled()

    await page.getByRole('button', { name: /^clean$/i }).click()
    await page.locator('dialog[open]').getByRole('button', { name: /^ok$/i }).click()
    await expect
        .poll(() => requests.some((u) => u.includes('clean,/event')))
        .toBe(true)
    await expect(commitButton(page)).toBeEnabled()

    await commitButton(page).click()
    await expect(commitButton(page)).toBeDisabled()
    await expect(commitButton(page)).toHaveAttribute(
        'title',
        'No uncommitted changes',
    )
})
