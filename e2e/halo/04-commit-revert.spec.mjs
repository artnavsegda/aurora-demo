import { expect, test } from '@playwright/test'

import { collectRequests, commitButton, login, open, openRow } from './helpers.mjs'

test('Halo: commit отправляет глобальный /system/config', async ({ page }) => {
    const requests = collectRequests(page)
    const commits = []
    page.on('request', (r) => {
        if (!r.url().includes('/script/wrapper?commit'))
            return
        try { commits.push(JSON.parse(r.postData() || '{}')) } catch (e) {}
    })
    await login(page, 'halo-commit')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const inputs = page.locator('input')
    await inputs.nth(0).fill('321')
    await inputs.nth(0).press('Tab')
    await page.getByRole('button', { name: /apply/i }).click()
    await page.waitForTimeout(700)

    await page.route('**/script/wrapper?commit', async (route) => {
        await new Promise((r) => setTimeout(r, 400))
        await route.continue()
    })
    await commitButton(page).click()
    await expect(page.getByText('Please wait to load')).toBeVisible()
    await expect.poll(() => commits.length, { timeout: 10_000 }).toBe(1)
    await expect(page.getByText('Please wait to load')).toHaveCount(0)
    expect(commits[0].path).toBe('/system/config')
    expect(requests.some((u) => u.includes('commit'))).toBe(true)
    await expect(page.locator('[data-toast="success"]')).toContainText('Configuration committed.')
})

test('Halo: ошибка commit не сбрасывает выбранную запись и черновик', async ({ page }) => {
    await login(page, 'halo-commit-fail')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const input = page.locator('input').first()
    await input.fill('321')
    await input.press('Tab')
    await page.waitForTimeout(700)

    await page.route('**/script/wrapper?commit', (route) =>
        route.fulfill({ status: 500, body: 'uci: commit failed' }),
    )
    await commitButton(page).click()

    await expect(page.locator('[data-toast="error"]')).toContainText(
        'uci: commit failed',
    )
    await expect(input).toHaveValue('321')
})

test('Halo: revert доступен', async ({ page }) => {
    test.fail(true, 'Halo: revert отсутствует')
    await login(page, 'halo-user2')
    await open(page, '/ip/interface')

    await expect(page.getByRole('button', { name: /^revert$/i })).toBeVisible()
})
