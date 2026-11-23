import Vue from 'vue'
import Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

import Login from '@/views/Login.vue'
import Main from '@/views/Main.vue'

Vue.use(Vuex)

function makeStore(actions = {}) {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({
        state,
        mutations,
        getters,
        actions: {
            login: jest.fn(() => Promise.resolve({ data: { token: 'tok' } })),
            loadSchemasList: jest.fn(),
            makeReqDashboard: jest.fn(() => Promise.resolve([{ label: 'device', items: [] }])),
            chpasswd_require: jest.fn(),
            dropPropertyValue: jest.fn(),
            setPropertyValue: jest.fn(),
            ...actions,
        },
    })
}

function makeSch(extra = {}) {
    return new Sch({
        properties: { hostname: { type: 'string' } },
        ...extra,
    }, '/test', jest.fn().mockResolvedValue({ data: {} }))
}

describe('views/Login', () => {
    test('пустой username', () => {
        const store = makeStore()
        const dispatch = jest.spyOn(store, 'dispatch')
        const wrapper = shallowMount(Login, {
            store,
            mocks: { $router: { push: jest.fn() } },
        })
        wrapper.vm.username = ''
        wrapper.vm.execute()
        expect(wrapper.vm.error).toBe(true)
        expect(wrapper.vm.errorMessage).toBe('Username required')
        expect(dispatch).not.toHaveBeenCalledWith('login', expect.anything())
    })

    test('успешный вход ведёт на /', async () => {
        const store = makeStore()
        const router = { push: jest.fn() }
        const wrapper = shallowMount(Login, {
            store,
            mocks: { $router: router },
        })
        wrapper.vm.username = 'admin'
        wrapper.vm.password = 'p'
        wrapper.vm.login = jest.fn(() => Promise.resolve({ data: { token: 'tok' } }))
        await wrapper.vm.$nextTick()
        await wrapper.vm.execute()
        expect(wrapper.vm.login).toHaveBeenCalledWith({ username: 'admin', password: 'p' })
        expect(router.push).toHaveBeenCalledWith('/')
    })

    test('401 и прочие ошибки', async () => {
        const store = makeStore({
            login: jest.fn(() => Promise.reject({ response: { status: 401 } })),
        })
        const wrapper = shallowMount(Login, {
            store,
            mocks: { $router: { push: jest.fn() } },
        })
        wrapper.vm.username = 'admin'
        await wrapper.vm.$nextTick()
        await wrapper.vm.execute()
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.error).toBe(true)
        expect(wrapper.vm.errorMessage).toBe('Invalid username or password')

        const store500 = makeStore({
            login: jest.fn(() => Promise.reject({ response: { status: 500 } })),
        })
        const wrapper500 = shallowMount(Login, {
            store: store500,
            mocks: { $router: { push: jest.fn() } },
        })
        wrapper500.vm.username = 'admin'
        await wrapper500.vm.$nextTick()
        await wrapper500.vm.execute()
        await wrapper500.vm.$nextTick()
        expect(wrapper500.vm.errorMessage).toBe('')
    })

    test('determineType, dynamicID, watchers сбрасывают ошибку', async () => {
        const wrapper = shallowMount(Login, {
            store: makeStore(),
            mocks: { $router: { push: jest.fn() } },
        })
        expect(wrapper.vm.determineType).toBe('password')
        wrapper.vm.showPassword = true
        expect(wrapper.vm.determineType).toBe('text')
        expect(wrapper.vm.dynamicID()).toMatch(/^_dynamicID_/)

        wrapper.vm.error = true
        wrapper.vm.username = 'x'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.error).toBe(false)
        wrapper.vm.error = true
        wrapper.vm.password = 'x'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.error).toBe(false)
    })
})

describe('views/Main', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    test('created/mounted: loadSchemasList и dashboard', async () => {
        jest.useFakeTimers()
        const store = makeStore()
        store.state.user.login = 'admin'
        const dispatch = jest.spyOn(store, 'dispatch')
        const wrapper = shallowMount(Main, {
            store,
            mocks: { $route: { path: '/' }, $router: { push: jest.fn() } },
        })

        expect(dispatch).toHaveBeenCalledWith('loadSchemasList')
        jest.advanceTimersByTime(500)
        await Promise.resolve()
        await Promise.resolve()
        expect(dispatch).toHaveBeenCalledWith('makeReqDashboard')
        expect(wrapper.vm.dashboard).toEqual([{ label: 'device', items: [] }])

        wrapper.vm.stopDashboard()
        wrapper.destroy()
    })

    test('path, schemaAvail, schemaType', () => {
        const wrapper = shallowMount(Main, {
            store: makeStore(),
            mocks: { $route: { path: '/ip/interface' }, $router: { push: jest.fn() } },
        })
        expect(wrapper.vm.path).toEqual(['ip', 'interface'])
        expect(wrapper.vm.schemaAvail).toBe(false)
        expect(wrapper.vm.schemaType).toBeTruthy()

        wrapper.vm.schema = { title: 'x' }
        expect(wrapper.vm.schemaAvail).toBe(true)
    })

    test('loadLeaf: схема, acquire и отсутствующий путь', () => {
        const store = makeStore()
        const sch = makeSch()
        sch.acquire = jest.fn()
        store.state.schemas = { test: sch }
        const wrapper = shallowMount(Main, {
            store,
            mocks: { $route: { path: '/test' }, $router: { push: jest.fn() } },
        })

        wrapper.vm.loadLeaf('/test')
        expect(wrapper.vm.schema).toEqual(JSON.parse(JSON.stringify(sch.schema)))
        expect(sch.acquire).toHaveBeenCalled()

        wrapper.vm.loadLeaf('missing')
        expect(wrapper.vm.schema).toEqual({})
    })

    test('watch $route.path: валидный, отсутствующий и скрытый путь', () => {
        const store = makeStore()
        const dispatch = jest.spyOn(store, 'dispatch')
        const sch = makeSch()
        store.state.schemas = { test: sch }
        const router = { push: jest.fn() }
        const wrapper = shallowMount(Main, {
            store,
            mocks: { $route: { path: '/' }, $router: router },
        })
        const handler = wrapper.vm.$options.watch['$route.path']

        wrapper.vm.$route.path = '/test'
        handler.call(wrapper.vm, '/test')
        expect(dispatch).toHaveBeenCalledWith('dropPropertyValue')
        expect(wrapper.vm.schema).toBeTruthy()

        router.push.mockClear()
        wrapper.vm.$route.path = '/missing'
        handler.call(wrapper.vm, '/missing')
        expect(router.push).toHaveBeenCalledWith('/')

        const hidden = makeSch()
        hidden.schema.hidden = true
        store.state.schemas = { hidden }
        router.push.mockClear()
        wrapper.vm.$route.path = '/hidden'
        handler.call(wrapper.vm, '/hidden')
        expect(router.push).toHaveBeenCalledWith('/')
    })

    test('loadDashboard: пропуск при открытой схеме и без логина', async () => {
        jest.useFakeTimers()
        const store = makeStore()
        store.state.user.login = null
        const dispatch = jest.spyOn(store, 'dispatch')
        const wrapper = shallowMount(Main, {
            store,
            mocks: { $route: { path: '/' }, $router: { push: jest.fn() } },
        })
        wrapper.vm.schema = { title: 'x' }
        wrapper.vm.loadDashboard()
        expect(dispatch).not.toHaveBeenCalledWith('makeReqDashboard')

        wrapper.vm.schema = {}
        wrapper.vm.loadDashboard()
        await Promise.resolve()
        await Promise.resolve()
        expect(dispatch).not.toHaveBeenCalledWith('makeReqDashboard') // нет login

        store.state.user.login = 'admin'
        wrapper.vm.loadDashboard()
        await Promise.resolve()
        await Promise.resolve()
        expect(dispatch).toHaveBeenCalledWith('makeReqDashboard')

        wrapper.vm.stopDashboard()
        wrapper.destroy()
    })

    test('beforeDestroy останавливает dashboard и чистит schema', () => {
        jest.useFakeTimers()
        const wrapper = shallowMount(Main, {
            store: makeStore(),
            mocks: { $route: { path: '/' }, $router: { push: jest.fn() } },
        })
        wrapper.vm.schema = { title: 'x' }
        wrapper.destroy()
        expect(wrapper.vm.schema).toEqual({})
    })
})
