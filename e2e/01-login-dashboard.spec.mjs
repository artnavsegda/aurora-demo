import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

test('вход, сводка и прямое открытие схемы после dashboard', async ({ page }) => {
    const errors = collectErrors(page)
    const username = 'composite-login'
    await login(page, username)

    // сводка: модель платы и плитки
    await expect(page.locator('.footer')).toContainText('R50-L4.WAn', { timeout: 15_000 })
    await expect(page.locator('.plates-container').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('body')).toContainText('Storage')

    // схема, открытая по адресу сразу после сводки, а не из меню
    await open(page, '/ip/interface')
    await expect(page.locator('.patternProperties')).toContainText('bridge0', { timeout: 15_000 })
    await expect(page.locator('.schema-form .caption.head.ip-address')).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
})
