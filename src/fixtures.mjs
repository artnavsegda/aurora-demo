import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

export const fixture = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'fixtures.json'), 'utf8'),
)

// Испытательные схемы (/test/...): подключаются только для тестового прогона,
// чтобы не появляться в обычном демо.
const testFixtureFile = path.join(root, 'fixtures', 'test-schemas.json')
const testFixture = process.env.DEMO_TEST_SCHEMAS === '1' && fs.existsSync(testFixtureFile)
    ? JSON.parse(fs.readFileSync(testFixtureFile, 'utf8'))
    : null

if (testFixture) {
    fixture.list = [...(fixture.list || []), ...(testFixture.list || [])]
    fixture.hidden = [...(fixture.hidden || []), ...(testFixture.hidden || [])]
    fixture.data = { ...(fixture.data || {}), ...(testFixture.data || {}) }
}

export const TEST_SCHEMAS_ENABLED = Boolean(testFixture)

export const HOSTNAME = fixture.hostname || 'R50-DEMO'
export const MODEL = fixture.model || 'R50'
export const SCHEMA_LIST = Array.isArray(fixture.list) ? fixture.list : []
export const SCHEMA_HIDDEN = Array.isArray(fixture.hidden) ? fixture.hidden : []
export const SCHEMA_PATHS = new Set([...SCHEMA_LIST, ...SCHEMA_HIDDEN])

// данные схемы: глубокая копия, чтобы сессии не делили объекты
export function cloneData(pathname) {
    const entry = fixture.data[pathname]
    if (!entry || !entry.get || typeof entry.get !== 'object')
        return {}
    return structuredClone(entry.get)
}

export function fixtureStatus(pathname, section) {
    const entry = fixture.data[pathname]
    if (!entry)
        return undefined

    if (section != null) {
        // в слепке записи лежат по ключу конфига; _section у фронта — тоже ключ
        if (entry.records && Object.prototype.hasOwnProperty.call(entry.records, section))
            return structuredClone(entry.records[section])

        // на всякий случай — по namesake
        const row = entry.get && entry.get[section]
        if (row) {
            const schema = schemaFor(pathname)
            const namesake = schema && schema.namesake
            if (namesake && row[namesake] != null) {
                for (const [key, rec] of Object.entries(entry.records || {})) {
                    if (entry.get[key] && String(entry.get[key][namesake]) === String(row[namesake]))
                        return structuredClone(rec)
                }
            }
            return undefined
        }
        return undefined
    }

    return entry.status === undefined || entry.status === null
        ? undefined
        : structuredClone(entry.status)
}

// ленивая загрузка схемы для метаданных (namesake, actions)
const schemaCache = new Map()
const testSchemasRoot = path.join(root, 'test-schemas')

export function schemaFor(pathname) {
    if (schemaCache.has(pathname))
        return schemaCache.get(pathname)

    let schema = null
    try {
        const file = pathname.startsWith('/test/')
            ? path.join(testSchemasRoot, pathname.slice('/test/'.length) + '.json')
            : path.join(root, 'schemas', pathname.replace(/^\//, '') + '.json')
        schema = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
        schema = null
    }
    schemaCache.set(pathname, schema)
    return schema
}

export function allPaths() {
    return Object.keys(fixture.data)
}
