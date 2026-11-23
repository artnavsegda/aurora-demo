#!/usr/bin/env node
// Статическая проверка схем Aurora. Ищет ошибки, из-за которых форма
// рендерится/валидируется не так, как ожидает клиент: битые $ref и regexp,
// required на отсутствующих полях, противоречивые границы, неизвестные
// источники @cue и условия modificator.
//
// Запуск:
//   node scripts/check-schemas.mjs
//   node scripts/check-schemas.mjs --json
//   node scripts/check-schemas.mjs --warnings
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const schemasRoot = path.join(here, '..', 'schemas')

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const showWarnings = args.has('--warnings') || args.has('--all')
const showInfo = args.has('--all')

const issues = []

function add(level, docPath, location, message) {
    issues.push({ level, docPath, location, message })
}

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

function loadDocs(root = schemasRoot) {
    const docs = new Map()
    for (const file of walkFiles(root)) {
        const rel = path.relative(root, file).replace(/\\/g, '/')
        const docPath = '/' + rel.slice(0, -'.json'.length)
        try {
            docs.set(docPath, JSON.parse(fs.readFileSync(file, 'utf8')))
        } catch (e) {
            add('error', docPath, '#', 'invalid JSON: ' + e.message)
        }
    }
    return docs
}

// password — прикладной тип TextElement (input type=password), остальные — JSON Schema
const SCHEMA_TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array', 'pair', 'password'])

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

function resolveRef(ref, docPath, docs) {
    const hash = ref.indexOf('#')
    const pathPart = hash < 0 ? ref : ref.slice(0, hash)
    const fragment = hash < 0 ? '' : ref.slice(hash + 1)
    const targetPath = pathPart ? '/' + pathPart.replace(/^\/+/, '').replace(/^schemas\//, '') : docPath
    const target = docs.get(targetPath)
    if (!target)
        return { error: `unknown schema ${targetPath}` }
    if (!fragment)
        return { target, targetPath }
    const node = pointerGet(target, fragment)
    if (node === undefined)
        return { error: `unknown pointer ${fragment} in ${targetPath}` }
    return { target: node, targetPath }
}

function effectiveSchema(node, docPath, docs, seen = new Set()) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
        return node

    let out = { ...node }
    if (typeof node.$ref === 'string' && !seen.has(node.$ref)) {
        const resolved = resolveRef(node.$ref, docPath, docs)
        if (resolved.target && typeof resolved.target === 'object' && !Array.isArray(resolved.target)) {
            const base = effectiveSchema(resolved.target, resolved.targetPath, docs, new Set([...seen, node.$ref]))
            out = { ...base, ...node }
        }
    }
    return out
}

function sectionProperties(doc) {
    if (doc.patternProperties && doc.patternProperties['.*'])
        return doc.patternProperties['.*'].properties || {}
    return doc.properties || {}
}

function propExists(props, name) {
    return !!props && Object.prototype.hasOwnProperty.call(props, name)
}

function parseCueSource(source) {
    const m = source.match(/^([^[]+)(?:\[(.*)\])?$/)
    if (!m)
        return null
    const base = '/' + m[1].split('/').filter(Boolean).join('/')
    const filters = []
    if (m[2]) {
        for (const part of m[2].split(';')) {
            const i = part.indexOf(':')
            if (i < 0) {
                filters.push({ key: part.trim(), bad: true })
                continue
            }
            filters.push({ key: part.slice(0, i).trim(), value: part.slice(i + 1).trim() })
        }
    }
    return { base, filters }
}

function checkPattern(value, pattern) {
    const v = String(value)
    const re = new RegExp(pattern)
    // клиент разрешает инверсию через ведущий '!'
    return re.test(v[0] === '!' ? v.slice(1) : v)
}

function checkSchemaNode(node, ctx) {
    if (!node || typeof node !== 'object' || Array.isArray(node))
        return

    const { docs, docPath, location, siblings, parent, key } = ctx
    const at = (suffix = '') => location + suffix
    // $ref подмешивает поля из definitions, как refProcess в клиенте
    const eff = effectiveSchema(node, docPath, docs)

    if (node.$ref !== undefined) {
        if (typeof node.$ref !== 'string')
            add('error', docPath, at(), '$ref must be a string')
        else if (resolveRef(node.$ref, docPath, docs).error)
            add('error', docPath, at(), `$ref: ${resolveRef(node.$ref, docPath, docs).error}`)
    }

    if (eff.type !== undefined && !SCHEMA_TYPES.has(eff.type)) {
        // type может быть объектом только в modificator.if; в самом узле схемы это ошибка
        if (typeof eff.type === 'string')
            add('error', docPath, at(), `unknown type ${JSON.stringify(eff.type)}`)
        else
            add('error', docPath, at(), `type must be a string, got ${typeof eff.type}`)
    }

    if (Array.isArray(eff.required)) {
        const props = eff.properties || {}
        for (const name of eff.required) {
            if (!propExists(props, name))
                add('error', docPath, at(), `required field "${name}" is not in properties`)
            else if (props[name] && props[name].hidden === true && !props[name].modificator)
                add('info', docPath, at(), `required field "${name}" is hidden without a modificator (hidden required is ignored)`)
        }
    } else if (eff.required !== undefined) {
        add('warn', docPath, at(), `required must be an array of field names, got ${typeof eff.required}`)
    }

    if (eff.type === 'array') {
        if (eff.items === undefined)
            add('info', docPath, at(), 'array without items (may be filled by modificator)')
        else if (typeof eff.items !== 'object' || Array.isArray(eff.items))
            add('error', docPath, at(), 'items must be a schema object')
    }

    for (const [minKey, maxKey, kind] of [
        ['minimum', 'maximum', 'number'],
        ['minLength', 'maxLength', 'string'],
    ]) {
        const min = eff[minKey]
        const max = eff[maxKey]
        if (min !== undefined && (typeof min !== 'number' || Number.isNaN(min)))
            add('error', docPath, at(), `${minKey} must be a number`)
        if (max !== undefined && (typeof max !== 'number' || Number.isNaN(max)))
            add('error', docPath, at(), `${maxKey} must be a number`)
        if (typeof min === 'number' && typeof max === 'number' && min > max)
            add('error', docPath, at(), `${minKey}=${min} > ${maxKey}=${max}`)
        if ((min !== undefined || max !== undefined) && eff.type) {
            if ((minKey === 'minLength' || maxKey === 'maxLength') && !['string', 'password'].includes(eff.type))
                add('warn', docPath, at(), `${minKey}/${maxKey} on type ${eff.type}`)
            if ((minKey === 'minimum' || maxKey === 'maximum') && !['number', 'integer'].includes(eff.type))
                add('warn', docPath, at(), `${minKey}/${maxKey} on type ${eff.type}`)
        }
    }

    if (eff.pattern !== undefined) {
        if (typeof eff.pattern !== 'string')
            add('error', docPath, at(), 'pattern must be a string')
        else {
            try {
                // eslint-disable-next-line no-new
                new RegExp(eff.pattern)
            } catch (e) {
                add('error', docPath, at(), `invalid regexp: ${e.message}`)
            }
            if (Array.isArray(eff.patternExample)) {
                for (const example of eff.patternExample) {
                    try {
                        if (!checkPattern(example, eff.pattern))
                            add('warn', docPath, at(), `patternExample ${JSON.stringify(example)} does not match pattern`)
                    } catch (e) { /* invalid pattern already reported */ }
                }
            }
            if (eff.default !== undefined && eff.default !== '') {
                try {
                    if (!checkPattern(eff.default, eff.pattern))
                        add('warn', docPath, at(), `default ${JSON.stringify(eff.default)} does not match pattern`)
                } catch (e) { /* invalid pattern already reported */ }
            }
        }
        if (eff.patternDescription === undefined)
            add('info', docPath, at(), 'pattern without patternDescription')
    } else {
        if (eff.patternDescription !== undefined)
            add('warn', docPath, at(), 'patternDescription without pattern')
        if (eff.patternExample !== undefined)
            add('warn', docPath, at(), 'patternExample without pattern')
    }

    if (eff.enum !== undefined) {
        if (!Array.isArray(eff.enum)) {
            add('error', docPath, at(), 'enum must be an array')
        } else {
            const seen = new Set()
            for (const value of eff.enum) {
                const key = String(value)
                if (seen.has(key))
                    add('warn', docPath, at(), `duplicate enum value ${JSON.stringify(value)}`)
                seen.add(key)
                if (['number', 'integer'].includes(eff.type) && typeof value !== 'number')
                    add('warn', docPath, at(), `enum value ${JSON.stringify(value)} is not a number`)
                if (eff.type === 'boolean' && typeof value !== 'boolean')
                    add('warn', docPath, at(), `enum value ${JSON.stringify(value)} is not a boolean`)
            }
            if (eff.enum.length === 0 && !eff.cue)
                add('info', docPath, at(), 'empty enum without cue (may be display-only)')
        }
    }

    if (Array.isArray(node.cue)) {
        for (const source of node.cue) {
            if (typeof source !== 'string' || !source) {
                add('warn', docPath, at(), 'cue source must be a non-empty string')
                continue
            }
            if (source[0] === '+')
                continue
            if (source[0] === '$') {
                const option = source.slice(1)
                if (siblings && !propExists(siblings, option))
                    add('warn', docPath, at(), `cue depends on unknown field "$${option}"`)
                continue
            }
            const parsed = parseCueSource(source)
            if (!parsed) {
                add('warn', docPath, at(), `cannot parse cue source ${JSON.stringify(source)}`)
                continue
            }
            for (const filter of parsed.filters) {
                if (filter.bad)
                    add('warn', docPath, at(), `cue filter without ":" in ${JSON.stringify(source)}`)
            }

            if (parsed.base.startsWith('/defaults/')) {
                const defaults = docs.get('/defaults')
                const rest = parsed.base.split('/').filter(Boolean).slice(1)
                if (!defaults) {
                    add('error', docPath, at(), `cue source ${parsed.base}: no /defaults schema`)
                } else if (rest.length) {
                    const node2 = pointerGet(defaults, 'properties/' + rest.join('/'))
                    if (node2 === undefined)
                        add('warn', docPath, at(), `cue source ${parsed.base}: unknown defaults field`)
                }
                continue
            }

            const sourceDoc = docs.get(parsed.base)
            if (!sourceDoc) {
                add('warn', docPath, at(), `cue source ${parsed.base}: no such schema`)
                continue
            }
            const props = sectionProperties(sourceDoc)
            for (const filter of parsed.filters) {
                if (!filter.bad && !propExists(props, filter.key))
                    add('warn', docPath, at(), `cue source ${parsed.base}: filter field "${filter.key}" is not in the schema`)
            }
        }
    }

    if (Array.isArray(node.modificator)) {
        for (const [idx, mod] of node.modificator.entries()) {
            if (!mod || typeof mod !== 'object' || !Array.isArray(mod.if) || !mod.if.length)
                add('warn', docPath, at(), `modificator[${idx}] has empty or invalid if`)
            if (mod && mod.if) {
                for (const cond of mod.if) {
                    for (const condKey of Object.keys(cond || {})) {
                        if (condKey[0] === '/') {
                            const refPath = '/' + condKey.replace(/^\/+/, '').replace(/^schemas\//, '')
                            if (refPath.startsWith('/defaults/')) {
                                const defaults = docs.get('/defaults')
                                const rest = refPath.split('/').filter(Boolean).slice(1)
                                if (!defaults || (rest.length && pointerGet(defaults, 'properties/' + rest.join('/')) === undefined))
                                    add('warn', docPath, at(), `modificator condition ${condKey}: unknown defaults field`)
                            } else if (!docs.has(refPath)) {
                                add('warn', docPath, at(), `modificator condition ${condKey}: no such schema`)
                            }
                        } else if (siblings && !propExists(siblings, condKey)) {
                            add('warn', docPath, at(), `modificator condition "${condKey}" is not a sibling field`)
                        }
                    }
                }
            }
            if (mod && mod.then)
                checkSchemaNode(mod.then, { ...ctx, location: at(`/modificator/${idx}/then`), siblings, parent: node, key })
        }
    }

    if (node.properties) {
        for (const [name, child] of Object.entries(node.properties)) {
            checkSchemaNode(child, {
                ...ctx,
                location: at('/properties/' + name),
                siblings: node.properties,
                parent: node,
                key: name,
            })
        }
    }

    if (node.definitions) {
        for (const [name, child] of Object.entries(node.definitions)) {
            checkSchemaNode(child, {
                ...ctx,
                location: at('/definitions/' + name),
                siblings: child.properties || {},
                parent: node,
                key: name,
            })
        }
    }

    if (node.patternProperties) {
        for (const [pattern, child] of Object.entries(node.patternProperties)) {
            if (pattern === 'actions')
                continue
            checkSchemaNode(child, {
                ...ctx,
                location: at('/patternProperties/' + pattern),
                siblings: child.properties || {},
                parent: node,
                key: pattern,
            })
        }
    }

    if (node.items)
        checkSchemaNode(node.items, { ...ctx, location: at('/items'), siblings, parent: node, key })

    for (const actionKey of ['actions', 'add', 'apply', 'delete', 'clean', 'status', 'reorder']) {
        const action = node[actionKey]
        if (!action)
            continue
        const entries = actionKey === 'actions'
            ? Object.entries(action).map(([name, a]) => [name, a])
            : [[actionKey, action]]
        for (const [name, act] of entries) {
            if (act && act.schema) {
                checkSchemaNode(act.schema, {
                    ...ctx,
                    location: at(`/${actionKey}/${name}/schema`),
                    siblings: act.schema.properties || {},
                    parent: act,
                    key: name,
                })
            }
        }
    }

    if (node.patternProperties && node.patternProperties.actions) {
        for (const [name, act] of Object.entries(node.patternProperties.actions)) {
            if (act && act.schema) {
                checkSchemaNode(act.schema, {
                    ...ctx,
                    location: at(`/patternProperties/actions/${name}/schema`),
                    siblings: act.schema.properties || {},
                    parent: act,
                    key: name,
                })
            }
        }
    }

    // showParams/namesake относятся к корню документа, но проверяем их
    // для любой секции с properties — так ловятся копии в действиях.
    if (node.showParams) {
        // showParams корня описывают не properties корня, а секции
        const props = (node.patternProperties && node.patternProperties['.*'] && node.patternProperties['.*'].properties) ||
            node.properties || {}
        const special = new Set(['name', 'state'])
        for (const name of node.showParams) {
            if (!special.has(name) && !propExists(props, name))
                add('info', docPath, at(), `showParams field "${name}" is not in properties (may be a status column)`)
        }
    }
    if (node.namesake && node.namesake !== '.index' && node.namesake !== '_index') {
        const props = (node.patternProperties && node.patternProperties['.*'] && node.patternProperties['.*'].properties) ||
            node.properties || {}
        if (!propExists(props, node.namesake))
            add('info', docPath, at(), `namesake "${node.namesake}" is not in properties (may come from status)`)
    }
}

export function analyzeSchemas({ root = schemasRoot } = {}) {
    issues.length = 0
    const docs = loadDocs(root)
    for (const [docPath, doc] of docs) {
        checkSchemaNode(doc, {
            docs,
            docPath,
            location: '#',
            siblings: sectionProperties(doc),
            parent: null,
            key: null,
        })
    }

    const byLevel = { error: 0, warn: 0, info: 0 }
    for (const issue of issues)
        byLevel[issue.level] = (byLevel[issue.level] || 0) + 1

    return { docs, issues: [...issues], counts: byLevel }
}

function main() {
    const { docs, issues, counts: byLevel } = analyzeSchemas()

    if (asJson) {
        console.log(JSON.stringify({ docs: docs.size, counts: byLevel, issues }, null, 2))
        process.exitCode = byLevel.error ? 1 : 0
        return
    }

    const levels = showInfo ? ['error', 'warn', 'info'] : (showWarnings ? ['error', 'warn'] : ['error'])
    for (const level of levels) {
        const list = issues.filter((i) => i.level === level)
        if (!list.length)
            continue
        console.log(`\n${level.toUpperCase()} (${list.length})`)
        for (const issue of list)
            console.log(`  ${issue.docPath}${issue.location}  ${issue.message}`)
    }

    console.log(`\nСхем: ${docs.size}; ошибок: ${byLevel.error}, предупреждений: ${byLevel.warn}, заметок: ${byLevel.info}`)
    process.exitCode = byLevel.error ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main()

export { loadDocs, resolveRef, effectiveSchema, sectionProperties }
