import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { loadDocs } from '../../../scripts/check-schemas.mjs'
import { effectiveSchema } from '../../../scripts/check-schemas.mjs'
import { validate } from '@/utils/validator'

const docs = loadDocs()
const fixtures = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'fixtures', 'fixtures.json'), 'utf8'))

test('fixture values against schemas', () => {
    const problems = []
    for (const [docPath, doc] of docs) {
        const data = fixtures.data[docPath] && fixtures.data[docPath].get
        if (!data || typeof data !== 'object' || Array.isArray(data))
            continue
        const section = doc.patternProperties && doc.patternProperties['.*']
        const props = section ? section.properties || {} : doc.properties || {}
        const required = section ? section.required || [] : doc.required || []
        const rows = section ? Object.entries(data) : [['', data]]
        for (const [rowKey, row] of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row))
                continue
            for (const [name, raw] of Object.entries(props)) {
                if (raw.hidden === true || raw.readOnly === true || raw.cue || (raw.items && raw.items.cue))
                    continue
                if (raw.type === 'array' && raw.items === undefined && !(raw.modificator && raw.modificator.some((m) => m.then && m.then.items)))
                    continue
                const schema = effectiveSchema(raw, docPath, docs)
                // effectiveSchema оставляет исходный $ref; после подстановки он уже не нужен
                delete schema.$ref
                if (schema.$ref)
                    continue
                if (schema.type === 'array' && schema.items === undefined)
                    continue
                if (schema.readOnly === true)
                    continue
                if (Array.isArray(schema.enum) && schema.enum.length === 0)
                    continue
                if (schema.items && Array.isArray(schema.items.enum) && schema.items.enum.length === 0)
                    continue
                const isRequired = required.includes(name) && schema.hidden !== true && schema.readOnly !== true
                const schema2 = { ...schema, isRequired }
                if (row[name] === undefined) {
                    if (isRequired)
                        problems.push(`${docPath}${rowKey ? '/' + rowKey : ''}/${name}: required but missing`)
                    continue
                }
                const [ok, err] = validate(schema2, row[name])
                if (!ok)
                    problems.push(`${docPath}${rowKey ? '/' + rowKey : ''}/${name}: ${err} = ${JSON.stringify(row[name])}`)
            }
        }
    }
    expect([...new Set(problems)].sort()).toEqual([
        '/network/device/bridge0/device: required but missing',
        '/network/device/bridge0/type: \'br\' - invalid value = "br"',
        '/network/device/bridge0/vid: required but missing',
        '/network/device/eth0/device: required but missing',
        '/network/device/eth0/type: \'ethernet\' - invalid value = "ethernet"',
        '/network/device/eth0/vid: required but missing',
        '/network/device/wlan0/device: required but missing',
        '/network/device/wlan0/type: \'wireless\' - invalid value = "wireless"',
        '/network/device/wlan0/vid: required but missing',
        '/service/openvpn-server/pool: required but missing',
        '/service/openvpn-server/tunnel-ip: required but missing',
    ])
})
