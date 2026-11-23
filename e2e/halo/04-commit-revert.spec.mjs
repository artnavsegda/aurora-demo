import { expect, test } from '@playwright/test'

import { collectRequests, commitButton, login, open, openRow } from './helpers.mjs'

test('Halo: commit отправляет запрос', async ({ page }) => {
    test.fail(true, 'Halo: commit — заглушка, revert отсутствует')
    const requests = collectRequests(page)
    await login(page, 'halo-commit')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const inputs = page.locator('input')
    await inputs.nth(0).fill('321')
    await inputs.nth(0).press('Tab')
    await page.getByRole('button', { name: /apply/i }).click()
    await page.waitForTimeout(700)

    await commitButton(page).click()
    await page.waitForTimeout(1000)

    expect(requests.some((u) => u.includes('commit'))).toBe(true)
})

test('Halo: revert доступен', async ({ page }) => {
    test.fail(true, 'Halo: commit — заглушка, revert отсутствует')
    await login(page, 'halo-user2')
    await open(page, '/ip/interface')

    await expect(page.getByRole('button', { name: /^revert$/i })).toBeVisible()
})
