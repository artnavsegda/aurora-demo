import { expect, test } from '@playwright/test'

import { collectErrors, login } from './helpers.mjs'

// Бизнес-проход по всем схемам: открываем страницу и (если есть строки)
// первую секцию, проверяем видимые ошибки полей и ошибки консоли.
// Три известных расхождения схема/данные перечислены явно: это не регрессии
// клиента, а ошибки самих схем или фикстур. Всё остальное считаем новым багом.
const KNOWN = {
    '/network/device:first-row': ['device', 'type', 'vid'],
    '/service/openvpn-server:page': ['ca', 'cert', 'pool', 'tunnel-ip'],
    '/tunnel/wireguard/interface:first-row': ['port', 'priv-key'],
}

test('бизнес-проход по схемам: ошибки полей и консоли', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const consoleErrors = collectErrors(page)
    const token = await login(page, 'schema-business')

    const res = await page.request.post('/script/wrapper?@schemas', {
        data: { type: '@schemas', path: '/', token, data: {} },
    })
    expect(res.ok()).toBeTruthy()
    const paths = (await res.json()).list.filter((p) => !p.startsWith('/test/'))
    expect(paths.length).toBeGreaterThan(50)

    const found = new Map()
    const unexpected = []

    for (const schemaPath of paths) {
        const before = consoleErrors.length
        await page.evaluate((p) => { location.hash = '#' + p }, schemaPath)
        await page.waitForTimeout(350)

        const collect = async (tag) => {
            const fields = await page.locator('.schema-element.error').evaluateAll((els) => els
                .filter((e) => !!(e.offsetWidth || e.offsetHeight))
                .map((e) => e.className.split(/\s+/).filter((c) => c && c !== 'schema-element' && c !== 'error')))
            const errors = consoleErrors.slice(before)
            if (fields.flat().length || errors.length)
                found.set(schemaPath + ':' + tag, { fields: fields.flat().sort(), errors })
        }

        await collect('page')
        const rows = page.locator('.patternProperties .property')
        if (await rows.count()) {
            await rows.first().click()
            await page.waitForTimeout(300)
            await collect('first-row')
        }
    }

    for (const [where, result] of found) {
        if (!KNOWN[where]) {
            unexpected.push(`${where}: ${JSON.stringify(result)}`)
            continue
        }
        // известные ошибки должны быть видны (а не исчезнуть незаметно)
        expect(result.fields, where).toEqual(KNOWN[where])
        if (testInfo.project.name === 'vue2' && where === '/tunnel/wireguard/interface:first-row') {
            // Vue 2: BoolElement пишет в values, когда пришла не та форма данных
            expect(result.errors).toHaveLength(1)
            expect(result.errors[0]).toContain("Cannot create property 'disabled' on string")
        } else {
            expect(result.errors, where).toEqual([])
        }
    }

    expect(unexpected).toEqual([])
    // и наоборот: если schema/фикстуры исправят, тест напомнит убрать KNOWN
    expect([...found.keys()].sort()).toEqual(Object.keys(KNOWN).sort())
})
