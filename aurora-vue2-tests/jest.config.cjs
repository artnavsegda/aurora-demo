const path = require('node:path')

// Где лежит прод-Aurora (ветка compressed). По умолчанию — соседний Desktop.
// Для CI/другой машины: AURORA_SRC=/path/to/aurora/src npm test
const auroraSrc = process.env.AURORA_SRC ||
    path.resolve(__dirname, '../../../../Desktop/aurora/src')

module.exports = {
    rootDir: __dirname,
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/**/*.spec.js'],
    coverageProvider: 'v8',
    moduleFileExtensions: ['js', 'json', 'vue'],
    // vuex, vue-router, axios, vue-json-pointer и т.п. берём из прод-репозитория,
    // чтобы не дублировать его зависимости в тестовом пакете
    moduleDirectories: [
        'node_modules',
        path.join(auroraSrc, '..', 'node_modules'),
    ],
    transform: {
        '^.+\\.vue$': ['@vue/vue2-jest', { babelConfig: true }],
        '^.+\\.js$': 'babel-jest',
    },
    moduleNameMapper: {
        // более конкретные @-пути — до общего ^@/
        '^@/css/.*\\.(css|less|scss|sass)$': '<rootDir>/stubs/style.js',
        '^@/(?:fonts|assets)/.*\\.(woff2?|ttf|eot|svg|png|ico|jpe?g|gif)$': '<rootDir>/stubs/file.js',
        '^@/(.*)$': path.join(auroraSrc, '$1'),
        '^vue$': '<rootDir>/node_modules/vue/dist/vue.runtime.common.js',
        '\\.(css|less|scss|sass)$': '<rootDir>/stubs/style.js',
        '\\.(woff2?|ttf|eot|svg|png|ico|jpe?g|gif)$': '<rootDir>/stubs/file.js',
    },
    setupFilesAfterEnv: ['<rootDir>/setup.js'],
    clearMocks: true,
    restoreMocks: true,
    coverageDirectory: '<rootDir>/coverage',
    collectCoverageFrom: [
        path.join(auroraSrc, '**/*.{js,vue}'),
        '!**/main.js',
        '!**/icons.js',
    ],
}
