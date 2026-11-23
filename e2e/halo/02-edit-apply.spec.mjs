import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

test('Halo: изменение поля и Apply отправляют @set/apply', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-edit')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const inputs = page.locator('input')
    await expect(inputs.nth(0)).toBeVisible()
    await inputs.nth(0).fill('123')
    await inputs.nth(0).press('Tab')
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('@set,/ip/interface'))).toBe(true)

    await page.getByRole('button', { name: /apply/i }).click()
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('apply,/ip/interface'))).toBe(true)
    await expect(page.locator('tr').filter({ hasText: 'bridge0' })).toContainText('123')
})
