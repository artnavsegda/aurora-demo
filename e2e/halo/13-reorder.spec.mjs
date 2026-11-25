import { expect, test } from '@playwright/test'

import { login, open } from './helpers.mjs'

test('Halo: drag переставляет строки и отправляет reorder', async ({ page }) => {
    const bodies = []
    page.on('request', (r) => {
        if (!r.url().includes('/script/wrapper'))
            return
        try {
            bodies.push({ url: r.url(), body: JSON.parse(r.postData() || '{}') })
        } catch (e) {}
    })

    await login(page, 'halo-reorder')
    await open(page, '/firewall/filter')

    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toContainText('input')
    await expect(rows.nth(1)).toContainText('forward')

    await rows.nth(0).dragTo(rows.nth(2))

    await expect.poll(() => bodies
        .filter((item) => item.body.type === 'reorder')
        .length).toBe(1)

    const reorder = bodies.find((item) => item.body.type === 'reorder')
    expect(reorder.body.path).toBe('/firewall/filter')
    expect(reorder.body.data).toEqual({
        _section: 'drop_banned_ips',
        position: 1,
    })

    await expect(rows.nth(0)).toContainText('forward')
    await expect(rows.nth(1)).toContainText('input')
})
