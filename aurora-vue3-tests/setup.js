import { config } from '@vue/test-utils'

config.global.config.warnHandler = () => {}
config.global.config.errorHandler = (err) => {
    // компонентные тесты сами проверяют ошибки; шум Vue не нужен
    console.error(err)
}

if (!globalThis.URL.createObjectURL)
    globalThis.URL.createObjectURL = () => 'blob:test'
if (!globalThis.URL.revokeObjectURL)
    globalThis.URL.revokeObjectURL = () => {}

if (!globalThis.ResizeObserver)
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

if (!globalThis.requestAnimationFrame)
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
if (!globalThis.cancelAnimationFrame)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

if (!HTMLCanvasElement.prototype.getContext)
    HTMLCanvasElement.prototype.getContext = () => ({})

if (!window.scrollTo)
    window.scrollTo = () => {}
