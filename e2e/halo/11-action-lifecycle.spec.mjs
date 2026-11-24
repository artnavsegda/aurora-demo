import { expect, test } from '@playwright/test'

import { login, open } from './helpers.mjs'

// Регрессия checkConnection: как в Aurora, первый опрос /script/dashboard
// должен идти после delay, иначе устройство ещё отвечает и окно ожидания
// закрывается до реального reboot/upgrade.

test('Halo: checkConnection ждёт delay перед первым опросом', async ({ page }) => {
    await page.route('**/schema//system/config.json', async (route) => {
        const res = await route.fetch()
        const json = await res.json()
        json.actions.default.checkConnection = {
            timeout: 8,
            delay: 2,
            text: 'Resetting to default settings. Please wait',
        }
        await route.fulfill({ response: res, json })
    })

    await login(page, 'halo-lifecycle-delay')
    await open(page, '/system/config')

    const defaultButton = page.getByRole('button', { name: /^default config$/i })
    await expect(defaultButton).toBeVisible()

    let dashboardCalls = 0
    await page.route('**/script/dashboard', async (route) => {
        dashboardCalls += 1
        if (dashboardCalls === 1)
            return route.fulfill({ status: 503, body: 'device is down' })
        return route.continue()
    })

    await defaultButton.click()
    await page.locator('dialog[open]').getByRole('button', { name: /^ok$/i }).click()
    await expect(page.getByText('Resetting to default settings. Please wait')).toBeVisible()

    // delay=2: до двух секунд опроса быть не должно
    await page.waitForTimeout(1000)
    expect(dashboardCalls).toBe(0)

    await expect.poll(() => dashboardCalls, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 })
    await expect(page.locator('.overlay')).toHaveCount(0)
})
