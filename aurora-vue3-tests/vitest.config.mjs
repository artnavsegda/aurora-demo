import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const here = path.dirname(fileURLToPath(import.meta.url))
const auroraSrc = process.env.AURORA_SRC ||
    path.resolve(here, '../../../../Desktop/aurora/src')

export default defineConfig({
    plugins: [vue()],
    resolve: {
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
        alias: [
            { find: /^@\/.*\.(css|less|scss|sass)$/, replacement: path.join(here, 'stubs/style.js') },
            { find: /^@\/.*\.(woff2?|ttf|eot|svg|png|ico|jpe?g|gif)$/, replacement: path.join(here, 'stubs/file.js') },
            { find: '@', replacement: auroraSrc },
            { find: 'vue', replacement: path.join(here, 'node_modules/vue/dist/vue.runtime.esm-bundler.js') },
            { find: 'axios', replacement: path.join(here, 'mocks/axios.js') },
        ],
    },
    server: {
        fs: {
            allow: [here, path.resolve(auroraSrc, '..'), path.resolve(here, '..')],
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.spec.js'],
        setupFiles: ['./setup.js'],
        css: false,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: [path.join(auroraSrc, '**/*.{js,vue}')],
            exclude: ['**/main.js', '**/icons.js'],
        },
    },
})
