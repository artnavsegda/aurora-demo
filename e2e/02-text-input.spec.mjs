import { expect, test } from '@playwright/test'

import { apiGet, collectErrors, login, open } from './helpers.mjs'

test('текстовое поле не съедает пробел между словами при паузе', async ({ page }, testInfo) => {
    // Vue 2 обрезает значение по дебаунсу и теряет пробел; в Vue 3 исправлено
    test.fail(testInfo.project.name === 'vue2', 'Vue 2: пробел между словами теряется при дебаунсе TextElement')
    const errors = collectErrors(page)
    const token = await login(page, 'composite-text')
    await open(page, '/firewall/filter')

    const row = page.locator('.patternProperties .property').nth(1)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    const input = page.locator('.schema-element.extra input')
    await expect(input).toBeVisible({ timeout: 10_000 })

    await input.fill('hello ')
    await page.waitForTimeout(900)
    await input.press('End')
    await input.pressSequentially('world')
    await page.waitForTimeout(1000)

    await expect(input).toHaveValue('hello world')
    const data = await apiGet(page, token, '/firewall/filter')
    // вторая строка — редактируемое правило eb08bf27f
    expect(Object.values(data).map((v) => v.extra)).toContain('hello world')
    expect(errors).toEqual([])
})
