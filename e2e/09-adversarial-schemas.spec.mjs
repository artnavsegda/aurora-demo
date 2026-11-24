import { expect, test } from '@playwright/test'

import { closeWindow, collectErrors, login, open } from './helpers.mjs'

// Испытательные схемы из test-schemas/ подключаются к демо только при
// DEMO_TEST_SCHEMAS=1 (см. playwright.config.mjs).
async function loginAndWait(page, username, schemaPath) {
    const loaded = page.waitForResponse(
        (r) => r.url().includes('/schema//' + schemaPath + '.json'),
        { timeout: 15_000 },
    )
    await login(page, username)
    await loaded
    await open(page, '/' + schemaPath)
}
test('испытательная схема validation: типы, границы, cue и modificator', async ({ page }, testInfo) => {
    const errors = collectErrors(page)
    await loginAndWait(page, 'adv-validation', 'test/validation')

    expect(await page.locator('.schema-element').count()).toBeGreaterThan(20)
    await expect(page.locator('.schema-element.array-no-items')).toBeVisible()
    await expect(page.locator('.schema-element.ref-broken input')).toBeVisible()

    // pattern + patternDescription
    const text = page.locator('.schema-element.text input')
    await text.fill('123')
    await text.press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('.schema-element.text .element-error-description')).toContainText('only lowercase latin')
    await text.fill('hello')
    await text.press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('.schema-element.text .element-error-description')).toHaveCount(0)

    // number: min/max
    const number = page.locator('.schema-element.number input')
    await number.fill('5')
    await number.press('Tab')
    await page.waitForTimeout(500)
    await expect(page.locator('.schema-element.number .element-error-description')).toContainText('minimum is 10')
    await number.fill('15')
    await number.press('Tab')
    await page.waitForTimeout(500)
    await expect(page.locator('.schema-element.number .element-error-description')).toHaveCount(0)

    // boolean, которого не было в данных, показывает зависимое поле
    const dependent = page.locator('.schema-element.dependent')
    await expect(dependent).not.toBeVisible()
    await page.locator('.schema-element.boolean-unset .checker').click()
    await expect(dependent).toBeVisible()

    // cue: литералы, defaults и заведомо отсутствующий источник
    const literals = (await page.locator('.schema-element.cue-literals select option').allTextContents()).map((s) => s.trim())
    expect(literals).toEqual(expect.arrayContaining(['one', 'two']))
    // /defaults/server приходит отдельным @cue-запросом
    await expect.poll(async () => (await page.locator('.schema-element.cue-defaults select option').allTextContents()).map((s) => s.trim()))
        .toEqual(expect.arrayContaining(['ovpnserver']))
    await expect(page.locator('.schema-element.cue-missing')).toBeVisible()

    // readOnly и сломанный $ref не должны ломать страницу
    await expect(page.locator('.schema-element.readonly input')).toHaveAttribute('readonly')
    await expect(page.locator('.schema-element.ref-broken input')).toBeEditable()

    // битый pattern в схеме: Vue 3 показывает ошибку, Vue 2 пока падает в консоль
    const bad = page.locator('.schema-element.bad-regexp input')
    await bad.fill('x')
    await bad.press('Tab')
    await page.waitForTimeout(900)
    if (testInfo.project.name === 'vue3') {
        await expect(page.locator('.schema-element.bad-regexp .element-error-description')).toHaveCount(1)
        expect(errors).toEqual([])
    } else {
        expect(errors.filter((e) => e.includes('Invalid regular expression')).length).toBe(1)
        expect(errors.filter((e) => !e.includes('Invalid regular expression'))).toEqual([])
    }
})

test('испытательная схема sections: строки, required, section action', async ({ page }) => {
    const errors = collectErrors(page)
    await loginAndWait(page, 'adv-sections', 'test/sections')

    const rows = page.locator('.patternProperties .property')
    await expect(rows).toHaveCount(2)
    await rows.first().click()
    await expect(page.locator('.schema-element.array-no-items')).toBeVisible()

    const sectionAction = page.locator('.action-btn').filter({ hasText: /^\s*section-call\s*$/i })
    await expect(sectionAction).toBeVisible()
    await sectionAction.click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    await closeWindow(page)

    // обязательное отсутствующее поле и скрытый required не ломают форму
    await expect(page.locator('.schema-element.missing-required')).toBeVisible()
    await expect(page.locator('.schema-element.hidden-required')).not.toBeVisible()
    expect(errors).toEqual([])
})

test('испытательная схема actions: форма, confirm, поток и действие без схемы', async ({ page }) => {
    const errors = collectErrors(page)
    await loginAndWait(page, 'adv-actions', 'test/actions')

    // действие с формой и валидацией
    await page.locator('.action-btn').filter({ hasText: /^\s*simple\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    const text = page.locator('.schema-element.text input')
    await text.fill('BAD')
    await text.press('Tab')
    await page.waitForTimeout(900)
    await expect(page.locator('.schema-element.text .element-error-description')).toContainText('only lowercase latin')
    await text.fill('hello')
    await text.press('Tab')
    await page.waitForTimeout(900)
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toHaveCount(0, { timeout: 5_000 })

    // confirm
    await page.locator('.action-btn').filter({ hasText: /^\s*confirm\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    await closeWindow(page)

    // потоковый вывод
    await page.locator('.action-btn').filter({ hasText: /^\s*stream\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toBeVisible()
    await page.locator('.action-btn').filter({ hasText: /^\s*ok\s*$/i }).click()
    await expect(page.locator('.output-line').filter({ hasText: 'demo: stream' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.output-line').filter({ hasText: 'done' })).toBeVisible({ timeout: 10_000 })
    await closeWindow(page)

    // действие без формы: окно не должно залипнуть
    await page.locator('.action-btn').filter({ hasText: /^\s*no-schema\s*$/i }).click()
    await expect(page.locator('.popUpWindow')).toHaveCount(0, { timeout: 5_000 })

    expect(errors).toEqual([])
})

test('испытательная схема edge: странные имена и default/modificator', async ({ page }) => {
    const errors = collectErrors(page)
    await loginAndWait(page, 'adv-edge', 'test/edge')

    await expect(page.locator('.schema-element')).toHaveCount(9)
    await expect(page.locator('.schema-element.default-hidden')).not.toBeVisible()
    await expect(page.locator('.schema-element.dependent-default')).toBeVisible()
    await expect(page.locator('.schema-element.external-condition')).toBeVisible()
    await expect(page.locator('.schema-element.array-pair-bad')).toBeVisible()

    // поле с $ в имени всё равно должно получить контрол
    await expect(page.locator('.schema-element[class~="dollar$field"] input')).toBeVisible()
    await expect(page.locator('.schema-element._private input')).toBeVisible()

    expect(errors).toEqual([])
})
