import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { loadDocs } from '../scripts/check-schemas.mjs'
import { cue } from '../src/cue.mjs'
import { SessionStore } from '../src/session.mjs'

const docs = loadDocs()
const sessions = new SessionStore()
const session = sessions.create('cue-schemas')

const ACTION_KEYS = ['actions', 'add', 'apply', 'delete', 'clean', 'status', 'reorder']

function* walk(node, ctx = {}) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
        return
    yield { node, ...ctx }

    if (node.properties) {
        for (const [name, child] of Object.entries(node.properties))
            yield* walk(child, { ...ctx, location: `${ctx.location}/properties/${name}`, siblings: node.properties })
    }
    if (node.definitions) {
        for (const [name, child] of Object.entries(node.definitions))
            yield* walk(child, { ...ctx, location: `${ctx.location}/definitions/${name}`, siblings: child.properties || {} })
    }
    if (node.patternProperties) {
        for (const [pattern, child] of Object.entries(node.patternProperties)) {
            if (pattern === 'actions')
                continue
            yield* walk(child, { ...ctx, location: `${ctx.location}/patternProperties/${pattern}`, siblings: child.properties || {} })
        }
        for (const [name, action] of Object.entries(node.patternProperties.actions || {})) {
            if (action && action.schema)
                yield* walk(action.schema, { ...ctx, location: `${ctx.location}/patternProperties/actions/${name}/schema` })
        }
    }
    if (node.items)
        yield* walk(node.items, { ...ctx, location: `${ctx.location}/items` })
    if (Array.isArray(node.modificator)) {
        for (const [idx, mod] of node.modificator.entries()) {
            if (mod && mod.then)
                yield* walk(mod.then, { ...ctx, location: `${ctx.location}/modificator/${idx}/then` })
        }
    }
    for (const actionKey of ACTION_KEYS) {
        const action = node[actionKey]
        if (!action)
            continue
        const entries = actionKey === 'actions' ? Object.entries(action) : [[actionKey, action]]
        for (const [name, act] of entries) {
            if (act && act.schema)
                yield* walk(act.schema, { ...ctx, location: `${ctx.location}/${actionKey}/${name}/schema` })
        }
    }
}

function cueNodes() {
    const out = []
    for (const [docPath, doc] of docs) {
        for (const { node, location, siblings } of walk(doc, { docPath, location: '#', siblings: {} })) {
            if (!Array.isArray(node.cue))
                continue
            for (const source of node.cue)
                out.push({ docPath, location, source, siblings })
        }
    }
    return out
}

describe('@cue на всех источниках реальных схем', () => {
    test('каждый +литерал возвращается как есть', () => {
        const literals = cueNodes().filter((n) => n.source[0] === '+')
        assert.ok(literals.length > 0)
        for (const { docPath, location, source } of literals) {
            const result = cue(session, docPath, [source])
            assert.deepEqual(result.enum, [source.slice(1)], `${docPath}${location} ${source}`)
        }
    })

    test('все $поля и /пути отрабатывают без исключений', () => {
        const problems = []
        for (const { docPath, location, source, siblings } of cueNodes()) {
            // $field должен быть среди соседних полей; иначе UI не найдёт значение
            if (source[0] === '$') {
                const field = source.slice(1)
                if (siblings && !Object.prototype.hasOwnProperty.call(siblings, field))
                    problems.push(`${docPath}${location}: $${field} is not a sibling field`)
            }

            try {
                const result = cue(session, docPath, [source])
                if (!Array.isArray(result.enum))
                    problems.push(`${docPath}${location}: ${source} returned no enum`)
            } catch (e) {
                problems.push(`${docPath}${location}: ${source} threw ${e.message}`)
            }
        }
        assert.deepEqual(problems, [])
    })

    test('источники /defaults и /schema заполняются из фикстур', () => {
        const result = cue(session, '/firewall/filter/eb08bf27f', ['/defaults/server', '/ip/interface'])
        assert.ok(result.enum.includes('ovpnserver'))
        assert.ok(result.enum.includes('bridge0'))

        const filtered = cue(session, '/firewall/filter/eb08bf27f', ['/firewall/zone[type:address]'])
        assert.deepEqual(filtered.enum, ['banned'])
    })

    test('неизвестный путь @cue не роняет и не возвращает мусор', () => {
        assert.deepEqual(cue(session, '/tools', ['/no/such/schema']).enum, [])
    })
})
