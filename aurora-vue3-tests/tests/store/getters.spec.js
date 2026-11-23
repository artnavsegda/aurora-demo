import { createStore } from 'vuex'

import { vi } from 'vitest'
import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

function makeStore() {
    const state = JSON.parse(JSON.stringify(initialState))
    // JSON не сохраняет undefined-ключи, а Vue-реактивность любит их видеть
    state.status = { model: undefined, interval: undefined }
    return createStore({ state, mutations, getters })
}

function makeSch(extra = {}) {
    return new Sch({
        properties: { option: { type: 'array' } },
        ...extra,
    }, '/test', vi.fn().mockResolvedValue({ data: {} }))
}

describe('store/getters', () => {
    let store

    beforeEach(() => {
        store = makeStore()
    })

    test('getStatusModel', () => {
        expect(store.getters.getStatusModel).toBeUndefined()
        store.state.status.model = [{ name: 'x' }]
        expect(store.getters.getStatusModel).toEqual([{ name: 'x' }])
    })

    test('getElementsByCue: опция схемы', () => {
        const sch = makeSch()
        sch.data = { option: ['a', 'b'] }
        store.state.schemas = { test: sch }

        expect(store.getters.getElementsByCue('/test/option')).toEqual(['a', 'b'])
        expect(sch.actionCallBack).toHaveBeenCalledWith('@get', sch, undefined, {})
    })

    test('getElementsByCue: элементы схемы и фильтр', () => {
        const sch = makeSch()
        sch.elements = vi.fn(() => [{ title: 'A' }, { title: 'B' }])
        store.state.schemas = { test: sch }

        expect(store.getters.getElementsByCue('/test[name:one]')).toEqual(['A', 'B'])
        expect(sch.elements).toHaveBeenCalledWith({ name: ['one'] })
    })

    test('getElementsByCue: вложенная ветка', () => {
        const sch = makeSch()
        sch.data = { option: ['nested'] }
        store.state.schemas = { branch: { test: sch } }

        expect(store.getters.getElementsByCue('/branch/test/option')).toEqual(['nested'])
    })

    test('getElementsByCue: неизвестный путь', () => {
        store.state.schemas = {}
        expect(store.getters.getElementsByCue('/missing')).toEqual([])
        expect(store.getters.getElementsByCue('/missing/option')).toEqual([])
    })

    test('getElementsByCue: без фильтра и без данных', () => {
        const sch = makeSch()
        sch.data = {}
        store.state.schemas = { test: sch }
        expect(store.getters.getElementsByCue('/test/option')).toEqual([])
    })
})
