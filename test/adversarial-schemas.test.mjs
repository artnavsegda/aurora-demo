import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

// Испытательные схемы подключаются только по флагу. Ставим его до загрузки
// helpers -> buildApp -> fixtures.
process.env.DEMO_TEST_SCHEMAS = '1'

const { call, get, loginToken, makeApp } = await import('./helpers.mjs')

describe('испытательные схемы /test/*', () => {
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

    test('@schemas и /schema/test/* отдают испытательные схемы', async () => {
        const tok = await loginToken(app, 'adv-schema-list')
        const res = await call(app, tok, '@schemas')
        assert.equal(res.statusCode, 200)
        const list = res.json().list
        for (const p of ['/test/validation', '/test/sections', '/test/actions', '/test/edge'])
            assert.ok(list.includes(p), `no ${p}`)

        for (const p of ['/test/validation', '/test/sections', '/test/actions', '/test/edge']) {
            const file = await app.inject({ method: 'GET', url: `/schema//${p.slice(1)}.json` })
            assert.equal(file.statusCode, 200, p)
            assert.equal(JSON.parse(file.body)['$schema'], 'http://json-schema.org/schema#')
        }
    })

    test('@get и @set работают с плоской испытательной схемой', async () => {
        const tok = await loginToken(app, 'adv-set')
        const data = await get(app, tok, '/test/validation')
        assert.equal(data.text, 'hello')
        assert.equal(data.integer, 3)

        const set = await call(app, tok, '@set', '/test/validation', {
            _option: 'text',
            _value: 'changed',
        })
        assert.equal(set.statusCode, 200)
        assert.equal((await get(app, tok, '/test/validation')).text, 'changed')
    })

    test('@get отдаёт строки секционной испытательной схемы', async () => {
        const tok = await loginToken(app, 'adv-sections')
        const data = await get(app, tok, '/test/sections')
        assert.equal(data['row-1'].name, 'row-1')
        assert.equal(data['row-2'].kind, 'weird')
    })

    test('@cue: литералы, $поле, /defaults и источник из /test', async () => {
        const tok = await loginToken(app, 'adv-cue')
        const literals = await call(app, tok, '@cue', '/test/validation', ['+one', '+two'])
        assert.deepEqual(literals.json().enum, ['one', 'two'])

        const self = await call(app, tok, '@cue', '/test/validation', ['$text'])
        assert.deepEqual(self.json().enum, ['hello'])

        const defaults = await call(app, tok, '@cue', '/test/validation', ['/defaults/server'])
        assert.ok(defaults.json().enum.includes('ovpnserver'))

        const sections = await call(app, tok, '@cue', '/test/validation', ['/test/sections'])
        assert.deepEqual(sections.json().enum, ['bad name', 'row-1'])

        const missing = await call(app, tok, '@cue', '/test/validation', ['/test/no-such-schema'])
        assert.deepEqual(missing.json().enum, [])
    })

    test('actions: простая, потоковая и blob', async () => {
        const tok = await token('adv-actions')

        const simple = await call(app, tok, 'simple', '/test/actions', { text: 'hello', count: 2 })
        assert.equal(simple.statusCode, 200)
        assert.deepEqual(simple.json(), {})

        const stream = await fetch(`${base}/script/wrapper?stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'stream', path: '/test/actions', token: tok, data: { text: 'stream' } }),
        })
        assert.equal(stream.status, 200)
        const text = await stream.text()
        assert.match(text, /demo: stream \/test\/actions/)
        assert.match(text, /done/)

        const blob = await fetch(`${base}/script/wrapper?blob`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'blob', path: '/test/actions', token: tok, data: {} }),
        })
        assert.equal(blob.status, 200)
        assert.match(blob.headers.get('content-disposition') || '', /attachment/)
        assert.match(await blob.text(), /demo file for blob/)
    })
})
