import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

// Карточка #70935951: истёкшая сессия на @cue должна выводить на login,
// а неуспешный commit не должен терять черновик.

test('@cue 403 выводит на login с session token expired', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'session-cue-403')
    await open(page, '/tools')

    await page.route(/\/script\/wrapper\?@cue/, (route) => route.fulfill({
        status: 403,
        contentType: 'text/plain',
        body: 'Access Denied @',
    }))

    await page.locator('.action-btn').filter({ hasText: /^\s*sniffer\s*$/i }).click()
    await page.waitForFunction(() => location.hash === '#/login', null, { timeout: 10_000 })

    await expect(page.locator('.informs-container .inform')).toHaveCount(1)
    await expect(page.locator('.informs-container .inform').first()).toContainText('session token expired')
    await expect(page.locator('.blocker')).toHaveCount(0)
    expect(errors.filter((e) => !e.includes('403'))).toEqual([])
})

test('commit 500 сохраняет изменения и не сбрасывает commited', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'session-commit-500')
    await open(page, '/ip/interface')

    const row = page.locator('.patternProperties .property').first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    const metric = page.locator('.schema-element.metric input')
    await expect(metric).toBeVisible({ timeout: 10_000 })
    await metric.fill('123')
    await metric.press('Tab')
    await page.waitForTimeout(900)

    const commit = page.locator('.block.action.commit')
    await expect(commit).toHaveClass(/not-commited/)

    await page.route(/\/script\/wrapper\?commit/, (route) => route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'QA commit error',
    }))

    await commit.click()
    await expect(page.locator('.informs-container .inform').filter({ hasText: /commit/i }))
        .toBeVisible({ timeout: 5_000 })
    await expect(commit).toHaveClass(/not-commited/)

    expect(errors.filter((e) => !e.includes('500'))).toEqual([])
})
