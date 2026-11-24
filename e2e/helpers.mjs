import { expect } from '@playwright/test'

export function collectErrors(page) {
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => {
        if (m.type() === 'error')
            errors.push('console: ' + m.text())
    })
    return errors
}

export async function login(page, username = 'composite') {
    await page.goto('/#/login')
    await expect(page.locator('#main .login')).toBeVisible()

    const auth = page.waitForResponse(
        (r) => r.url().endsWith('/script/auth') && r.request().method() === 'POST',
    )
    await page.fill('input[type="text"]', username)
    await page.fill('input[type="password"]', 'demo')
    await page.click('.action-btn:has-text("sign-in")')
    const token = (await (await auth).json()).token

    await expect(page.locator('.footer .action.left')).toContainText(username)
    await page.waitForFunction(
        () => document.body.innerText.includes('journal'),
        null,
        { timeout: 15_000 },
    )
    // дождаться сводки: иначе немедленный open() может гоняться с первым
    // рендером Dashboard и остаться на /dashboard
    await expect(page.locator('.plates-container').first()).toBeVisible({ timeout: 15_000 })
    return token
}

export async function open(page, schemaPath) {
    await page.evaluate((p) => { location.hash = '#' + p }, schemaPath)
    await page.waitForTimeout(500)
}

export async function apiGet(page, token, schemaPath) {
    const res = await page.request.post('/script/wrapper?@get,' + schemaPath, {
        data: { type: '@get', path: schemaPath, token, data: {} },
    })
    expect(res.ok()).toBeTruthy()
    return res.json()
}

export async function closeWindow(page) {
    const close = page.locator('.action-btn').filter({ hasText: /^\s*(close|cancel)\s*$/i }).first()
    if (await close.count())
        await close.click()
}
