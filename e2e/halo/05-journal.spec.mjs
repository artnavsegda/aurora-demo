import { expect, test } from '@playwright/test'

import { collectHttpErrors, journalButton, login } from './helpers.mjs'

test('Halo: журнал открывается и показывает строки', async ({ page }) => {
    const httpErrors = collectHttpErrors(page)
    await login(page, 'halo-journal')

    await journalButton(page).click()
    await expect(page.locator('body')).toContainText('/ journal')
    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.font-mono').first()).toContainText('Router')
    await page.waitForTimeout(1200)

    expect(httpErrors.filter((e) => e.includes('journal'))).toEqual([])
})
