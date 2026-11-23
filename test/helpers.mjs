import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildApp } from '../src/app.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const publicRoot = path.join(here, '..', 'public')

export async function makeApp() {
    const app = await buildApp({ logger: false, frontendDist: publicRoot })
    await app.ready()
    return app
}

export async function login(app, username = 'demo', password = '') {
    const res = await app.inject({
        method: 'POST',
        url: '/script/auth',
        payload: { username, password },
    })
    return res
}

export async function loginToken(app, username = 'demo') {
    const res = await login(app, username)
    if (res.statusCode !== 200)
        throw new Error(`login failed: ${res.statusCode} ${res.body}`)
    return res.json().token
}

export async function call(app, token, type, reqPath = '/', data = {}) {
    return app.inject({
        method: 'POST',
        url: `/script/wrapper?${type}`,
        payload: { type, path: reqPath, token, data },
    })
}

export async function get(app, token, reqPath) {
    const res = await call(app, token, '@get', reqPath)
    return res.json()
}
