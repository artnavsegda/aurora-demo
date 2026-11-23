import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const vue2 = process.env.AURORA_VUE2_DIST || path.join(here, 'frontend', 'vue2')
const vue3 = process.env.AURORA_VUE3_DIST || path.join(here, 'frontend', 'vue3')

function server(port, dist) {
    return {
        command: 'node src/server.mjs',
        cwd: here,
        env: {
            ...process.env,
            PORT: String(port),
            FRONTEND_DIST: dist,
            LOG_LEVEL: 'warn',
            DEMO_TEST_SCHEMAS: '1',
        },
        url: `http://127.0.0.1:${port}/healthz`,
        reuseExistingServer: false,
        timeout: 120_000,
    }
}

export default defineConfig({
    testDir: './e2e',
    // Halo-тесты запускаются отдельным playwright.halo.config.mjs и не должны
    // попадать в проекты Aurora Vue 2/Vue 3.
    testIgnore: '**/halo/**',
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        trace: 'off',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'vue2',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8102' },
        },
        {
            name: 'vue3',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8103' },
        },
    ],
    webServer: [
        server(8102, vue2),
        server(8103, vue3),
    ],
})
