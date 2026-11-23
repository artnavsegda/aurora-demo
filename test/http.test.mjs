import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { makeApp } from './helpers.mjs'

describe('HTTP: потоковые действия и upload', () => {
    let app
    let base

    before(async () => {
        app = await makeApp()
        await app.listen({ port: 0, host: '127.0.0.1' })
        base = `http://127.0.0.1:${app.server.address().port}`
    })

    after(async () => {
        await app.close()
    })

    async function token(username) {
        const res = await fetch(`${base}/script/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: '' }),
        })
        assert.equal(res.status, 200)
        return (await res.json()).token
    }

    async function wrapper(tok, type, path, data = {}) {
        return fetch(`${base}/script/wrapper?${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, path, token: tok, data }),
        })
    }

    test('ping отдаёт чанки и завершается', { timeout: 15000 }, async () => {
        const tok = await token('stream-test')
        const res = await wrapper(tok, 'ping', '/tools', { host: '1.1.1.1', count: 1 })
        assert.equal(res.status, 200)
        const body = await res.text()
        assert.match(body, /PING 1\.1\.1\.1/)
        assert.match(body, /1 packets transmitted/)
    })

    test('journal принимает тело без application/json, как прод-wrapper', { timeout: 15000 }, async () => {
        const tok = await token('journal-text-plain')
        const controller = new AbortController()
        const res = await fetch(`${base}/script/wrapper?journal=`, {
            method: 'POST',
            // Halo шлёт строку без Content-Type; fetch выставит text/plain.
            body: JSON.stringify({ type: 'journal', path: '/tools', token: tok, data: { last: 2 } }),
            signal: controller.signal,
        })
        assert.equal(res.status, 200)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let text = ''
        const deadline = Date.now() + 8000
        while (Date.now() < deadline) {
            const { value, done } = await reader.read()
            if (done)
                break
            text += decoder.decode(value, { stream: true })
            if ((text.match(/\n/g) || []).length >= 3)
                break
        }
        controller.abort()
        assert.ok((text.match(/\n/g) || []).length >= 3, `stream closed early: ${JSON.stringify(text)}`)
    })

    test('upload кладёт файл в /storage/file', { timeout: 15000 }, async () => {
        const tok = await token('upload-test')
        const form = new FormData()
        form.append('file/5', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')

        const up = await fetch(`${base}/script/upload`, {
            method: 'POST',
            headers: { Token: tok },
            body: form,
        })
        assert.equal(up.status, 200)

        const res = await wrapper(tok, '@get', '/storage/file')
        assert.equal(res.status, 200)
        const files = await res.json()
        assert.ok(files['hello.txt'])
        assert.equal(files['hello.txt']['file-size'], '5B')
        assert.equal(files['hello.txt']['file-type'], 'text/plain')
    })

    test('journal остаётся открытым и присылает новые строки', { timeout: 15000 }, async () => {
        const tok = await token('journal-test')
        const controller = new AbortController()
        const res = await fetch(`${base}/script/wrapper?journal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'journal', path: '/tools', token: tok, data: { last: 2 } }),
            signal: controller.signal,
        })
        assert.equal(res.status, 200)
        assert.match(res.headers.get('content-type') || '', /text\/html/)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let text = ''
        const deadline = Date.now() + 8000

        // 2 строки истории + минимум одна новая: если поток закрывается сразу
        // после тела запроса, третьей строки не будет
        while (Date.now() < deadline) {
            const { value, done } = await reader.read()
            if (done)
                break
            text += decoder.decode(value, { stream: true })
            if ((text.match(/\n/g) || []).length >= 3)
                break
        }
        controller.abort()

        assert.ok((text.match(/\n/g) || []).length >= 3, `stream closed early: ${JSON.stringify(text)}`)
        assert.match(text, /R50-DEMO/)
    })
})
