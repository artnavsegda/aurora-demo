import { expect, test } from '@playwright/test'

import { closeWindow, collectErrors, login, open } from './helpers.mjs'

// Сценарии, которые уже работают в Aurora и пока не работают в Halo.
// Те же проверки лежат в e2e/halo/*.

test('Aurora: commit и revert отправляют запросы', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper'))
            requests.push(r.url())
    })
    const errors = collectErrors(page)
    await login(page, 'parity-commit')

    await page.locator('.block.action.commit').click()
    await expect.poll(() => requests.some((u) => u.includes('/script/wrapper?commit'))).toBe(true)

    await page.locator('.block.action').filter({ hasText: /^\s*revert\s*$/i }).click()
    await expect.poll(() => requests.some((u) => u.includes('/script/wrapper?revert'))).toBe(true)

    expect(errors).toEqual([])
})

test('Aurora: ADD не отправляется с пустыми обязательными полями', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper'))
            requests.push(r.url())
    })
    const errors = collectErrors(page)
    await login(page, 'parity-add')
    await open(page, '/ip/interface')

    await page.locator('.action-btn').filter({ hasText: /^\s*add\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()
    await page.waitForTimeout(500)

    expect(requests.some((u) => u.includes('add,/ip/interface'))).toBe(false)
    await closeWindow(page)
    expect(errors).toEqual([])
})

test('Aurora: ping не отправляется без host', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper'))
            requests.push(r.url())
    })
    const errors = collectErrors(page)
    await login(page, 'parity-ping')
    await open(page, '/tools')

    await page.locator('.action-btn').filter({ hasText: /^\s*ping\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()
    await page.waitForTimeout(500)

    expect(requests.some((u) => u.includes('ping,/tools'))).toBe(false)
    await closeWindow(page)
    expect(errors).toEqual([])
})

test('Aurora: Stop останавливает потоковый ping', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'parity-stop')
    await open(page, '/tools')

    await page.locator('.action-btn').filter({ hasText: /^\s*ping\s*$/i }).click()
    await page.locator('.schema-element.host input').fill('8.8.8.8')
    await page.waitForTimeout(900)
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()

    const lines = page.locator('.output-line')
    await expect(lines.filter({ hasText: 'PING 8.8.8.8' })).toBeVisible({ timeout: 10_000 })
    await page.locator('.action-btn').filter({ hasText: /^\s*stop\s*$/i }).click()
    const before = await lines.count()
    await page.waitForTimeout(1800)
    const after = await lines.count()

    expect(after - before).toBeLessThanOrEqual(1)
    await closeWindow(page)
    expect(errors).toEqual([])
})

test('Aurora: плоская схема — hostname и Apply', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper'))
            requests.push(r.url())
    })
    const errors = collectErrors(page)
    await login(page, 'parity-flat')
    await open(page, '/system/management')

    const hostname = page.locator('.schema-element.hostname input')
    await hostname.fill('aurora-test')
    await hostname.press('Tab')
    await page.waitForTimeout(900)
    expect(requests.some((u) => u.includes('@set,/system/management'))).toBe(true)

    await page.locator('.action-btn').filter({ hasText: /^\s*apply\s*$/i }).click()
    await expect.poll(() => requests.some((u) => u.includes('apply,/system/management'))).toBe(true)
    expect(errors).toEqual([])
})
