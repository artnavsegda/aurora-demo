import { buildApp } from './app.mjs'

const app = await buildApp()

const port = Number(process.env.PORT || 8080)
const host = process.env.HOST || '0.0.0.0'

try {
    await app.listen({ port, host })
    app.log.warn(`aurora demo backend: http://${host}:${port}/`)
} catch (err) {
    app.log.error(err)
    process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        await app.close()
        process.exit(0)
    })
}
