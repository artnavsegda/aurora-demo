import crypto from 'node:crypto'
import { cloneData, SCHEMA_PATHS } from './fixtures.mjs'

const TTL = parseInt(process.env.DEMO_SESSION_TTL || '3600', 10) // seconds
const MAX_SESSIONS = parseInt(process.env.DEMO_MAX_SESSIONS || '200', 10)

function now() {
    return Date.now()
}

export class Session {
    constructor(token, user) {
        this.token = token
        this.user = user
        this.created = now()
        this.seen = this.created
        this.data = new Map()
        this.status = new Map()
        this.uploads = []
    }

    touch() {
        this.seen = now()
    }

    expired() {
        return now() - this.seen > TTL * 1000
    }

    // копия данных пути при первом обращении: сессии не мешают друг другу
    get(pathname) {
        if (!this.data.has(pathname))
            this.data.set(pathname, cloneData(pathname))
        return this.data.get(pathname)
    }

    set(pathname, value) {
        this.data.set(pathname, value)
        return value
    }

    statusFor(pathname, section) {
        if (this.status.has(pathname))
            return this.status.get(pathname)

        return undefined
    }

    setStatus(pathname, value) {
        this.status.set(pathname, value)
    }
}

export class SessionStore {
    constructor() {
        this.sessions = new Map()
        this.timer = setInterval(() => this.cleanup(), 60_000)
        this.timer.unref?.()
    }

    create(user) {
        // жёсткий лимит: демо публичное, память не должна расти бесконечно
        if (this.sessions.size >= MAX_SESSIONS) {
            const oldest = [...this.sessions.entries()]
                .sort((a, b) => a[1].seen - b[1].seen)[0]
            if (oldest)
                this.sessions.delete(oldest[0])
        }

        const token = crypto.randomBytes(24).toString('hex')
        const session = new Session(token, user)
        this.sessions.set(token, session)
        this.seedUser(session)
        return session
    }

    get(token) {
        const session = token ? this.sessions.get(token) : undefined
        if (!session)
            return undefined
        if (session.expired()) {
            this.sessions.delete(token)
            return undefined
        }
        session.touch()
        return session
    }

    remove(token) {
        if (token)
            this.sessions.delete(token)
    }

    cleanup() {
        for (const [token, session] of this.sessions)
            if (session.expired())
                this.sessions.delete(token)
    }

    // пользователь в /system/user — чтобы страница пользователей не была пустой
    seedUser(session) {
        if (!SCHEMA_PATHS.has('/system/user'))
            return

        const users = session.get('/system/user')
        if (!users || typeof users !== 'object')
            return

        if (!users[session.user]) {
            const next = Object.keys(users).length
            users[session.user] = {
                '.anonymous': false,
                '.type': 'user',
                '.name': session.user,
                '.index': next,
                level: 'administrator',
                disabled: '0',
                'ssh-keys': [],
            }
        }
    }
}

export { TTL }
