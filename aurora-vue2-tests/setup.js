import Vue from 'vue'

Vue.config.productionTip = false
Vue.config.devtools = false

// jsdom не умеет blob-URL, а store.uploadToTemp/download использует их
if (!global.URL.createObjectURL)
    global.URL.createObjectURL = jest.fn(() => 'blob:test')
if (!global.URL.revokeObjectURL)
    global.URL.revokeObjectURL = jest.fn()

if (!global.requestAnimationFrame)
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0)
if (!global.cancelAnimationFrame)
    global.cancelAnimationFrame = (id) => clearTimeout(id)

if (!global.ResizeObserver) {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}

// графики могут дёрнуть canvas, даже если мы их shallow-монтируем
if (!HTMLCanvasElement.prototype.getContext)
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}))

if (!window.scrollTo)
    window.scrollTo = jest.fn()
