import { SCHEMA_PATHS, SCHEMA_LIST, schemaFor } from './fixtures.mjs'

function partsOf(value) {
    return String(value || '').split('/').filter(Boolean)
}

// самый длинный префикс пути, для которого есть схема
export function splitSchemaPath(value) {
    const parts = partsOf(value)
    for (let i = parts.length; i > 0; i--) {
        const p = '/' + parts.slice(0, i).join('/')
        if (SCHEMA_PATHS.has(p))
            return { schema: p, rest: parts.slice(i) }
    }
    return { schema: '/' + parts.join('/'), rest: [] }
}

function parseFilters(text) {
    const filters = {}
    for (const part of String(text || '').split(';')) {
        if (!part)
            continue
        const i = part.indexOf(':')
        if (i < 0)
            continue
        filters[part.slice(0, i).trim()] = part.slice(i + 1).split(',').map((v) => v.trim())
    }
    return filters
}

function matches(row, filters, schema) {
    const props = schema && schema.patternProperties
        ? (schema.patternProperties['.*'] || {}).properties
        : undefined

    for (const [key, values] of Object.entries(filters)) {
        let raw = row[key]
        if ((raw == null || raw === '') && props && props[key] && props[key].default != null)
            raw = props[key].default
        const actual = raw == null ? '' : String(raw)
        const positive = values.filter((v) => !v.startsWith('!'))
        const negative = values.filter((v) => v.startsWith('!')).map((v) => v.slice(1))
        const nonEmpty = positive.includes('')
        if (nonEmpty) {
            if (actual === '')
                return false
        } else if (positive.length && !positive.includes(actual)) {
            return false
        }
        if (negative.some((v) => v !== '' && v === actual))
            return false
        if (negative.includes('') && actual !== '')
            return false
    }
    return true
}

function pushValue(out, value) {
    if (value == null || value === '')
        return
    if (Array.isArray(value))
        out.push(...value.map(String))
    else
        out.push(String(value))
}

// подсказки прод-horizont: +value, $option текущей записи, /schema[фильтр],
// /defaults/option и специальный /defaults/schemas
export function cue(session, rawPath, sources) {
    const { schema: schemaPath, rest } = splitSchemaPath(rawPath)
    const section = rest[0]
    const out = []

    for (const source of Array.isArray(sources) ? sources : []) {
        if (typeof source !== 'string' || !source)
            continue

        if (source === '/defaults/schemas') {
            out.push(...SCHEMA_LIST)
            continue
        }

        if (source[0] === '+') {
            out.push(source.slice(1))
            continue
        }

        if (source[0] === '$') {
            const option = source.slice(1)
            const data = session.get(schemaPath)
            const row = section ? data[section] : data
            if (row && typeof row === 'object')
                pushValue(out, row[option])
            continue
        }

        const m = source.match(/^([^[]+)(?:\[(.*)\])?$/)
        if (!m)
            continue

        const sourcePath = '/' + partsOf(m[1]).join('/')
        const filters = parseFilters(m[2])

        if (SCHEMA_PATHS.has(sourcePath)) {
            const schema = schemaFor(sourcePath)
            const data = session.get(sourcePath)
            if (!schema || !data || typeof data !== 'object')
                continue

            if (schema.patternProperties) {
                for (const [key, row] of Object.entries(data)) {
                    if (!row || typeof row !== 'object')
                        continue
                    if (!matches(row, filters, schema))
                        continue
                    const name = schema.namesake && row[schema.namesake] != null
                        ? row[schema.namesake]
                        : key
                    pushValue(out, name)
                }
            }
            continue
        }

        // путь внутри схемы: /defaults/ether_port_speed
        const inner = splitSchemaPath(sourcePath)
        if (!inner.schema || !SCHEMA_PATHS.has(inner.schema))
            continue

        const data = session.get(inner.schema)
        const schema = schemaFor(inner.schema)
        if (!data || typeof data !== 'object')
            continue

        if (inner.rest.length === 1 && data[inner.rest[0]] != null) {
            pushValue(out, data[inner.rest[0]])
        } else if (inner.rest.length > 1 && data[inner.rest[0]]) {
            pushValue(out, data[inner.rest[0]][inner.rest[1]])
        } else if (!schema || !schema.patternProperties) {
            pushValue(out, data[inner.rest.join('/')])
        }
    }

    return { enum: [...new Set(out.map(String))].sort() }
}
