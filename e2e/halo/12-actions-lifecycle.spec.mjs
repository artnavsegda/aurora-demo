import { expect, test } from '@playwright/test'

import { collectRequests, login, open } from './helpers.mjs'

test('Halo: blob-действие скачивает файл', async ({ page }) => {
    await login(page, 'halo-blob')
    await open(page, '/system/management')

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await page.getByRole('button', { name: /report/i }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('demo-report.txt')
})

test('Halo: reload-массив перечитывает соседнюю схему', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-reload')
    await open(page, '/ip/route/list')

    const row = page.locator('tr').filter({ hasText: '192.168.3.0/24' }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await page.getByRole('button', { name: /delete/i }).click()
    await page.getByRole('button', { name: /^ok$/i }).click()

    await expect
        .poll(() => requests.some((u) => u.includes('@get,/ip/route/rule')), {
            timeout: 10_000,
        })
        .toBe(true)
    await expect
        .poll(() => requests.some((u) => u.includes('@get,/ip/route/list')), {
            timeout: 10_000,
        })
        .toBe(true)
})

test('Halo: reset действия обновляет дерево схем', async ({ page }) => {
    const requests = collectRequests(page)
    await page.route('**/schema//system/management.json', async (route) => {
        const res = await route.fetch()
        const json = await res.json()
        json.actions.report.reset = true
        json.actions.report.reload = true
        await route.fulfill({ response: res, json })
    })

    await login(page, 'halo-reset')
    await open(page, '/system/management')

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await page.getByRole('button', { name: /report/i }).click()
    await downloadPromise

    await expect
        .poll(() => requests.some((u) => u.includes('@reset,/')), {
            timeout: 10_000,
        })
        .toBe(true)
})

test('Halo: checkConnection ждёт устройство и возвращает dashboard', async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.route('**/schema//system/management.json', async (route) => {
        const res = await route.fetch()
        const json = await res.json()
        json.actions.reboot.checkConnection.delay = 1
        json.actions.reboot.checkConnection.timeout = 8
        await route.fulfill({ response: res, json })
    })

    await login(page, 'halo-check')
    await open(page, '/system/management')

    let attempts = 0
    await page.route('**/script/dashboard', async (route) => {
        attempts += 1
        if (attempts < 3) return route.fulfill({ status: 503, body: 'down' })
        return route.continue()
    })

    await page.getByRole('button', { name: /reboot/i }).click()
    await expect(
        page.getByText('The device is rebooting. Please wait'),
    ).toBeVisible()
    await expect(page).toHaveURL(/#\/dashboard/, { timeout: 15_000 })
    await expect(page.locator('.overlay')).toHaveCount(0)
    expect(errors).toEqual([])
})
