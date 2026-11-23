import Vue from 'vue'
import Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

import Syslog from '@/components/Syslog.vue'

Vue.use(Vuex)

function makeStore(actions = {}) {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({
        state,
        mutations,
        getters,
        actions: {
            showLog: jest.fn(),
            ...actions,
        },
    })
}

function makeToolsSch(cb) {
    return new Sch({
        actions: {
            journal: { exec: 'journal.uc', wait: true },
        },
    }, '/tools', cb)
}

function mountSyslog({ store = makeStore(), sch = makeToolsSch(jest.fn(() => Promise.resolve())) } = {}) {
    store.state.schemas = { tools: sch }
    return shallowMount(Syslog, { store })
}

describe('components/Syslog', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    test('beforeMount запускает journal и повторяет запрос', async () => {
        jest.useFakeTimers()
        const cb = jest.fn(() => Promise.resolve())
        const wrapper = mountSyslog({ sch: makeToolsSch(cb) })

        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb.mock.calls[0][0]).toBe('journal')
        expect(cb.mock.calls[0][3].last).toBe(50)

        await Promise.resolve()
        await Promise.resolve()
        jest.advanceTimersByTime(10)
        await Promise.resolve()
        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb.mock.calls[1][3].last).toBe(0)

        wrapper.destroy()
    })

    test('pushOutput, filteredLogs и setFilter', () => {
        const wrapper = mountSyslog({ sch: makeToolsSch(jest.fn(() => Promise.resolve())) })
        wrapper.vm.pushOutput(['one', 'two'])
        expect(wrapper.vm.logs).toEqual(['one', 'two'])

        wrapper.vm.setFilter('two')
        expect(wrapper.vm.filterError).toBe('')
        expect(wrapper.vm.filteredLogs).toEqual(['two'])

        wrapper.vm.setFilter('[')
        expect(wrapper.vm.filterError).toContain('invalid filter expression')
        expect(wrapper.vm.filterRe).toBeNull()
    })

    test('updateFilter с debounce читает input', () => {
        jest.useFakeTimers()
        const wrapper = mountSyslog({ sch: makeToolsSch(jest.fn(() => Promise.resolve())) })
        wrapper.vm.$refs.strFilter.value = 'one'
        wrapper.vm.updateFilter()
        jest.advanceTimersByTime(500)
        expect(wrapper.vm.filterRe).toBeTruthy()
        expect(wrapper.vm.filteredLogs).toEqual([])
    })

    test('ошибка запроса без response выключает лог', async () => {
        jest.useFakeTimers()
        const cb = jest.fn(() => Promise.reject(new Error('fail')))
        const wrapper = mountSyslog({ sch: makeToolsSch(cb) })

        await Promise.resolve()
        await Promise.resolve()
        expect(wrapper.vm.$store.state.showSyslog).toBe(false)
        wrapper.destroy()
    })

    test('ошибка 401 отменяет источник и выключает лог', async () => {
        jest.useFakeTimers()
        const cb = jest.fn(() => Promise.reject({ response: { status: 401 } }))
        const wrapper = mountSyslog({ sch: makeToolsSch(cb) })

        await Promise.resolve()
        await Promise.resolve()
        expect(wrapper.vm.$store.state.showSyslog).toBe(false)
        wrapper.destroy()
    })

    test('scroll при autoScroll', () => {
        jest.useFakeTimers()
        const wrapper = mountSyslog({ sch: makeToolsSch(jest.fn(() => Promise.resolve())) })
        wrapper.vm.$refs.container.scrollTop = 0
        Object.defineProperty(wrapper.vm.$refs.container, 'scrollHeight', { value: 100, configurable: true })
        wrapper.vm.scroll()
        jest.advanceTimersByTime(20)
        expect(wrapper.vm.$refs.container.scrollTop).toBe(100)

        wrapper.vm.autoScroll = false
        wrapper.vm.$refs.container.scrollTop = 0
        wrapper.vm.scroll()
        jest.advanceTimersByTime(20)
        expect(wrapper.vm.$refs.container.scrollTop).toBe(0)
        wrapper.destroy()
    })
})
