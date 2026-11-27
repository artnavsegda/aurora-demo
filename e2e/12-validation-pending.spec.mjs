import { expect, test } from '@playwright/test'

import { login, open } from './helpers.mjs'

test('Vue 2: Apply ждёт сохранения исправленного поля', async ({ page }) => {
    const bodies = []
    page.on('request', (r) => {
        if (!r.url().includes('/script/wrapper'))
            return
        try {
            bodies.push({ url: r.url(), body: JSON.parse(r.postData() || '{}') })
        } catch (e) {}
    })

    await page.route('**/script/wrapper?@set,/ip/interface', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        await route.continue()
    })

    await login(page, 'composite-validation-pending')
    await open(page, '/ip/interface')

    const row = page.locator('.patternProperties .property').filter({ hasText: 'port1' }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    const metric = page.locator('.schema-element.metric input')
    await expect(metric).toBeVisible({ timeout: 10_000 })
    const apply = page.locator('.action-btn').filter({ hasText: /^\s*apply\s*$/i })

    await metric.fill('8388609')
    await metric.press('Tab')
    await expect(page.locator('.element-error-description')).toContainText('maximum is 8388608')
    await expect(apply).toHaveAttribute('disabled')

    // Исправили и сразу жмём Apply: пока @set не завершён, применять старое
    // значение нельзя — кнопка должна остаться disabled.
    await metric.fill('65000')
    await metric.press('Tab')
    await expect(apply).toHaveAttribute('disabled')
    await page.waitForTimeout(250)
    expect(bodies.filter((item) => item.url.includes('apply,/ip/interface'))).toHaveLength(0)

    // даже если кликнуть по кнопке в этот момент, apply не должен уйти
    await apply.click({ force: true })
    await page.waitForTimeout(250)
    expect(bodies.filter((item) => item.url.includes('apply,/ip/interface'))).toHaveLength(0)

    await expect(apply).not.toHaveAttribute('disabled', { timeout: 5_000 })
    await apply.click()
    await expect.poll(() => bodies
        .filter((item) => item.url.includes('apply,/ip/interface')).length).toBe(1)

    const set = bodies.find((item) =>
        item.url.includes('@set,/ip/interface') &&
        item.body.data?._option === 'metric')
    expect(set.body.data._value).toBe(65000)
})
