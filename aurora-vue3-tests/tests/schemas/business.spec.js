import fs from 'node:fs'
import path from 'node:path'

import { shallowMount } from '@vue/test-utils'
import JSPointer from 'json-pointer'
import { createStore } from 'vuex'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { effectiveSchema, loadDocs, sectionProperties } from '../../../scripts/check-schemas.mjs'
import initialState from '@/store/state'
import getters from '@/store/getters'
import mutations from '@/store/mutations'
import Sch from '@/utils/schema'
import { validate } from '@/utils/validator'
import SectionOption from '@/components/SectionOption.vue'

const docs = loadDocs()
const fixtures = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'fixtures', 'fixtures.json'), 'utf8'))

const ACTION_KEYS = ['actions', 'add', 'apply', 'delete', 'clean', 'status', 'reorder']

function* walkSchema(node, ctx = {}) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
        return

    yield { node, ...ctx }

    if (node.properties) {
        for (const [name, child] of Object.entries(node.properties))
            yield* walkSchema(child, { ...ctx, location: `${ctx.location}/properties/${name}`, siblings: node.properties, key: name })
    }
    if (node.definitions) {
        for (const [name, child] of Object.entries(node.definitions))
            yield* walkSchema(child, { ...ctx, location: `${ctx.location}/definitions/${name}`, siblings: child.properties || {}, key: name })
    }
    if (node.patternProperties) {
        for (const [pattern, child] of Object.entries(node.patternProperties)) {
            if (pattern === 'actions')
                continue
            yield* walkSchema(child, { ...ctx, location: `${ctx.location}/patternProperties/${pattern}`, siblings: child.properties || {}, key: pattern })
        }
        for (const [name, action] of Object.entries(node.patternProperties.actions || {})) {
            if (action && action.schema)
                yield* walkSchema(action.schema, { ...ctx, location: `${ctx.location}/patternProperties/actions/${name}/schema`, siblings: action.schema.properties || {}, key: name })
        }
    }
    if (node.items)
        yield* walkSchema(node.items, { ...ctx, location: `${ctx.location}/items`, siblings: ctx.siblings, key: ctx.key })
    if (Array.isArray(node.modificator)) {
        for (const [idx, mod] of node.modificator.entries()) {
            if (mod && mod.then)
                yield* walkSchema(mod.then, { ...ctx, location: `${ctx.location}/modificator/${idx}/then`, siblings: ctx.siblings, key: ctx.key })
        }
    }
    for (const actionKey of ACTION_KEYS) {
        const action = node[actionKey]
        if (!action)
            continue
        const entries = actionKey === 'actions' ? Object.entries(action) : [[actionKey, action]]
        for (const [name, act] of entries) {
            if (act && act.schema)
                yield* walkSchema(act.schema, { ...ctx, location: `${ctx.location}/${actionKey}/${name}/schema`, siblings: act.schema.properties || {}, key: name })
        }
    }
}

function allNodes() {
    const out = []
    for (const [docPath, doc] of docs)
        out.push(...walkSchema(doc, { docPath, location: '#' }))
    return out
}

function validationSchema(node, docPath) {
    const schema = { ...effectiveSchema(node, docPath, docs) }
    delete schema.default
    delete schema.isRequired
    return schema
}

describe('схемы: бизнес-правила на реальных данных', () => {
    test('все enum и границы проходят через validate', () => {
        const problems = []
        const nodes = allNodes()

        for (const { node, docPath, location } of nodes) {
            const schema = validationSchema(node, docPath)
            const tag = `${docPath}${location}`

            if (Array.isArray(schema.enum) && schema.enum.length) {
                for (const value of schema.enum) {
                    let probe = value
                    if (schema.type === 'pair') {
                        const examples = Array.isArray(schema.patternExample) ? schema.patternExample : []
                        probe = examples.find((example) => String(example).startsWith(String(value) + '='))
                        if (probe === undefined && !schema.pattern)
                            probe = `${value}=1`
                        if (probe === undefined)
                            continue
                    }
                    if (!validate(schema, probe)[0])
                        problems.push(`${tag}: enum value ${JSON.stringify(value)} rejected`)
                }
                if (schema.strictEnum !== false && ['string', 'number', 'integer'].includes(schema.type)) {
                    const probe = schema.type === 'number' || schema.type === 'integer'
                        ? -987654321
                        : (schema.type === 'pair' ? '__not_in_enum__=1' : '__not_in_enum__')
                    if (validate(schema, probe)[0])
                        problems.push(`${tag}: non-enum value ${JSON.stringify(probe)} accepted`)
                }
            }

            if (['number', 'integer'].includes(schema.type)) {
                if (schema.minimum !== undefined) {
                    if (!validate(schema, schema.minimum)[0])
                        problems.push(`${tag}: minimum ${schema.minimum} rejected`)
                    if (validate(schema, schema.minimum - 1)[0])
                        problems.push(`${tag}: value below minimum accepted`)
                }
                if (schema.maximum !== undefined) {
                    if (!validate(schema, schema.maximum)[0])
                        problems.push(`${tag}: maximum ${schema.maximum} rejected`)
                    if (validate(schema, schema.maximum + 1)[0])
                        problems.push(`${tag}: value above maximum accepted`)
                }
            } else if (schema.type && !location.includes('/modificator/') &&
                (schema.minimum !== undefined || schema.maximum !== undefined)) {
                problems.push(`${tag}: minimum/maximum on type ${schema.type}`)
            }

            if (['string', 'password'].includes(schema.type)) {
                // при pattern длина проверяется на patternExample, а не на 'xxx'
                if (!schema.pattern && schema.minLength !== undefined) {
                    const value = 'x'.repeat(schema.minLength)
                    if (!validate(schema, value)[0])
                        problems.push(`${tag}: minLength ${schema.minLength} rejected`)
                }
                if (!schema.pattern && schema.maxLength !== undefined) {
                    const value = 'x'.repeat(schema.maxLength)
                    if (!validate(schema, value)[0])
                        problems.push(`${tag}: maxLength ${schema.maxLength} rejected`)
                }
            } else if (schema.type && !location.includes('/modificator/') &&
                (schema.minLength !== undefined || schema.maxLength !== undefined)) {
                problems.push(`${tag}: minLength/maxLength on type ${schema.type}`)
            }

            if (schema.pattern && Array.isArray(schema.patternExample)) {
                for (const example of schema.patternExample) {
                    if (!validate(schema, example)[0])
                        problems.push(`${tag}: patternExample ${JSON.stringify(example)} rejected`)
                }
            }
        }

        expect([...new Set(problems)].sort()).toEqual([
            '/ip/nhrp#/patternProperties/.*/properties/map/items: patternExample "10.0.1.101@133.94.75.36.14" rejected',
            '/network/qos/queue#/patternProperties/.*/properties/red-bandwidth: minimum/maximum on type string',
            '/service/dhcp/server#/patternProperties/.*/properties/option/items: patternExample "bootfile=image.bin" rejected',
            '/service/openvpn-server#/properties/push/items: patternExample "route-gateway=192.168.1.1" rejected',
            '/tunnel/l2tp-v3#/patternProperties/.*/properties/udp-dport: minimum/maximum on type string',
            '/tunnel/l2tp-v3#/patternProperties/.*/properties/udp-sport: minimum/maximum on type string',
        ])
    })

    test('Sch собирается для каждой схемы и каждого действия', () => {
        const problems = []
        for (const [docPath, doc] of docs) {
            let sch
            try {
                sch = new Sch(doc, docPath, () => Promise.resolve({ data: {} }))
            } catch (e) {
                problems.push(`${docPath}: constructor: ${e.message}`)
                continue
            }

            for (const name of Object.keys(doc.actions || {})) {
                if (!sch.actions[name])
                    problems.push(`${docPath}: no action ${name}`)
            }
            for (const name of ['apply', 'add', 'clean', 'status']) {
                if (doc[name] && !sch.actions[name])
                    problems.push(`${docPath}: no builtin action ${name}`)
            }
            if (doc.delete && typeof sch.delete !== 'function')
                problems.push(`${docPath}: no delete()`)
            if (doc.reorder && typeof sch.reorder !== 'function')
                problems.push(`${docPath}: no reorder()`)

            const section = doc.patternProperties && doc.patternProperties['.*']
            if (section) {
                try {
                    const data = fixtures.data[docPath] && fixtures.data[docPath].get
                    const keys = data && !Array.isArray(data) && typeof data === 'object' ? Object.keys(data) : []
                    const key = keys.find((k) => data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]))
                    if (!key && keys.length)
                        problems.push(`${docPath}: section schema but flat fixture data`)
                    if (key && data[key] && typeof data[key] === 'object')
                        sch.data[key] = JSON.parse(JSON.stringify(data[key]))
                    if (key && !sch.resolve(key))
                        problems.push(`${docPath}: resolve(${key}) returned nothing`)
                    if (sch.resolve('__unknown__') !== undefined)
                        problems.push(`${docPath}: resolve(unknown) is not undefined`)
                    sch.elements()
                    if (key)
                        sch.untraverse(key)
                } catch (e) {
                    problems.push(`${docPath}: section helpers: ${e.message}`)
                }
            }
        }
        expect(problems).toEqual([
            '/tunnel/wireguard/interface: section schema but flat fixture data',
        ])
    })

    test('SectionOption монтируется для каждого поля реальных схем', async () => {
        const state = JSON.parse(JSON.stringify(initialState))
        state.status = { model: undefined, interval: undefined }
        const store = createStore({
            state,
            mutations,
            getters,
            actions: {
                cueRequest: vi.fn(() => Promise.resolve({ data: { enum: [] } })),
            },
        })

        const schByPath = new Map()
        for (const [docPath, doc] of docs) {
            const sch = new Sch(doc, docPath, () => Promise.resolve({ data: {} }))
            schByPath.set(docPath, sch)
            JSPointer.set(store.state.schemas, docPath, sch)
        }

        const problems = []
        for (const [docPath, doc] of docs) {
            const sectionSchema = doc.patternProperties && doc.patternProperties['.*']
            const props = sectionSchema ? sectionSchema.properties || {} : doc.properties || {}
            const section = sectionSchema ? '__section__' : ''
            const fixture = fixtures.data[docPath] && fixtures.data[docPath].get
            const first = fixture && typeof fixture === 'object' && !Array.isArray(fixture)
                ? fixture[Object.keys(fixture)[0]]
                : undefined
            const values = sectionSchema
                ? (first && typeof first === 'object' ? first : {})
                : (fixture && typeof fixture === 'object' && !Array.isArray(fixture) ? fixture : {})

            for (const [name, schema] of Object.entries(props)) {
                let wrapper
                try {
                    wrapper = shallowMount(SectionOption, {
                        global: {
                            plugins: [store],
                            mocks: { $route: { path: docPath }, $router: { push: vi.fn() } },
                        },
                        props: {
                            schema,
                            values,
                            property_name: name,
                            path: docPath.split('/').filter(Boolean),
                            section,
                            definitions: doc.definitions || {},
                            isRequired: Boolean(sectionSchema && sectionSchema.required && sectionSchema.required.includes(name) && schema.hidden !== true),
                        },
                    })

                    if (!wrapper.vm.type)
                        problems.push(`${docPath}/${name}: no component type`)
                    const rSchema = wrapper.vm.rSchema
                    if (rSchema && rSchema.$ref)
                        problems.push(`${docPath}/${name}: unresolved $ref ${rSchema.$ref}`)
                    wrapper.vm.check_valid(values[name])
                } catch (e) {
                    problems.push(`${docPath}/${name}: ${e.message}`)
                } finally {
                    if (wrapper)
                        wrapper.unmount()
                }
            }
        }

        expect(problems).toEqual([])
    })
})
