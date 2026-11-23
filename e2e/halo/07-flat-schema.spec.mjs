import { expect, test } from '@playwright/test'

import { collectRequests, login, open } from './helpers.mjs'

test('Halo: плоская схема — изменение hostname и Apply', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-flat')
    await open(page, '/system/management')

    await expect(page.locator('body')).toContainText(/hostname/i)
    const hostname = page.locator('input').first()
    await hostname.fill('halo-test')
    await hostname.press('Tab')
    await page.waitForTimeout(800)
    expect(requests.some((u) => u.includes('@set,/system/management'))).toBe(true)

    await page.getByRole('button', { name: /apply/i }).click()
    await page.waitForTimeout(800)
    expect(requests.some((u) => u.includes('apply,/system/management'))).toBe(true)
})
