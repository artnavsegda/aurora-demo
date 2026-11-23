import fs from 'node:fs'
import path from 'node:path'

import Vue from 'vue'
import Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'
import JSPointer from 'vue-json-pointer'

import initialState from '@/store/state'
import getters from '@/store/getters'
import mutations from '@/store/mutations'
import Sch from '@/utils/schema'
import { validate } from '@/utils/validator'
import SectionOption from '@/components/SectionOption.vue'

Vue.use(Vuex)

const docs = loadDocs()
const fixtures = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'fixtures', 'fixtures.json'), 'utf8'))

const ACTION_KEYS = ['actions', 'add', 'apply', 'delete', 'clean', 'status', 'reorder']

function walkFiles(dir) {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory())
            out.push(...walkFiles(full))
        else if (entry.isFile() && entry.name.endsWith('.json'))
            out.push(full)
    }
    return out
}

function loadDocs() {
    const root = path.resolve(process.cwd(), '..', 'schemas')
    const map = new Map()
    for (const file of walkFiles(root)) {
        const rel = path.relative(root, file).replace(/\\/g, '/')
        map.set('/' + rel.slice(0, -'.json'.length), JSON.parse(fs.readFileSync(file, 'utf8')))
    }
    return map
}

function sectionProperties(doc) {
    if (doc.patternProperties && doc.patternProperties['.*'])
        return doc.patternProperties['.*'].properties || {}
    return doc.properties || {}
}

function pointerGet(doc, fragment) {
    const parts = fragment.split('/').filter(Boolean)
        .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    let node = doc
    for (const part of parts) {
        if (node == null || typeof node !== 'object' || !(part in node))
            return undefined
        node = node[part]
    }
    return node
}

function effectiveSchema(node, docPath) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
        return node
    if (typeof node.$ref !== 'string')
        return node

    const hash = node.$ref.indexOf('#')
    const pathPart = hash < 0 ? node.$ref : node.$ref.slice(0, hash)
    const fragment = hash < 0 ? '' : node.$ref.slice(hash + 1)
    const targetPath = pathPart ? '/' + pathPart.replace(/^\/+/, '') : docPath
    const target = docs.get(targetPath)
    if (!target)
        return node
    const base = fragment ? pointerGet(target, fragment) : target
    if (!base || typeof base !== 'object')
        return node
    return { ...effectiveSchema(base, targetPath), ...node }
}

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
    const schema = { ...effectiveSchema(node, docPath) }
    delete schema.default
    delete schema.isRequired
    return schema
}

describe('схемы: бизнес-правила на реальных данных (Vue 2)', () => {
    test('все enum и границы проходят через validate', () => {
        const problems = []
        for (const { node, docPath, location } of allNodes()) {
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
                        : '__not_in_enum__'
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
                    if (key)
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

    test('данные фикстур проходят validate (Vue 2)', () => {
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
                    const schema = effectiveSchema(raw, docPath)
                    delete schema.$ref
                    if (schema.$ref || schema.readOnly === true)
                        continue
                    if (schema.type === 'array' && schema.items === undefined)
                        continue
                    if (Array.isArray(schema.enum) && schema.enum.length === 0)
                        continue
                    if (schema.items && Array.isArray(schema.items.enum) && schema.items.enum.length === 0)
                        continue
                    const isRequired = required.includes(name) && schema.hidden !== true && schema.readOnly !== true
                    if (row[name] === undefined) {
                        if (isRequired)
                            problems.push(`${docPath}${rowKey ? '/' + rowKey : ''}/${name}: required but missing`)
                        continue
                    }
                    const [ok, err] = validate({ ...schema, isRequired }, row[name])
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

    test('SectionOption монтируется для каждого поля реальных схем (Vue 2)', () => {
        const state = JSON.parse(JSON.stringify(initialState))
        state.status = { model: undefined, interval: undefined }
        const store = new Vuex.Store({
            state,
            mutations,
            getters,
            actions: {
                cueRequest: jest.fn(() => Promise.resolve({ data: { enum: [] } })),
            },
        })

        for (const [docPath, doc] of docs)
            JSPointer.set(store.state.schemas, docPath, new Sch(doc, docPath, () => Promise.resolve({ data: {} })))

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
                        store,
                        propsData: {
                            schema,
                            values,
                            property_name: name,
                            path: docPath.split('/').filter(Boolean),
                            section,
                            definitions: doc.definitions || {},
                            isRequired: Boolean(sectionSchema && sectionSchema.required && sectionSchema.required.includes(name) && schema.hidden !== true),
                        },
                        mocks: { $route: { path: docPath }, $router: { push: jest.fn() } },
                    })

                    if (!wrapper.vm.type)
                        problems.push(`${docPath}/${name}: no component type`)
                    wrapper.vm.check_valid(values[name])
                } catch (e) {
                    problems.push(`${docPath}/${name}: ${e.message}`)
                } finally {
                    if (wrapper)
                        wrapper.destroy()
                }
            }
        }

        expect(problems).toEqual([])
    })
})
