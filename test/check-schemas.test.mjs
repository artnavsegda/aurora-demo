import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'

import { analyzeSchemas } from '../scripts/check-schemas.mjs'

function writeSchemas(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-schemas-'))
    for (const [name, value] of Object.entries(files)) {
        const file = path.join(root, name.endsWith('.json') ? name : name + '.json')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(value))
    }
    return root
}

function issuesOf(files) {
    const root = writeSchemas(files)
    try {
        return analyzeSchemas({ root })
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

const byLevel = (result, level) => result.issues.filter((i) => i.level === level)

describe('check-schemas: разбор схем', () => {
    test('корректная схема не даёт ошибок', () => {
        const result = issuesOf({
            defaults: {
                properties: { port: { type: 'number', minimum: 1, maximum: 65535 } },
                definitions: {
                    name: { type: 'string', pattern: '^[a-z]+$', patternDescription: 'letters' },
                    port: { type: 'number', minimum: 1, maximum: 65535 },
                },
            },
            '/ip/test': {
                patternProperties: {
                    '.*': {
                        required: ['name'],
                        properties: {
                            name: { $ref: '/defaults#/definitions/name' },
                            port: { $ref: '/defaults#/definitions/port', default: 22 },
                        },
                    },
                },
                showParams: ['name', 'port'],
            },
        })
        assert.deepEqual(byLevel(result, 'error'), [])
    })

    test('ловит битый $ref и неизвестный type', () => {
        const result = issuesOf({
            '/broken': {
                properties: {
                    a: { $ref: '/defaults#/definitions/nope' },
                    b: { type: 'text' },
                },
            },
            defaults: { definitions: {} },
        })
        const errors = byLevel(result, 'error').map((i) => i.message)
        assert.ok(errors.some((m) => m.includes('unknown pointer')))
        assert.ok(errors.some((m) => m.includes('unknown type "text"')))
    })

    test('ловит невалидный regexp и противоречивые границы', () => {
        const result = issuesOf({
            '/bad': {
                properties: {
                    a: { type: 'string', pattern: '[' },
                    b: { type: 'number', minimum: 10, maximum: 5 },
                    c: { type: 'string', minLength: 10, maxLength: 5 },
                },
            },
        })
        const errors = byLevel(result, 'error').map((i) => i.message)
        assert.ok(errors.some((m) => m.includes('invalid regexp')))
        assert.ok(errors.some((m) => m.includes('minimum=10 > maximum=5')))
        assert.ok(errors.some((m) => m.includes('minLength=10 > maxLength=5')))
    })

    test('ловит required на отсутствующем поле', () => {
        const result = issuesOf({
            '/required': {
                properties: { a: { type: 'string' } },
                required: ['a', 'b'],
            },
        })
        assert.ok(byLevel(result, 'error').some((i) => i.message.includes('required field "b"')))
    })

    test('предупреждает о примерах, @cue и modificator', () => {
        const result = issuesOf({
            '/target': {
                patternProperties: {
                    '.*': { properties: { type: { type: 'string', enum: ['a', 'b'] } } },
                },
            },
            '/source': {
                patternProperties: {
                    '.*': {
                        properties: {
                            value: {
                                type: 'string',
                                pattern: '^a$',
                                patternExample: ['b'],
                                cue: ['+x', '/nope'],
                                modificator: [{ if: [{ missing: true }], then: { hidden: false } }],
                            },
                        },
                    },
                },
            },
        })
        const warnings = byLevel(result, 'warn').map((i) => i.message)
        assert.ok(warnings.some((m) => m.includes('patternExample "b" does not match')))
        assert.ok(warnings.some((m) => m.includes('cue source /nope: no such schema')))
        assert.ok(warnings.some((m) => m.includes('modificator condition "missing"')))
    })

    test('реальные схемы: известные ошибки и никаких новых', () => {
        const result = analyzeSchemas()
        const errors = byLevel(result, 'error')
            .map((i) => `${i.docPath}${i.location}  ${i.message}`)
            .sort()

        const known = [
            '/mobile/sms#/actions/send-sms/schema/properties/message  unknown type "text"',
            '/network/fdb#/patternProperties/.*/properties/mac  $ref: unknown pointer /definitions/mac in /defaults',
            '/tunnel/ipsec/connection#/patternProperties/.*  required field "ca" is not in properties',
            '/tunnel/ipsec/profile#/add/add/schema/properties/name  $ref: unknown pointer /definitions/name in /tunnel/ipsec/profile',
            '/tunnel/ipsec/proposal#/add/add/schema/properties/name  $ref: unknown pointer /definitions/name in /tunnel/ipsec/proposal',
        ].sort()

        assert.deepEqual(errors, known)
        assert.ok(result.docs.size >= 70)
    })
})
