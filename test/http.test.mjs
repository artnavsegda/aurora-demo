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
})
