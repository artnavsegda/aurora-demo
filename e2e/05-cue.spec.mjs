import { expect, test } from '@playwright/test'

import { collectErrors, login, open } from './helpers.mjs'

test('@cue заполняет список source в firewall/filter', async ({ page }) => {
    const errors = collectErrors(page)
    await login(page, 'composite-cue')
    await open(page, '/firewall/filter')

    const row = page.locator('.patternProperties .property').first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    const source = page.locator('.schema-element.src select')
    await expect(source).toBeVisible({ timeout: 10_000 })
    const options = (await source.locator('option').allTextContents()).map((s) => s.trim())
    expect(options).toEqual(expect.arrayContaining(['bridge0', 'modem1', 'zone-lan']))
    expect(errors).toEqual([])
})
