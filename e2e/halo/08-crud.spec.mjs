import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

test('Halo: delete и clean работают', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-crud')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    await page.getByRole('button', { name: /^delete$/i }).click()
    await page.locator('dialog[open]').getByRole('button', { name: /^ok$/i }).click()
    await page.waitForTimeout(900)
    expect(requests.some((u) => u.includes('delete,/ip/interface'))).toBe(true)
    await expect(page.locator('tr').filter({ hasText: 'bridge0' })).toHaveCount(0)

    await open(page, '/event')
    await page.getByRole('button', { name: /^clean$/i }).click()
    await page.locator('dialog[open]').getByRole('button', { name: /^ok$/i }).click()
    await page.waitForTimeout(900)
    expect(requests.some((u) => u.includes('clean,/event'))).toBe(true)
})
