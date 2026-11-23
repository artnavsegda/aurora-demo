import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Fastify from 'fastify'
import multipart from '@fastify/multipart'

import { SessionStore } from './session.mjs'
import {
    auth, logout, requireSession, wrapper,
} from './legacy.mjs'
import { board, dashboard } from './dashboard.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const schemaRoot = path.join(root, 'schemas')
const testSchemaRoot = path.join(root, 'test-schemas')
const publicRoot = path.join(root, 'public')

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain; charset=utf-8',
}

function humanSize(bytes) {
    if (bytes >= 1024 * 1024)
        return (bytes / 1024 / 1024).toFixed(2) + 'MB'
    if (bytes >= 1024)
        return (bytes / 1024).toFixed(2) + 'KB'
    return String(bytes) + 'B'
}

function safeJoin(base, rel) {
    const file = path.resolve(base, rel)
    if (file !== base && !file.startsWith(base + path.sep))
        return null
    return file
}

async function sendFile(reply, file, cache = 'public, max-age=0') {
    let target = file
    let buf
    try {
        buf = await fs.promises.readFile(target)
    } catch (e) {
        // локальная сборка Halo до шага halo.mk: файлы лежат как .js.gz/.css.gz
        target = file + '.gz'
        buf = await fs.promises.readFile(target)
    }

    const compressed = /\.(js|css)$/.test(file) &&
        buf[0] === 0x1f && buf[1] === 0x8b
    if (compressed)
        reply.header('Content-Encoding', 'gzip')
    reply
        .type(MIME[path.extname(file)] || 'application/octet-stream')
        .header('Cache-Control', cache)
        .send(buf)
}

/**
 * Собирает Fastify-приложение. Не слушает порт — это делает server.mjs,
 * а тесты используют app.inject().
 *
 * options:
 *   logger       — false или конфиг Fastify
 *   sessions     — готовый SessionStore (для тестов)
 *   frontendDist — переопределить каталог фронтенда
 *   haloDist     — переопределить каталог Halo
 */
export async function buildApp(options = {}) {
    const app = Fastify({
        logger: options.logger ?? { level: process.env.LOG_LEVEL || 'warn' },
        bodyLimit: 2 * 1024 * 1024,
        trustProxy: true,
    })

    const sessions = options.sessions ?? new SessionStore()

    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 8,
        },
    })

    app.get('/healthz', async () => ({
        ok: true,
        sessions: sessions.sessions.size,
    }))

    app.post('/script/auth', (request, reply) => auth(request, reply, sessions))
    app.post('/script/logout', (request, reply) => logout(request, reply, sessions))
    app.post('/script/wrapper', (request, reply) => wrapper(request, reply, sessions))

    app.post('/script/dashboard', (request, reply) => {
        const session = requireSession(request, reply, sessions)
        if (!session)
            return
        return reply.type('application/json; charset=utf-8').send(dashboard())
    })

    app.post('/script/board', (request, reply) => {
        const session = requireSession(request, reply, sessions)
        if (!session)
            return
        return reply.type('application/json; charset=utf-8').send(board())
    })

    app.post('/script/upload', async (request, reply) => {
        const token = request.headers.token
        const session = sessions.get(token)
        if (!session) {
            reply.code(401).type('text/plain; charset=utf-8').send('Not Auth')
            return
        }

        const storage = session.get('/storage/file')
        if (!storage || typeof storage !== 'object') {
            reply.code(500).type('text/plain; charset=utf-8').send('storage not available')
            return
        }

        const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
        try {
            for await (const part of request.parts()) {
                if (part.type !== 'file')
                    continue
                const buf = await part.toBuffer()
                const name = part.filename || `upload-${Object.keys(storage).length + 1}`
                storage[name] = {
                    'file-name': '/tmp/' + name,
                    'file-type': part.mimetype || 'application/octet-stream',
                    'file-size': humanSize(buf.length),
                    'last-change': now,
                    'last-access': now,
                }
            }
        } catch (err) {
            request.log.warn(err)
            reply.code(400).type('text/plain; charset=utf-8').send('upload failed')
            return
        }

        reply.type('application/json; charset=utf-8').send({})
    })

    // Схемы: отдельный обработчик, потому что прод-клиент просит /schema//ip/interface.json
    app.get('/schema/*', async (request, reply) => {
        const rel = String(request.params['*'] || '').replace(/^\/+/, '')
        if (!rel) {
            reply.code(404).type('text/plain; charset=utf-8').send('Not Found')
            return
        }
        const file = rel.startsWith('test/')
            ? safeJoin(testSchemaRoot, rel.slice('test/'.length))
            : safeJoin(schemaRoot, rel)
        if (!file) {
            reply.code(403).type('text/plain; charset=utf-8').send('Access Denied')
            return
        }
        try {
            const data = await fs.promises.readFile(file)
            reply
                .type('application/json; charset=utf-8')
                .header('Cache-Control', 'public, max-age=300')
                .send(data)
        } catch (e) {
            reply.code(404).type('text/plain; charset=utf-8').send('Not Found')
        }
    })

    // Halo собирается с gzip под исходными именами .js/.css (lighttpd отдаёт их
    // с Content-Encoding: gzip); здесь определяем gzip по магии файла.
    const haloRoot = options.haloDist
        ? path.resolve(options.haloDist)
        : process.env.HALO_DIST ? path.resolve(process.env.HALO_DIST) : null
    if (haloRoot && fs.existsSync(haloRoot)) {
        app.get('/halo/*', async (request, reply) => {
            let rel = String(request.params['*'] || '').replace(/^\/+/, '')
            if (!rel || rel.endsWith('/'))
                rel += 'index.html'
            const file = safeJoin(haloRoot, rel)
            if (!file) {
                reply.code(403).type('text/plain; charset=utf-8').send('Access Denied')
                return
            }
            try {
                const buf = await fs.promises.readFile(file)
                if (/\.(js|css)$/.test(file) && buf[0] === 0x1f && buf[1] === 0x8b)
                    reply.header('Content-Encoding', 'gzip')
                reply.type(MIME[path.extname(file)] || 'application/octet-stream').send(buf)
            } catch (e) {
                reply.code(404).type('text/plain; charset=utf-8').send('Not Found')
            }
        })
    }

    // FRONTEND_DIST — корень той сборки, которую отдаёт этот инстанс: Aurora или Halo.
    // AURORA_DIST оставлен для совместимости с первым вариантом README.
    const frontendEnv = options.frontendDist ||
        process.env.FRONTEND_DIST ||
        process.env.AURORA_DIST
    const frontendRoot = frontendEnv ? path.resolve(frontendEnv) : publicRoot

    if (frontendEnv && !fs.existsSync(frontendRoot))
        app.log.warn(`FRONTEND_DIST not found: ${frontendRoot}`)

    const webRoot = fs.existsSync(frontendRoot) ? frontendRoot : publicRoot

    app.get('/', async (request, reply) => {
        try {
            await sendFile(reply, path.join(webRoot, 'index.html'))
        } catch (e) {
            reply.code(404).type('text/plain; charset=utf-8').send('Not Found')
        }
    })

    app.get('/*', async (request, reply) => {
        const rel = String(request.params['*'] || '').replace(/^\/+/, '')

        // Halo подключает modules/manifest.js до бандла; пустой манифест — валидный
        if (rel === 'modules/manifest.js') {
            reply
                .type('text/javascript; charset=utf-8')
                .send('globalThis.__haloModules ??= {};\n')
            return
        }

        const file = safeJoin(webRoot, rel)
        if (!file) {
            reply.code(403).type('text/plain; charset=utf-8').send('Access Denied')
            return
        }
        try {
            await sendFile(reply, file)
        } catch (e) {
            // SPA без history API: hash-роутинг, поэтому просто 404
            reply.code(404).type('text/plain; charset=utf-8').send('Not Found')
        }
    })

    return app
}
