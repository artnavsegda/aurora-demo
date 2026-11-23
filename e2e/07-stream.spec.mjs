import { expect, test } from '@playwright/test'

import { closeWindow, collectErrors, login, open } from './helpers.mjs'

test('потоковое действие ping показывает вывод', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'composite-stream')
    await open(page, '/tools')

    await page.locator('.action-btn').filter({ hasText: /^\s*ping\s*$/i }).first().click()
    await expect(page.locator('.popUpWindow')).toBeVisible({ timeout: 5_000 })
    await page.locator('.schema-element.host input').fill('8.8.8.8')
    // TextElement обновляет значение с задержкой 700 мс
    await page.waitForTimeout(900)
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).first().click()

    const output = page.locator('.output-line')
    await expect(output.filter({ hasText: 'PING 8.8.8.8' })).toBeVisible({ timeout: 10_000 })
    await expect(output.filter({ hasText: 'packets transmitted' })).toBeVisible({ timeout: 10_000 })

    await closeWindow(page)
    expect(errors).toEqual([])
})
