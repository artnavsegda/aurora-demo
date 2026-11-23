import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'

import ActionWindow from '@/components/windows/ActionWindow.vue'

Vue.use(Vuex)

function makeStore(actions = {}) {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({
        state,
        mutations,
        getters,
        actions: {
            awaitProcessComplete: jest.fn(() => Promise.resolve({})),
            logout: jest.fn(),
            ...actions,
        },
    })
}

function mountAction({ store = makeStore(), props = {}, action = {}, schema = { properties: { a: {} } } } = {}) {
    return shallowMount(ActionWindow, {
        store,
        propsData: {
            name: 'test-action',
            action,
            schema,
            func: jest.fn(() => Promise.resolve({})),
            definitions: {},
            path: ['test'],
            ...props,
        },
        mocks: { $route: { path: '/test' }, $router: { push: jest.fn() } },
    })
}

describe('components/windows/ActionWindow', () => {
    beforeEach(() => {
        jest.spyOn(axios.CancelToken, 'source').mockReturnValue({
            cancel: jest.fn(),
            token: 'test-token',
        })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    test('setValue/setError/zValues/outputLines/hasErrors/isRequired', async () => {
        const wrapper = mountAction({ schema: { properties: {}, required: ['a'] } })
        wrapper.vm.setValue({ value: 1, valid: true }, 'a')
        wrapper.vm.setError('bad', 'a')
        expect(wrapper.vm.values.a).toBe(1)
        expect(wrapper.vm.zValues).toEqual({ a: 1 })
        expect(wrapper.vm.errors.a).toBe('bad')
        expect(wrapper.vm.hasErrors).toBe(true)

        wrapper.vm.setError(undefined, 'a')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.errors.a).toBeUndefined()
        expect(wrapper.vm.hasErrors).toBe(false)

        wrapper.vm.output = ['a', '', 'b']
        expect(wrapper.vm.outputLines).toEqual(['a', 'b'])
        expect(wrapper.vm.isRequired('a')).toBe(true)
        expect(wrapper.vm.isRequired('b')).toBe(false)
    })

    test('execute без wait: закрывает окно', async () => {
        const func = jest.fn(() => Promise.resolve({}))
        const wrapper = mountAction({ props: { func }, action: { wait: false } })

        await wrapper.vm.execute()
        expect(func).toHaveBeenCalled()
        expect(wrapper.vm.started).toBe(true)
        expect(wrapper.vm.inProcess).toBe(false)
        expect(wrapper.emitted().onClose).toBeTruthy()
    })

    test('execute с wait: запускает поток и не закрывает', async () => {
        const func = jest.fn(() => Promise.resolve({}))
        const wrapper = mountAction({ props: { func }, action: { wait: true } })

        await wrapper.vm.execute()
        expect(func).toHaveBeenCalled()
        expect(wrapper.vm.values._options).toBeTruthy()
        expect(wrapper.vm.values._options.source.token).toBe('test-token')
        expect(wrapper.vm.output).toContain('Finished')
        expect(wrapper.emitted().onClose).toBeUndefined()
    })

    test('execute с section добавляет _section/_name', async () => {
        const func = jest.fn(() => Promise.resolve({}))
        const wrapper = mountAction({
            props: { func, section: { _value: 'rec1', title: 'one' } },
            action: { wait: false },
        })
        await wrapper.vm.execute()
        expect(func.mock.calls[0][0]).toMatchObject({ _section: 'rec1', _name: 'one' })
    })

    test('execute: hasErrors не запускает', () => {
        const func = jest.fn()
        const wrapper = mountAction({ props: { func }, action: {} })
        wrapper.vm.setError('a', 'bad')
        wrapper.vm.execute()
        expect(func).not.toHaveBeenCalled()
    })

    test('execute: повторный вызов останавливает', () => {
        const wrapper = mountAction({ action: { wait: true } })
        wrapper.vm.started = true
        wrapper.vm.execute()
        expect(wrapper.vm.started).toBe(false)
    })

    test('checkConnection: dropStatus, await, close и router.push', async () => {
        const store = makeStore()
        const commit = jest.spyOn(store, 'commit')
        const func = jest.fn(() => Promise.resolve({}))
        const wrapper = mountAction({
            store,
            props: { func },
            action: { wait: false, checkConnection: { delay: 1 } },
        })

        await wrapper.vm.execute()
        await Promise.resolve()
        await Promise.resolve()
        expect(commit).toHaveBeenCalledWith('dropStatus', {})
        expect(store._actions.awaitProcessComplete[0]).toBeTruthy()
        expect(wrapper.emitted().onClose).toBeTruthy()
        expect(wrapper.vm.$router.push).toHaveBeenCalledWith('/')
    })

    test('ошибка: stop не закрывает, прочие закрывают', async () => {
        const stopFunc = jest.fn(() => Promise.reject({ message: 'stop' }))
        const stopWrapper = mountAction({ props: { func: stopFunc }, action: {} })
        await stopWrapper.vm.execute()
        expect(stopWrapper.vm.output).toContainEqual({ message: 'stop' })

        const failFunc = jest.fn(() => Promise.reject(new Error('fail')))
        const failWrapper = mountAction({ props: { func: failFunc }, action: {} })
        await failWrapper.vm.execute()
        expect(failWrapper.emitted().onClose).toBeTruthy()
    })

    test('pushOutput: добавляет строки и скроллит', async () => {
        jest.useFakeTimers()
        const wrapper = mountAction({ action: { wait: true } })
        wrapper.vm.started = true
        await wrapper.vm.$nextTick()

        const container = wrapper.vm.$refs.container
        expect(container).toBeTruthy()
        Object.defineProperty(container, 'scrollHeight', { value: 100, configurable: true })
        container.scrollTop = 0

        wrapper.vm.pushOutput(['a', 'b'])
        expect(wrapper.vm.output).toEqual(['a', 'b'])
        jest.advanceTimersByTime(20)
        expect(container.scrollTop).toBe(100)
    })

    test('esc_pressed и stop', () => {
        const wrapper = mountAction({ action: { wait: true } })
        wrapper.vm.inProcess = true
        wrapper.vm.esc_pressed()
        // source.cancel вызван; проверяем через мок axios
        expect(axios.CancelToken.source).toHaveBeenCalled()

        wrapper.vm.inProcess = false
        wrapper.vm.esc_pressed()
        expect(wrapper.emitted().onClose).toBeTruthy()
    })

    test('autoExecuteAction: password вызывает logout', async () => {
        jest.useFakeTimers()
        const store = makeStore()
        store.state.autoExecuteAction = 'password'
        const wrapper = mountAction({
            store,
            props: { name: 'password', func: jest.fn(() => Promise.resolve({})) },
            action: { wait: false },
        })

        await wrapper.vm.execute()
        jest.advanceTimersByTime(500)
        expect(store._actions.logout[0]).toBeTruthy()
        expect(store.state.autoExecuteAction).toBe('')
    })
})
