import { createStore } from 'vuex'

import { vi } from 'vitest'
import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

function makeStore() {
    return createStore({
        state: JSON.parse(JSON.stringify(initialState)),
        mutations,
        getters,
    })
}

const flush = async () => {
    for (let i = 0; i < 10; i++)
        await Promise.resolve()
}

function makeSch(extra = {}) {
    return new Sch({
        properties: { hostname: { type: 'string' } },
        ...extra,
    }, '/test', vi.fn().mockResolvedValue({ data: {} }))
}

describe('store/mutations', () => {
    let store

    beforeEach(() => {
        store = makeStore()
    })

    test('state: начальное состояние', () => {
        expect(store.state.user.token).toBeNull()
        expect(store.state.user.acl).toEqual({ visible: [], hidden: [], denied: [] })
        expect(store.state.informs).toEqual([])
        expect(store.state.commited).toBe(true)
        expect(store.state.blocker).toEqual({ loader: false, text: '', window: false, active: false })
        expect(store.state.schemas).toEqual({})
        expect(store.state.status.model).toBeUndefined()
        expect(store.state.status.interval).toBeUndefined()
    })

    test('dropAuth и ACL-мутации', () => {
        store.commit('dropAuth')
        expect(store.state.user.acl).toEqual({ visible: [], hidden: [] })
        expect(store.state.user.token).toBeUndefined()

        store.commit('setVisibleSchemas', ['/a'])
        store.commit('setHiddenSchemas', ['/b'])
        store.commit('setDeniedSchemas', ['/c'])
        expect(store.state.user.acl.visible).toEqual(['/a'])
        expect(store.state.user.acl.hidden).toEqual(['/b'])
        expect(store.state.user.acl.denied).toEqual(['/c'])
    })

    test('updateBoardInfo мержит данные', () => {
        store.commit('updateBoardInfo', { board: { model: 'R50' } })
        store.commit('updateBoardInfo', { board: { serial: '123' } })
        expect(store.state.info).toEqual({ board: { model: 'R50', serial: '123' } })
    })

    test('setChanges и setCommited', () => {
        store.commit('setChanges', { path: '/ip/interface/port1', value: true })
        expect(store.state.changes['/ip/interface/port1']).toBe(true)
        expect(store.state.commited).toBe(false)

        store.commit('setCommited', true)
        expect(store.state.commited).toBe(true)
    })

    test('mergeDataToPath и setDataToPath', () => {
        const sch = makeSch()
        sch.data = { hostname: 'old', extra: { a: 1 } }
        store.state.schemas = { test: sch }

        store.commit('mergeDataToPath', { path: '/test', data: { hostname: 'new', extra: { b: 2 } } })
        expect(sch.data).toEqual({ hostname: 'new', extra: { a: 1, b: 2 } })

        store.commit('setDataToPath', { path: '/test', data: { hostname: 'replaced' } })
        expect(sch.data).toEqual({ hostname: 'replaced' })
        expect(sch._stamp).toBeGreaterThan(0)

        // путь без схемы — no-op
        store.commit('mergeDataToPath', { path: '/missing', data: { a: 1 } })
        store.commit('setDataToPath', { path: '/missing', data: { a: 1 } })
        expect(store.state.schemas.missing).toBeUndefined()
    })

    test('dropStatus очищает таймер и модель', () => {
        vi.useFakeTimers()
        const clear = vi.spyOn(global, 'clearTimeout')
        store.state.status.interval = 123
        store.state.status.model = [{ name: 'x' }]

        store.commit('dropStatus')
        expect(clear).toHaveBeenCalledWith(123)
        expect(store.state.status.interval).toBeUndefined()
        expect(store.state.status.model).toBeUndefined()
        clear.mockRestore()
        vi.useRealTimers()
    })

    test('reqStatus: без path', () => {
        store.commit('reqStatus', {})
        expect(store.state.status.model).toBeUndefined()
    })

    test('reqStatus: неизвестный путь бросает (как в проде)', () => {
        expect(() => store.commit('reqStatus', { path: ['missing'] }))
            .toThrow('Invalid reference token')
    })

    test('reqStatus: схема без status', () => {
        const sch = makeSch()
        store.state.schemas = { test: sch }
        store.commit('reqStatus', { path: ['test'] })
        expect(store.state.status.model).toBeUndefined()
    })

    test('reqStatus: опрашивает status и ставит следующий таймер', async () => {
        vi.useFakeTimers()
        window.location.hash = '#/test'

        const sch = makeSch({ status: { exec: 'status.uc' } })
        sch.status = vi.fn().mockResolvedValue({ data: [{ name: 'bridge0', state: 5 }] })
        store.state.schemas = { test: sch }
        store.state.selectedPropertyValue = 'bridge0'

        store.commit('reqStatus', { path: ['test'] })
        await flush()

        expect(sch.status).toHaveBeenCalledWith({ _section: 'bridge0' })
        expect(store.state.status.model).toEqual([{ name: 'bridge0', state: 5 }])
        expect(store.state.status.interval).toBeTruthy()

        // второй опрос по таймеру
        sch.status.mockResolvedValue({ data: [{ name: 'bridge0', state: 6 }] })
        vi.advanceTimersByTime(5000)
        await flush()
        expect(sch.status).toHaveBeenCalledTimes(2)
        expect(store.state.status.model).toEqual([{ name: 'bridge0', state: 6 }])

        store.commit('dropStatus')
        vi.useRealTimers()
    })

    test('reqStatus: ошибка status не роняет стор', async () => {
        vi.useFakeTimers()
        window.location.hash = '#/test'

        const sch = makeSch({ status: { exec: 'status.uc' } })
        sch.status = vi.fn().mockRejectedValue(new Error('fail'))
        store.state.schemas = { test: sch }

        store.commit('reqStatus', { path: ['test'] })
        await flush()
        expect(store.state.status.model).toBeUndefined()
        expect(store.state.status.interval).toBeTruthy()

        store.commit('dropStatus')
        vi.useRealTimers()
    })

    test('reqStatus: чужой hash не опрашивает status', () => {
        window.location.hash = '#/other'
        const sch = makeSch({ status: { exec: 'status.uc' } })
        sch.status = vi.fn()
        store.state.schemas = { test: sch }

        store.commit('reqStatus', { path: ['test'] })
        expect(sch.status).not.toHaveBeenCalled()
    })
})
