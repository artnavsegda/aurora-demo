import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const halo = process.env.HALO_DIST ||
    path.join(here, 'frontend', 'halo')

export default defineConfig({
    testDir: './e2e/halo',
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    timeout: 30_000,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:8104',
        trace: 'off',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'node src/server.mjs',
        cwd: here,
        env: {
            ...process.env,
            PORT: '8104',
            FRONTEND_DIST: halo,
            LOG_LEVEL: 'warn',
        },
        url: 'http://127.0.0.1:8104/healthz',
        reuseExistingServer: false,
        timeout: 120_000,
    },
})
