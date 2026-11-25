import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

test('Apply не залипает после исправления ошибки валидации', async ({ page }, testInfo) => {
    // Vue 2: errorUpdate пишет новый ключ в errors без $set, hasErrors не обновляется
    const errors = collectErrors(page)
    await login(page, 'composite-validation')
    await open(page, '/firewall/filter')

    const row = page.locator('.patternProperties .property').nth(1)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    const input = page.locator('.schema-element.extra input')
    await expect(input).toBeVisible({ timeout: 10_000 })

    // невалидный символ '<' запрещён pattern в схеме
    await input.fill('bad<>')
    await input.press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('.element-error-description')).toContainText('Arguments using nft syntax')

    const apply = page.locator('.action-btn').filter({ hasText: /^\s*apply\s*$/i })
    const applyRequests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper?apply,/firewall/filter'))
            applyRequests.push(r)
    })

    await apply.click()
    await page.waitForTimeout(300)
    expect(applyRequests).toHaveLength(0)
    await expect(apply).toHaveAttribute('disabled')

    // исправляем поле — ошибок больше нет, Apply снова доступен и выполняет запрос
    await input.fill('-m comment --comment ok')
    await input.press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('.element-error-description')).toHaveCount(0)
    await expect(apply).not.toHaveAttribute('disabled')
    await expect(apply).not.toHaveClass(/not-valid/)

    await apply.click()
    await expect.poll(() => applyRequests.length, { timeout: 5_000 }).toBe(1)

    expect(errors).toEqual([])
})
