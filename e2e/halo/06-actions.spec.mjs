import { expect, test } from '@playwright/test'

import { collectRequests, login, open } from './helpers.mjs'

test('Halo: ping не отправляется без обязательного host', async ({ page }) => {
    const requests = collectRequests(page)
    await login(page, 'halo-ping-empty')
    await open(page, '/tools')

    await page.getByRole('button', { name: /^ping$/i }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^ok$/i }).click()
    await page.waitForTimeout(900)

    expect(requests.some((u) => u.includes('ping,/tools'))).toBe(false)
})

test('Halo: Stop останавливает потоковый ping', async ({ page }) => {
    await login(page, 'halo-ping-stop')
    await open(page, '/tools')

    await page.getByRole('button', { name: /^ping$/i }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.locator('input').first().fill('8.8.8.8')
    await dialog.getByRole('button', { name: /^ok$/i }).click()

    const lines = page.locator('.font-mono')
    await expect(lines.filter({ hasText: 'PING 8.8.8.8' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^stop$/i }).click()

    // окно остаётся с уже полученным выводом и явно помечает остановку
    await expect(page.locator('[data-stream-status]')).toHaveText('stream stopped')
    await expect(page.getByRole('button', { name: /^stopped$/i })).toBeDisabled()

    const before = await lines.count()
    await page.waitForTimeout(1800)
    const after = await lines.count()

    // после Stop поток не должен продолжать дописывать строки
    expect(after - before).toBeLessThanOrEqual(1)

    // Close закрывает окно вывода и возвращает страницу
    await page.getByRole('button', { name: /^close$/i }).click()
    await expect(page.locator('[data-stream-status]')).toHaveCount(0)
})
