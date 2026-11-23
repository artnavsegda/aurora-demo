import { expect, test } from '@playwright/test'

import { collectErrors, login } from './helpers.mjs'

// Дымовой проход по всем схемам: страница должна открыться и не сыпать
// ошибками в консоль. Одинаково для Vue 2 и Vue 3.
test('все схемы открываются без ошибок', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = collectErrors(page)
    const token = await login(page, 'composite-sweep')

    const res = await page.request.post('/script/wrapper?@schemas', {
        data: { type: '@schemas', path: '/', token, data: {} },
    })
    expect(res.ok()).toBeTruthy()
    const paths = (await res.json()).list
    expect(paths.length).toBeGreaterThan(50)

    const broken = []
    for (const schemaPath of paths) {
        const before = errors.length
        await page.evaluate((p) => { location.hash = '#' + p }, schemaPath)
        await page.waitForTimeout(300)

        if (!await page.locator('.schema-form').count())
            broken.push(schemaPath + ': no form')
        if (errors.length > before)
            broken.push(schemaPath + ': ' + errors.slice(before).join('; '))
    }

    expect(broken).toEqual([])
})
