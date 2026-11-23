const path = require('node:path')

const harness = __dirname
const auroraRoot = process.env.AURORA_ROOT ||
    path.resolve(harness, '../../../../Desktop/aurora')
const auroraSrc = path.join(auroraRoot, 'src')

// Отдельный конфиг: rootDir — прод-репозиторий, поэтому Jest собирает coverage
// по src. Тесты лежат вне него (корпоративная политика) — roots указывает на них.
module.exports = {
    rootDir: auroraRoot,
    roots: [path.join(harness, 'tests'), path.join(auroraRoot, 'src')],
    testMatch: ['**/*.spec.js'],
    testEnvironment: 'jsdom',
    moduleFileExtensions: ['js', 'json', 'vue'],
    moduleDirectories: [
        path.join(harness, 'node_modules'),
        path.join(auroraRoot, 'node_modules'),
        'node_modules',
    ],
    transform: {
        '^.+\\.vue$': [path.join(harness, 'node_modules/@vue/vue2-jest'), {
            babelConfig: path.join(harness, 'babel.config.cjs'),
        }],
        '^.+\\.js$': [path.join(harness, 'node_modules/babel-jest'), {
            configFile: path.join(harness, 'babel.config.cjs'),
        }],
    },
    moduleNameMapper: {
        '^@/css/.*\\.(css|less|scss|sass)$': path.join(harness, 'stubs/style.js'),
        '^@/(?:fonts|assets)/.*\\.(woff2?|ttf|eot|svg|png|ico|jpe?g|gif)$': path.join(harness, 'stubs/file.js'),
        '^@/(.*)$': path.join(auroraSrc, '$1'),
        '^vue$': path.join(harness, 'node_modules/vue/dist/vue.runtime.common.js'),
        '\\.(css|less|scss|sass)$': path.join(harness, 'stubs/style.js'),
        '\\.(woff2?|ttf|eot|svg|png|ico|jpe?g|gif)$': path.join(harness, 'stubs/file.js'),
    },
    setupFilesAfterEnv: [path.join(harness, 'setup.js')],
    clearMocks: true,
    restoreMocks: true,
    collectCoverageFrom: [
        '<rootDir>/src/**/*.{js,vue}',
        '!**/main.js',
        '!**/icons.js',
    ],
    coverageDirectory: path.join(harness, 'coverage'),
    coverageProvider: 'babel',
}
