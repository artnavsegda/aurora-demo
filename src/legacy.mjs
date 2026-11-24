import {
    HOSTNAME, MODEL, SCHEMA_HIDDEN, SCHEMA_LIST, SCHEMA_PATHS,
    fixture, fixtureStatus, schemaFor,
} from './fixtures.mjs'
import { cue } from './cue.mjs'
import { board, dashboard } from './dashboard.mjs'
import { journalStream } from './journal.mjs'

const MAX_LAST = 200

function plain(reply, code, text) {
    reply.code(code).type('text/plain; charset=utf-8').send(text)
}

function json(reply, value, code = 200) {
    reply.code(code).type('application/json; charset=utf-8').send(value)
}

function normalize(value) {
    return '/' + String(value || '').split('/').filter(Boolean).join('/')
}

function tokenOf(request, body) {
    return body?.token ||
        request.headers.token ||
        request.headers.Token ||
        request.headers['x-token']
}

function cleanValues(data) {
    const out = { ...(data || {}) }
    delete out._section
    delete out._options
    delete out._title
    delete out._option
    delete out._value
    return out
}

function findKey(schema, data, section) {
    if (section == null || section === '')
        return undefined
    const key = String(section)
    if (Object.prototype.hasOwnProperty.call(data, key))
        return key

    const namesake = schema && schema.namesake
    for (const [k, row] of Object.entries(data)) {
        if (!row || typeof row !== 'object')
            continue
        if (namesake && String(row[namesake]) === key)
            return k
        // запасной вариант: у записей есть .name/name
        if (String(row['.name']) === key || String(row.name) === key)
            return k
    }
    return undefined
}

function nextIndex(data) {
    let n = 0
    for (const [k, row] of Object.entries(data)) {
        const idx = Number((row && row['.index']) ?? (row && row._index) ?? k)
        if (Number.isFinite(idx))
            n = Math.max(n, idx + 1)
    }
    return n
}

function uniqueKey(data, base) {
    if (!data[base])
        return base
    let i = 2
    while (data[`${base}-${i}`])
        i++
    return `${base}-${i}`
}

function nextKey(schema, data, values) {
    const namesake = schema && schema.namesake
    const n = nextIndex(data)

    if (namesake === '.index') {
        values['.index'] = n
        return uniqueKey(data, String(n))
    }

    if (namesake === '_index') {
        values._index = n
        return uniqueKey(data, `cfg${String(n + 1).padStart(2, '0')}`)
    }

    if (namesake && values[namesake] != null && values[namesake] !== '') {
        const key = uniqueKey(data, String(values[namesake]))
        values[namesake] = key
        return key
    }

    const key = uniqueKey(data, `cfg${String(n).padStart(2, '0')}`)
    if (namesake)
        values[namesake] = key
    return key
}

function setOption(session, schema, path, data) {
    const state = session.get(path)
    if (!state || typeof state !== 'object')
        return {}

    const section = data && data._section
    const option = data && data._option
    const value = data && data._value

    if (!option)
        return {}

    if (section != null && section !== '') {
        const key = findKey(schema, state, section)
        if (!key)
            return {}
        state[key] = { ...(state[key] || {}), [option]: value }
    } else {
        state[option] = value
    }

    return {}
}

function addRecord(session, schema, path, data) {
    const state = session.get(path)
    if (!state || typeof state !== 'object')
        return {}

    const values = cleanValues(data)
    const key = nextKey(schema, state, values)

    if (schema && schema.namesake && schema.namesake !== '.index' && schema.namesake !== '_index')
        values[schema.namesake] = values[schema.namesake] ?? key

    if (values['.name'] == null && schema && schema.namesake !== '.index')
        values['.name'] = key

    state[key] = values
    return { [key]: values }
}

function deleteRecord(session, schema, path, data) {
    const state = session.get(path)
    if (!state || typeof state !== 'object')
        return {}

    const section = data && data._section
    const key = findKey(schema, state, section)
    if (key)
        delete state[key]
    return {}
}

function cleanRecords(session, path) {
    if (SCHEMA_PATHS.has(path))
        session.set(path, {})
    return {}
}

function reorder(session, schema, path, data) {
    const state = session.get(path)
    if (!state || typeof state !== 'object')
        return {}

    const section = data && (data._section ?? data.name)
    const position = Number(data && data.position)
    const key = findKey(schema, state, section)
    if (!key || !Number.isFinite(position))
        return {}

    const entries = Object.entries(state)
    const idx = entries.findIndex(([k]) => k === key)
    if (idx < 0)
        return {}

    const [entry] = entries.splice(idx, 1)
    entries.splice(Math.max(0, Math.min(position, entries.length)), 0, entry)

    const out = {}
    entries.forEach(([k, row], i) => {
        if (row && typeof row === 'object' && row._index != null)
            row._index = i
        out[k] = row
    })
    session.set(path, out)
    return {}
}

function stateWord(row) {
    if (!row || typeof row !== 'object')
        return 4
    if (typeof row._state === 'number')
        return row._state
    if (typeof row.state === 'number')
        return row.state
    const disabled = row.disabled
    let state = 4
    if (['1', 1, true, 'true'].includes(disabled))
        state |= 2
    return state
}

function generatedStatus(session, schema, path) {
    const data = session.get(path)
    if (!data || typeof data !== 'object')
        return []

    const props = schema && schema.patternProperties
        ? (schema.patternProperties['.*'] || {}).properties || {}
        : {}
    const show = Array.isArray(schema && schema.showParams) ? schema.showParams : []

    return Object.entries(data)
        .filter(([, row]) => row && typeof row === 'object')
        .map(([key, row]) => {
            const name = schema && schema.namesake && row[schema.namesake] != null
                ? row[schema.namesake]
                : key
            const entry = {
                name: String(name),
                state: stateWord(row),
            }
            for (const field of show) {
                if (field === 'state' || field === 'name')
                    continue
                if (row[field] !== undefined)
                    entry[field] = row[field]
                else if (props[field] && props[field].default !== undefined)
                    entry[field] = props[field].default
            }
            return entry
        })
}

function addBytes(text, minKb, maxKb) {
    if (typeof text !== 'string')
        return text
    const m = text.match(/^([\d.]+)([KMG]?B)\/([\d.]+)([KMG]?B)$/)
    if (!m)
        return text

    const units = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3 }
    const add = Math.floor((minKb + Math.random() * (maxKb - minKb)) * 1024)
    const left = Number(m[1]) * units[m[2]] + add
    const right = Number(m[3]) * units[m[4]] + add

    const fmt = (bytes) => {
        if (bytes >= 1024 ** 3)
            return (bytes / 1024 ** 3).toFixed(2) + 'GB'
        if (bytes >= 1024 ** 2)
            return (bytes / 1024 ** 2).toFixed(2) + 'MB'
        return (bytes / 1024).toFixed(2) + 'KB'
    }
    return `${fmt(left)}/${fmt(right)}`
}

function liveStatus(value) {
    if (Array.isArray(value)) {
        for (const row of value)
            liveStatus(row)
        return value
    }
    if (!value || typeof value !== 'object')
        return value

    if (typeof value['rx-tx'] === 'string')
        value['rx-tx'] = addBytes(value['rx-tx'], 1, 30)

    if (typeof value.pkts === 'number')
        value.pkts += Math.floor(Math.random() * 4)

    if (typeof value.bytes === 'string') {
        const m = value.bytes.match(/^([\d.]+)([KMG]?B)$/)
        if (m) {
            const units = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3 }
            const bytes = Number(m[1]) * units[m[2]] + Math.floor(Math.random() * 4096)
            value.bytes = bytes >= 1024 ** 2
                ? (bytes / 1024 ** 2).toFixed(2) + 'MB'
                : (bytes / 1024).toFixed(2) + 'KB'
        }
    }

    return value
}

function statusFor(session, path, section) {
    const schema = schemaFor(path)
    if (!schema || !schema.status)
        return undefined

    if (section != null && section !== '') {
        const data = session.get(path)
        // запись могли удалить/очистить — статус не должен переживать данные
        if (!findKey(schema, data, section))
            return {}
        let value = fixtureStatus(path, section)
        if (value === undefined) {
            const key = findKey(schema, data, section)
            if (key && data[key]) {
                const row = data[key]
                value = { ...row }
                delete value._name
                value.state = stateWord(row)
            }
        }
        return value === undefined ? {} : liveStatus(value)
    }

    let value = fixtureStatus(path)
    if (value === undefined) {
        value = generatedStatus(session, schema, path)
    } else if (Array.isArray(value)) {
        // глобальный status снят с устройства и содержит все записи; после
        // удаления/clean в демо оставляем только те, что ещё есть в сессии.
        const data = session.get(path)
        value = value.filter((row) => !row || row.name == null ||
            findKey(schema, data, row.name) != null)
    }
    return liveStatus(value)
}

// потоковый ответ (wait/self-exec): пишем в raw, чтобы Fastify не пытался
// вычислить Content-Length по пустому на старте Readable
function writeLines(request, reply, lines, delay = 350) {
    reply.hijack()
    reply.raw.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
    })

    let i = 0
    let done = false

    const stop = () => {
        if (done)
            return
        done = true
        clearInterval(timer)
        try { reply.raw.end() } catch (e) {}
    }

    const timer = setInterval(() => {
        if (done)
            return
        if (i >= lines.length) {
            stop()
            return
        }
        reply.raw.write(lines[i++] + '\n')
    }, delay)
    timer.unref?.()

    // request.raw 'close' срабатывает после чтения тела, а не при обрыве
    // клиента; обрыв ловим на ответе
    reply.raw.on('close', stop)
    reply.raw.on('error', stop)
}

function actionLines(type, path, values) {
    const host = values.host || values['host-name'] || values['ip-address'] || '1.1.1.1'
    const count = Math.max(1, Math.min(10, Number(values.count) || 5))

    switch (type) {
    case 'ping': {
        const lines = [`PING ${host} (${host}): 56 data bytes`]
        for (let i = 0; i < count; i++)
            lines.push(`64 bytes from ${host}: seq=${i} ttl=56 time=${(8 + Math.random() * 20).toFixed(1)} ms`)
        lines.push('', `--- ${host} ping statistics ---`)
        lines.push(`${count} packets transmitted, ${count} packets received, 0% packet loss`)
        return lines
    }
    case 'traceroute': {
        const lines = [`traceroute to ${host}, 30 hops max, 46 byte packets`]
        for (let i = 0; i < 6; i++)
            lines.push(`${i + 1}  10.0.${i}.1   ${(1 + Math.random() * 12).toFixed(1)} ms`)
        lines.push('')
        return lines
    }
    case 'sniffer': {
        const lines = [`listening on ${values.interface || 'bridge0'} ...`]
        for (let i = 0; i < 12; i++)
            lines.push(`12:34:${String(i).padStart(2, '0')}.000000 IP 192.168.1.${20 + i}.42.${40000 + i} > 8.8.8.8.53: UDP, length 48`)
        return lines
    }
    case 'download': {
        return [
            `Connecting to ${values.url || 'https://example.com/file'} ...`,
            'Saving to /tmp/demo-file ...',
            '100% |********************************| 1024k  0:00:00 ETA',
            'Download complete',
        ]
    }
    default: {
        const lines = [`demo: ${type} ${path}`, `hostname: ${HOSTNAME}`]
        for (const [k, v] of Object.entries(values || {}))
            if (!k.startsWith('_') && k !== 'force')
                lines.push(`  ${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        lines.push('done')
        return lines
    }
    }
}

function blobContent(type, path, values) {
    if (type === 'export') {
        return {
            filename: 'demo-export.conf',
            text: [
                '# Aurora demo export',
                `# ${MODEL} / ${HOSTNAME}`,
                `# ${new Date().toISOString()}`,
                '',
                ...SCHEMA_LIST.map((p) => `# schema ${p}`),
                '',
                'config interface bridge0',
                '  option type static',
                '  option ip-address 192.168.1.1/24',
                '',
            ].join('\n'),
        }
    }

    if (type === 'report') {
        return {
            filename: 'demo-report.txt',
            text: [
                `Report for ${MODEL} (${fixture.serial || 'DONYX-DEMO-0001'})`,
                `Hostname: ${HOSTNAME}`,
                `Generated: ${new Date().toISOString()}`,
                '',
                'This is a demo report. No real device was involved.',
                '',
            ].join('\n'),
        }
    }

    return {
        filename: 'demo-file.txt',
        text: `demo file for ${type} ${path}\n${JSON.stringify(values, null, 2)}\n`,
    }
}

async function handleAction(request, reply, session, type, path, body) {
    const schema = schemaFor(path)
    const action = schema && (
        (schema.actions && schema.actions[type]) ||
        schema[type]
    )

    if (!action) {
        // неизвестное действие не должно ронять демо: отвечаем пустым успехом
        return json(reply, {})
    }

    const values = body.data || {}
    const data = { ...values }
    delete data._options

    if (action.responseType === 'blob') {
        const { filename, text } = blobContent(type, path, data)
        reply
            .code(200)
            .type('application/octet-stream')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(text)
        return
    }

    if (action.wait || action.byPassExec || action.byPassExecution) {
        if (type === 'journal') {
            const last = Math.min(Number(values.last) || 0, MAX_LAST)
            reply.type('text/html; charset=utf-8')
            reply.send(journalStream(reply, last))
            return
        }

        writeLines(request, reply, actionLines(type, path, data))
        return
    }

    return json(reply, {})
}

export async function wrapper(request, reply, sessions) {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const type = body.type

    if (!type)
        return plain(reply, 400, 'Bad Request')

    const token = tokenOf(request, body)
    const session = sessions.get(token)
    if (!session)
        return plain(reply, 401, 'Not Auth')

    const path = normalize(body.path || '/')
    const bodyData = body.data && typeof body.data === 'object' ? body.data : {}

    switch (type) {
    case '@schemas':
        return json(reply, {
            list: SCHEMA_LIST,
            hidden: SCHEMA_HIDDEN,
            visible: [],
            denied: [],
            chpasswd_req: 0,
        })

    case '@get':
    case '~get':
    case '@acquire':
        if (!SCHEMA_PATHS.has(path))
            return plain(reply, 404, 'invalid path')
        return json(reply, session.get(path))

    case '@set':
        return json(reply, setOption(session, schemaFor(path), path, bodyData))

    case 'apply':
    case '@apply':
        // изменения уже лежат в сессии после @set; apply — «применить и всё»
        return json(reply, {})

    case 'add':
    case '@add':
        return json(reply, addRecord(session, schemaFor(path), path, bodyData))

    case 'delete':
    case '@delete':
        return json(reply, deleteRecord(session, schemaFor(path), path, bodyData))

    case 'clean':
    case '@clean':
        return json(reply, cleanRecords(session, path))

    case 'reorder':
    case '@reorder':
        return json(reply, reorder(session, schemaFor(path), path, bodyData))

    case 'status':
    case '@status': {
        const section = bodyData._section
        const value = statusFor(session, path, section)
        return json(reply, value === undefined ? {} : value)
    }

    case '@cue':
        return json(reply, cue(session, path, bodyData))

    case 'commit':
    case 'revert':
    case '@reset':
        return json(reply, {})

    case 'dashboard':
        return json(reply, dashboard())

    case 'journal': {
        const last = Math.min(Number(bodyData.last) || 0, MAX_LAST)
        reply.type('text/html; charset=utf-8')
        reply.send(journalStream(reply, last))
        return
    }

    case '@schema': {
        const schema = schemaFor(path)
        return schema ? json(reply, schema) : plain(reply, 404, 'invalid path')
    }

    case '@config':
        return json(reply, {
            hostname: HOSTNAME,
            model: MODEL,
            serial: fixture.serial,
            language: 'en',
        })

    case '@acl':
    case '@exec':
    case '@merge':
    case '@reload':
        return json(reply, {})

    default:
        return handleAction(request, reply, session, type, path, body)
    }
}

export async function auth(request, reply, sessions) {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const header = request.headers.authorization || ''
    let username = body.username
    let password = body.password

    if ((!username || !password) && header.startsWith('Basic ')) {
        try {
            const pair = Buffer.from(header.slice(6), 'base64').toString('utf8')
            const i = pair.indexOf(':')
            username = pair.slice(0, i)
            password = pair.slice(i + 1)
        } catch (e) {}
    }

    if (typeof username !== 'string' || !username.trim())
        return plain(reply, 403, 'Access Denied')

    const session = sessions.create(username.trim())
    return json(reply, { token: session.token, timeout: 3600 })
}

export async function logout(request, reply, sessions) {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const token = body.token || request.headers.token
    sessions.remove(token)
    return reply.code(200).type('text/plain; charset=utf-8').send('OK')
}

export function requireSession(request, reply, sessions) {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const token = body.token || request.headers.token
    const session = sessions.get(token)
    if (!session)
        plain(reply, 401, 'Not Auth')
    return session
}
