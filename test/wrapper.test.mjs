import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { call, get, loginToken, makeApp } from './helpers.mjs'

describe('wrapper: схемы, чтение и запись', () => {
    let app

    before(async () => {
        app = await makeApp()
    })

    after(async () => {
        await app.close()
    })

    test('@schemas отдаёт list/hidden и chpasswd_req=0', async () => {
        const token = await loginToken(app, 'schemas-test')
        const res = await call(app, token, '@schemas')
        assert.equal(res.statusCode, 200)
        const body = res.json()
        assert.ok(body.list.includes('/ip/interface'))
        assert.ok(body.hidden.includes('/defaults'))
        assert.deepEqual(body.visible, [])
        assert.deepEqual(body.denied, [])
        assert.equal(body.chpasswd_req, 0)
    })

    test('@get отдаёт данные фикстуры', async () => {
        const token = await loginToken(app, 'get-test')
        const data = await get(app, token, '/ip/interface')
        assert.equal(data.bridge0['.name'], 'bridge0')
        assert.deepEqual(data.bridge0['ip-address'], ['192.168.1.1/24'])
    })

    test('@get несуществующего пути — 404', async () => {
        const token = await loginToken(app, 'get-404')
        const res = await call(app, token, '@get', '/no/such/path')
        assert.equal(res.statusCode, 404)
        assert.match(res.body, /invalid path/)
    })

    test('@set меняет поле записи, apply подтверждает', async () => {
        const token = await loginToken(app, 'set-test')
        const set = await call(app, token, '@set', '/ip/interface', {
            _section: 'bridge0',
            _option: 'metric',
            _value: '100',
        })
        assert.equal(set.statusCode, 200)

        const afterSet = await get(app, token, '/ip/interface')
        assert.equal(afterSet.bridge0.metric, '100')

        const apply = await call(app, token, 'apply', '/ip/interface', { _section: 'bridge0' })
        assert.equal(apply.statusCode, 200)
        assert.deepEqual(apply.json(), {})

        const afterApply = await get(app, token, '/ip/interface')
        assert.equal(afterApply.bridge0.metric, '100')
    })

    test('@set схемы без секций', async () => {
        const token = await loginToken(app, 'set-flat')
        const set = await call(app, token, '@set', '/system/management', {
            _option: 'hostname',
            _value: 'demo-router',
        })
        assert.equal(set.statusCode, 200)

        const data = await get(app, token, '/system/management')
        assert.equal(data.hostname, 'demo-router')
    })

    test('add/delete записи', async () => {
        const token = await loginToken(app, 'add-delete')
        const add = await call(app, token, 'add', '/ip/interface', {
            name: 'test-if',
            type: 'static',
            device: 'br-test',
            'ip-address': ['10.10.10.1/24'],
        })
        assert.equal(add.statusCode, 200)
        const added = add.json()
        const key = Object.keys(added)[0]
        assert.ok(key)
        assert.equal(added[key].name, 'test-if')

        const afterAdd = await get(app, token, '/ip/interface')
        assert.ok(afterAdd[key])

        const del = await call(app, token, 'delete', '/ip/interface', { _section: key })
        assert.equal(del.statusCode, 200)

        const afterDelete = await get(app, token, '/ip/interface')
        assert.equal(afterDelete[key], undefined)
    })

    test('clean очищает секции', async () => {
        const token = await loginToken(app, 'clean-test')
        const clean = await call(app, token, 'clean', '/ip/interface')
        assert.equal(clean.statusCode, 200)
        assert.deepEqual(await get(app, token, '/ip/interface'), {})
    })

    test('reorder меняет порядок и _index', async () => {
        const token = await loginToken(app, 'reorder-test')
        const res = await call(app, token, 'reorder', '/mobile/sms', {
            _section: 'cfg02',
            position: 0,
        })
        assert.equal(res.statusCode, 200)

        const data = await get(app, token, '/mobile/sms')
        assert.deepEqual(Object.keys(data), ['cfg02', 'cfg01'])
        assert.equal(data.cfg02._index, 0)
        assert.equal(data.cfg01._index, 1)
    })

    test('add в секцию с namesake=_index не перезаписывает существующую запись', async () => {
        const token = await loginToken(app, 'add-index')
        const before = await get(app, token, '/mobile/sms')
        assert.deepEqual(Object.keys(before), ['cfg01', 'cfg02'])

        const add = await call(app, token, 'add', '/mobile/sms', {
            from: '+7 900 000-00-03',
            text: 'third',
        })
        assert.equal(add.statusCode, 200)
        const key = Object.keys(add.json())[0]
        assert.equal(key, 'cfg03')
        assert.equal(add.json()[key]._index, 2)

        const after = await get(app, token, '/mobile/sms')
        assert.deepEqual(Object.keys(after), ['cfg01', 'cfg02', 'cfg03'])
        assert.equal(after.cfg01.text, before.cfg01.text)
    })

    test('status: таблица и запись', async () => {
        const token = await loginToken(app, 'status-test')
        const table = await call(app, token, 'status', '/ip/interface')
        assert.equal(table.statusCode, 200)
        const rows = table.json()
        assert.ok(Array.isArray(rows))
        const bridge = rows.find((r) => r.name === 'bridge0')
        assert.ok(bridge)
        assert.equal(typeof bridge['rx-tx'], 'string')

        const one = await call(app, token, 'status', '/ip/interface', { _section: 'bridge0' })
        assert.equal(one.statusCode, 200)
        assert.equal(one.json().state, 'running')
    })

    test('@cue: литералы, $option, записи и фильтры', async () => {
        const token = await loginToken(app, 'cue-test')

        const schemas = await call(app, token, '@cue', '/defaults', ['/defaults/schemas'])
        assert.equal(schemas.statusCode, 200)
        assert.ok(schemas.json().enum.includes('/ip/interface'))

        const literals = await call(app, token, '@cue', '/defaults', ['+one', '+two'])
        assert.deepEqual(literals.json().enum, ['one', 'two'])

        const ports = await call(app, token, '@cue', '/network/bridge/e317b70aa', ['/network/ethernet'])
        assert.deepEqual(ports.json().enum, ['port1', 'port2', 'port3', 'port4', 'port5'])

        const option = await call(app, token, '@cue', '/network/ethernet/894484b5c', ['$name'])
        assert.deepEqual(option.json().enum, ['port1'])

        const filtered = await call(app, token, '@cue', '/firewall/filter/eb08bf27f', ['/firewall/zone[type:address]'])
        assert.deepEqual(filtered.json().enum, ['banned'])
    })

    test('изоляция сессий: изменения одного не видны другому', async () => {
        const a = await loginToken(app, 'session-a')
        const b = await loginToken(app, 'session-b')

        await call(app, a, '@set', '/ip/interface', {
            _section: 'bridge0',
            _option: 'metric',
            _value: '999',
        })

        const dataA = await get(app, a, '/ip/interface')
        const dataB = await get(app, b, '/ip/interface')
        assert.equal(dataA.bridge0.metric, '999')
        assert.equal(dataB.bridge0.metric, undefined)
    })

    test('/system/user содержит залогинившегося пользователя', async () => {
        const token = await loginToken(app, 'alice')
        const users = await get(app, token, '/system/user')
        assert.ok(users.alice)
        assert.equal(users.alice.level, 'administrator')
    })
})
