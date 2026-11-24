import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { Session, SessionStore, TTL } from '../src/session.mjs'
import { fixture } from '../src/fixtures.mjs'

describe('session', () => {
    test('токены уникальны, состояние изолировано', () => {
        const store = new SessionStore()
        const a = store.create('alice')
        const b = store.create('bob')
        assert.notEqual(a.token, b.token)

        a.get('/ip/interface').bridge0.metric = '111'
        assert.equal(a.get('/ip/interface').bridge0.metric, '111')
        assert.equal(b.get('/ip/interface').bridge0.metric, undefined)

        // фикстура не мутируется
        assert.equal(fixture.data['/ip/interface'].get.bridge0.metric, undefined)
    })

    test('seedUser добавляет пользователя в /system/user', () => {
        const store = new SessionStore()
        const s = store.create('carol')
        const users = s.get('/system/user')
        assert.ok(users.carol)
        assert.equal(users.carol.level, 'administrator')
        assert.equal(users.carol.disabled, '0')
        assert.equal(users.carol['.name'], 'carol')
    })

    test('get по токену, remove и TTL', () => {
        const store = new SessionStore()
        const s = store.create('dave')
        assert.equal(store.get(s.token), s)
        assert.equal(store.get('missing'), undefined)

        store.remove(s.token)
        assert.equal(store.get(s.token), undefined)

        const expired = store.create('eve')
        expired.seen = Date.now() - TTL * 1000 - 1
        assert.equal(store.get(expired.token), undefined)
        assert.equal(store.sessions.has(expired.token), false)
    })

    test('cleanup удаляет только истёкшие', () => {
        const store = new SessionStore()
        const alive = store.create('alive')
        const dead = store.create('dead')
        dead.seen = Date.now() - TTL * 1000 - 1

        store.cleanup()
        assert.equal(store.sessions.has(alive.token), true)
        assert.equal(store.sessions.has(dead.token), false)
    })

    test('get создаёт независимую копию пути', () => {
        const store = new SessionStore()
        const s = store.create('frank')
        const first = s.get('/network/ethernet')
        first['a4881f998'].name = 'changed'
        const second = s.get('/network/ethernet')
        assert.equal(second['a4881f998'].name, 'changed') // тот же объект в рамках сессии
        assert.notEqual(second['a4881f998'], fixture.data['/network/ethernet'].get['a4881f998'])
    })
})
