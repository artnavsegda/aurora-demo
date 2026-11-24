import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

test('Halo: invalid pattern не должен уходить в @set', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-pattern')
    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')

    const inputs = page.locator('input')
    await inputs.nth(1).fill('not-an-ip')
    await inputs.nth(1).press('Tab')
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('@set,/ip/interface'))).toBe(false)
    await expect(page.locator('[data-field-error]')).toBeVisible()
    await expect(page.locator('[data-field-error]')).toContainText(/IP address|not allowed|invalid/i)

    // APPLY не должен уходить, пока в форме есть ошибка
    await page.getByRole('button', { name: /^apply$/i }).click()
    await expect(page.locator('[data-apply-error]')).toContainText('Fix validation errors before applying')
    expect(requests.some((u) => u.includes('apply,/ip/interface'))).toBe(false)

    // исправили — ошибка ушла, APPLY отправляется
    await inputs.nth(1).fill('1.2.3.4')
    await inputs.nth(1).press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('[data-field-error]')).toHaveCount(0)
    await page.getByRole('button', { name: /^apply$/i }).click()
    await page.waitForTimeout(600)
    expect(requests.some((u) => u.includes('apply,/ip/interface'))).toBe(true)
})

test('Halo: ADD не отправляется с пустыми обязательными полями', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-add-empty')
    await open(page, '/ip/interface')

    await page.getByRole('button', { name: '+ ADD', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^ok$/i }).click()
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('add,/ip/interface'))).toBe(false)
    await expect(dialog).toBeVisible()
})
