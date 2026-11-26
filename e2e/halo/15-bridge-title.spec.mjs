import { expect, test } from '@playwright/test'

import { login, open, openRow } from './helpers.mjs'

test('Halo: выбранный bridge показывается по namesake, а не по ключу', async ({ page }) => {
    await login(page, 'halo-bridge-title')
    await open(page, '/network/bridge')
    await openRow(page, 'bridge0')

    await expect(page.locator('body')).toContainText('bridge0')
    await expect(page.locator('body')).not.toContainText('0f5ad700c')
})
