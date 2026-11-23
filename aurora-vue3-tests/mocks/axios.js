import { vi } from 'vitest'

const axios = vi.fn()
axios.post = vi.fn()
axios.get = vi.fn()
axios.defaults = { headers: { common: {} } }
axios.CancelToken = {
    source: vi.fn(() => ({ token: 'cancel-token', cancel: vi.fn() })),
}
axios.isCancel = vi.fn(() => false)
const responseHandlers = []
axios.interceptors = {
    response: {
        use: (fulfilled, rejected) => {
            responseHandlers.push({ fulfilled, rejected })
            return responseHandlers.length
        },
        handlers: responseHandlers,
    },
}

export default axios
