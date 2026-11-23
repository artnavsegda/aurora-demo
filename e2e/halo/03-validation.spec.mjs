import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

test('Halo: invalid pattern не должен уходить в @set', async ({ page }) => {
    test.fail(true, 'Halo не валидирует pattern/required')
    const requests = collectRequests(page)
    await login(page, 'halo-pattern')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const inputs = page.locator('input')
    await inputs.nth(1).fill('not-an-ip')
    await inputs.nth(1).press('Tab')
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('@set,/ip/interface'))).toBe(false)
    await expect(page.locator('body')).toContainText(/invalid|not allowed|Host address/i)
})

test('Halo: ADD не отправляется с пустыми обязательными полями', async ({ page }) => {
    test.fail(true, 'Halo не валидирует pattern/required')
    const requests = collectRequests(page)
    await login(page, 'halo-add-empty')
    await open(page, '/ip/interface')

    await page.getByRole('button', { name: '+ ADD', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^ok$/i }).click()
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('add,/ip/interface'))).toBe(false)
})
