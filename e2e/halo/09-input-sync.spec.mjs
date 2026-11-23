import { expect, test } from '@playwright/test'

import { login, open, openRow } from './helpers.mjs'

test('Halo: поле подхватывает значение data после refetch', async ({ page }) => {
    const auth = page.waitForResponse(
        (r) => r.url().endsWith('/script/auth') && r.request().method() === 'POST',
    )
    await login(page, 'halo-input-sync')
    const token = (await (await auth).json()).token

    await open(page, '/ip/interface')
    await openRow(page, 'bridge0')
    const inputs = page.locator('input')

    // меняем данные в обход формы и заставляем страницу перечитать @get
    const res = await page.request.post('/script/wrapper?@set,/ip/interface', {
        data: {
            type: '@set',
            path: '/ip/interface',
            token,
            data: { _option: 'metric', _section: 'bridge0', _value: '777' },
        },
    })
    expect(res.ok()).toBeTruthy()

    // изменение gateway запускает setMutation -> queries[4].refetch()
    await inputs.nth(1).fill('9.9.9.9')
    await inputs.nth(1).press('Tab')
    await page.waitForTimeout(1200)

    await expect(inputs.nth(0)).toHaveValue('777')
})
