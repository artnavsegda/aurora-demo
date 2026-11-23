import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

test('новая секция видит modificator: static показывает IP Address', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'composite-add')
    await open(page, '/ip/interface')

    await expect(page.locator('.patternProperties')).toContainText('bridge0', { timeout: 15_000 })
    await page.locator('.action-btn').filter({ hasText: /^\s*add\s*$/i }).click()

    await expect(page.locator('.popUpWindow')).toBeVisible({ timeout: 5_000 })
    await page.locator('.schema-element.device input').fill('bridge0')
    await page.locator('.schema-element.type select').selectOption('static')

    // TextElement обновляет значение с задержкой 700 мс
    await page.waitForTimeout(900)
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()

    await expect(page.locator('.schema-element.ip-address')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.schema-element.ip-address')).toContainText('IP Address')
    expect(errors).toEqual([])
})
