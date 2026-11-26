import { expect, test } from '@playwright/test'

import { collectRequests, login, open, openRow } from './helpers.mjs'

test('Halo: cue строки запрашивается с секцией и подставляет $option', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-cue-section')
    await open(page, '/mobile/modem')
    await openRow(page, 'modem1')

    await expect.poll(() => requests.some((u) =>
        u.includes('@cue,/mobile/modem/modem1'))).toBe(true)

    // $modem-sim-slot и $_available-sim-slots разрешаются из текущей записи modem1
    await expect(page.locator('[data-field="modem-primary-sim"]')).toContainText('sim1')
    await expect(page.locator('[data-field="modem-sim-slot"]')).toContainText('sim1')
    await expect(page.locator('[data-field="modem-sim-slot"]')).toContainText('sim2')
})

test('Halo: cue-enum по умолчанию нестрогий, можно ввести своё значение', async ({ page }) => {
    const bodies = []
    page.on('request', (r) => {
        if (!r.url().includes('/script/wrapper'))
            return
        try {
            bodies.push({ url: r.url(), body: JSON.parse(r.postData() || '{}') })
        } catch (e) {}
    })

    await login(page, 'halo-cue-custom')
    await open(page, '/mobile/modem')
    await openRow(page, 'modem1')

    const custom = page.locator('[data-field="modem-band"] input[type="text"]')
    await expect(custom).toBeVisible()
    await custom.fill('n99')
    await custom.press('Enter')

    await expect.poll(() => bodies
        .filter((item) =>
            item.body.type === '@set' &&
            item.body.data?._option === 'modem-band')
        .length).toBe(1)

    const set = bodies.find((item) =>
        item.body.type === '@set' &&
        item.body.data?._option === 'modem-band')
    expect(set.body.data._section).toBe('modem1')
    expect(set.body.data._value).toContain('n99')
})
