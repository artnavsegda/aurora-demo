import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

test('журнал показывает строки и обновляется', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'composite-journal')

    await page.locator('.footer .line > .block:last-child').click()
    const logs = page.locator('.logs .log')
    await expect(logs.first()).toBeVisible({ timeout: 10_000 })
    const before = await logs.count()
    await page.waitForTimeout(1600)
    const after = await logs.count()
    expect(after).toBeGreaterThan(before)

    expect(errors).toEqual([])
})
