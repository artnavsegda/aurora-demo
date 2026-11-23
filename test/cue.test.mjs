import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { cue, splitSchemaPath } from '../src/cue.mjs'
import { Session } from '../src/session.mjs'
import { SCHEMA_LIST } from '../src/fixtures.mjs'

function session() {
    return new Session('test-token', 'tester')
}

describe('cue', () => {
    test('splitSchemaPath: схема и запись', () => {
        assert.deepEqual(splitSchemaPath('/ip/interface/bridge0'), {
            schema: '/ip/interface',
            rest: ['bridge0'],
        })
        assert.deepEqual(splitSchemaPath('/defaults/ether_port_speed'), {
            schema: '/defaults',
            rest: ['ether_port_speed'],
        })
        assert.deepEqual(splitSchemaPath('/no/such/path'), {
            schema: '/no/such/path',
            rest: [],
        })
    })

    test('литералы, $option и /defaults/schemas', () => {
        const s = session()
        assert.deepEqual(cue(s, '/defaults', ['+one', '+two']), { enum: ['one', 'two'] })
        assert.deepEqual(cue(s, '/network/ethernet/894484b5c', ['$name']), { enum: ['port1'] })
        assert.deepEqual(cue(s, '/mobile/modem/modem1', ['$module']), { enum: ['MEIG SRM813Q'] })
        const schemas = cue(s, '/defaults', ['/defaults/schemas'])
        assert.equal(schemas.enum.length, SCHEMA_LIST.length)
        assert.ok(schemas.enum.includes('/ip/interface'))
    })

    test('имена записей схемы', () => {
        const s = session()
        assert.deepEqual(cue(s, '/network/bridge/e317b70aa', ['/network/ethernet']).enum,
            ['port1', 'port2', 'port3', 'port4', 'port5'])
        assert.deepEqual(cue(s, '/firewall/filter/eb08bf27f', ['/firewall/zone']).enum,
            ['banned', 'zone-lan', 'zone-wan'])
    })

    test('фильтры по полям', () => {
        const s = session()
        assert.deepEqual(cue(s, '/firewall/filter/eb08bf27f', ['/firewall/zone[type:address]']).enum,
            ['banned'])
        assert.deepEqual(cue(s, '/firewall/filter/eb08bf27f', ['/firewall/zone[type:!address]']).enum,
            ['zone-lan', 'zone-wan'])
    })

    test('значение опции из другой схемы', () => {
        const s = session()
        assert.deepEqual(cue(s, '/network/ethernet/894484b5c', ['/defaults/ether_port_speed']).enum,
            ['10', '100', '1000', 'auto'])
    })

    test('неизвестные источники не падают', () => {
        const s = session()
        assert.deepEqual(cue(s, '/ip/interface', []), { enum: [] })
        assert.deepEqual(cue(s, '/ip/interface', ['/no/such/schema']), { enum: [] })
        assert.deepEqual(cue(s, '/ip/interface', [null, 42, '']), { enum: [] })
    })
})
