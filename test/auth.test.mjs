import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { call, login, loginToken, makeApp } from './helpers.mjs'

describe('auth и служебные роуты', () => {
    let app

    before(async () => {
        app = await makeApp()
    })

    after(async () => {
        await app.close()
    })

    test('логин принимает любое непустое имя', async () => {
        const res = await login(app, 'operator-42', 'whatever')
        assert.equal(res.statusCode, 200)
        const body = res.json()
        assert.equal(typeof body.token, 'string')
        assert.ok(body.token.length >= 32)
        assert.equal(body.timeout, 3600)
    })

    test('пустой username — 403', async () => {
        const res = await login(app, '', '')
        assert.equal(res.statusCode, 403)
        assert.match(res.body, /Access Denied/)
    })

    test('неизвестный токен — 401', async () => {
        const res = await call(app, 'no-such-token', '@get', '/ip/interface')
        assert.equal(res.statusCode, 401)
        assert.match(res.body, /Not Auth/)
    })

    test('logout убивает сессию', async () => {
        const token = await loginToken(app, 'logout-test')
        const out = await app.inject({
            method: 'POST',
            url: '/script/logout',
            payload: { token },
        })
        assert.equal(out.statusCode, 200)

        const res = await call(app, token, '@get', '/ip/interface')
        assert.equal(res.statusCode, 401)
    })

    test('healthz', async () => {
        const res = await app.inject({ method: 'GET', url: '/healthz' })
        assert.equal(res.statusCode, 200)
        assert.equal(res.json().ok, true)
        assert.equal(typeof res.json().sessions, 'number')
    })

    test('dashboard и board требуют токен', async () => {
        const noToken = await app.inject({ method: 'POST', url: '/script/dashboard', payload: {} })
        assert.equal(noToken.statusCode, 401)

        const token = await loginToken(app, 'dashboard-test')
        const dash = await app.inject({
            method: 'POST',
            url: '/script/dashboard',
            payload: { token },
        })
        assert.equal(dash.statusCode, 200)
        const sections = dash.json()
        assert.ok(Array.isArray(sections))
        assert.equal(sections.find((s) => s.label === 'device')?.items?.[0]?.items?.[0]?.value, 'DONYX-DEMO-0001')

        const board = await app.inject({
            method: 'POST',
            url: '/script/board',
            payload: { token },
        })
        assert.equal(board.statusCode, 200)
        assert.equal(board.json().model, 'Donyx iRM')
    })

    test('статика: схема с двойным слешем и 404', async () => {
        const ok = await app.inject({ method: 'GET', url: '/schema//ip/interface.json' })
        assert.equal(ok.statusCode, 200)
        assert.match(ok.headers['content-type'], /application\/json/)
        assert.equal(ok.json().title, 'interface')

        const missing = await app.inject({ method: 'GET', url: '/schema/no-such-schema.json' })
        assert.equal(missing.statusCode, 404)
    })

    test('манифест Halo — валидный пустой модуль', async () => {
        const res = await app.inject({ method: 'GET', url: '/modules/manifest.js' })
        assert.equal(res.statusCode, 200)
        assert.match(res.headers['content-type'], /javascript/)
        assert.match(res.body, /__haloModules/)
    })
})
