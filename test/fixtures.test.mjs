import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
    HOSTNAME, MODEL, SCHEMA_HIDDEN, SCHEMA_LIST, SCHEMA_PATHS,
    cloneData, fixture, fixtureStatus, schemaFor,
} from '../src/fixtures.mjs'
import { board, dashboard } from '../src/dashboard.mjs'

describe('fixtures', () => {
    test('список и hidden', () => {
        assert.ok(SCHEMA_LIST.length > 50)
        assert.ok(SCHEMA_LIST.includes('/ip/interface'))
        assert.ok(SCHEMA_HIDDEN.includes('/defaults'))
        assert.ok(SCHEMA_PATHS.has('/ip/interface'))
        assert.equal(SCHEMA_PATHS.has('/no/such/path'), false)
        assert.equal(HOSTNAME, 'R50-DEMO')
        assert.equal(MODEL, 'R50-L4.WAn')
    })

    test('cloneData отдаёт глубокую копию', () => {
        const a = cloneData('/ip/interface')
        assert.equal(a.bridge0['.name'], 'bridge0')
        a.bridge0['.name'] = 'changed'
        const b = cloneData('/ip/interface')
        assert.equal(b.bridge0['.name'], 'bridge0')
        assert.notEqual(a.bridge0, b.bridge0)
        assert.deepEqual(cloneData('/no/such/path'), {})
    })

    test('fixtureStatus: таблица и запись', () => {
        const table = fixtureStatus('/ip/interface')
        assert.ok(Array.isArray(table))
        assert.equal(table[0].name, 'bridge0')

        const one = fixtureStatus('/ip/interface', 'bridge0')
        assert.equal(one.state, 'running')
        assert.equal(one.mtu, 1500)
        assert.equal(fixtureStatus('/ip/interface', 'missing'), undefined)
        assert.equal(fixtureStatus('/no/such/path'), undefined)
    })

    test('schemaFor читает схему', () => {
        assert.equal(schemaFor('/ip/interface').title, 'interface')
        assert.equal(schemaFor('/no/such/path'), null)
    })

    test('fixtures не содержат исходных секретов', () => {
        const defaults = fixture.data['/defaults'].get
        assert.equal(defaults.serial, 'RAD-DEMO-0001')

        const modem = fixture.data['/mobile/modem'].get.modem1
        assert.equal(modem.imei, '000000000000000')

        const wifi = fixture.data['/wireless/network'].get.wifi1
        assert.equal(wifi.key, 'demo-secret')
    })
})

describe('dashboard', () => {
    test('секции device/hardware/mobile', () => {
        const sections = dashboard()
        assert.ok(Array.isArray(sections))
        assert.equal(sections.length, 3)

        const device = sections.find((s) => s.label === 'device')
        assert.ok(device)
        const boardSection = device.items.find((i) => i.label === 'board')
        assert.equal(boardSection.items.find((i) => i.label === 'model').value, MODEL)
        assert.equal(boardSection.items.find((i) => i.label === 'serial').value, 'RAD-DEMO-0001')

        const hardware = sections.find((s) => s.label === 'hardware')
        assert.ok(hardware)
        assert.ok(hardware.items.some((i) => i.label === 'CPU'))
        assert.ok(hardware.items.some((i) => i.label === 'RAM'))
        assert.ok(hardware.items.some((i) => i.label === 'Storage'))

        const mobile = sections.find((s) => s.label === 'mobile')
        assert.ok(mobile)
        assert.equal(mobile.items[0].label, 'modem1')
    })

    test('board', () => {
        const b = board()
        assert.equal(b.model, MODEL)
        assert.equal(b.serial, 'RAD-DEMO-0001')
        assert.equal(b.hostname, HOSTNAME)
    })
})
