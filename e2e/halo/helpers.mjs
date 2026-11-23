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

export function collectRequests(page) {
    const requests = []
    page.on('request', (r) => {
        if (r.url().includes('/script/wrapper'))
            requests.push(r.url())
    })
    return requests
}

export function collectHttpErrors(page) {
    const errors = []
    page.on('response', (r) => {
        if (r.status() >= 400)
            errors.push(`${r.status()} ${r.url()}`)
    })
    return errors
}

export async function login(page, username = 'halo') {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('body')).toContainText(/welcome/i)
    const inputs = page.locator('input')
    await inputs.nth(0).fill(username)
    await inputs.nth(1).fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/#\/dashboard/, { timeout: 15_000 })
    await expect(page.locator('body')).toContainText('Storage', { timeout: 15_000 })
}

export async function open(page, schemaPath) {
    await page.evaluate((p) => { location.hash = '#' + p }, schemaPath)
    await page.waitForTimeout(700)
}

export async function openRow(page, text) {
    const row = page.locator('tr').filter({ hasText: text }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await page.waitForTimeout(600)
}

export function commitButton(page) {
    return page.locator('button.rounded-full').first()
}

export function journalButton(page) {
    return page.locator('button.rounded').first()
}
