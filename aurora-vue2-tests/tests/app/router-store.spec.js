import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'

import App from '@/App.vue'
import router from '@/router'
import store from '@/store'

Vue.use(Vuex)

function makeStore() {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({ state, mutations, getters })
}

describe('App', () => {
    test('blockerText', () => {
        const wrapper = shallowMount(App, {
            store: makeStore(),
            stubs: { 'router-view': true },
        })
        expect(wrapper.vm.blockerText).toEqual([])

        wrapper.vm.$store.state.blocker.loader = true
        expect(wrapper.vm.blockerText).toEqual(['loading'])

        wrapper.vm.$store.state.blocker.text = 'hello'
        expect(wrapper.vm.blockerText).toEqual(['hello'])

        wrapper.vm.$store.state.blocker.text = ['a', 'b']
        expect(wrapper.vm.blockerText).toEqual(['a', 'b'])
    })

    test('рендер блокера и сообщений', () => {
        const wrapper = shallowMount(App, {
            store: makeStore(),
            stubs: { 'router-view': true },
        })
        wrapper.vm.$store.state.blocker.active = true
        wrapper.vm.$store.state.blocker.window = true
        wrapper.vm.$store.state.blocker.loader = true
        wrapper.vm.$store.state.blocker.text = ['one', 'two']

        return wrapper.vm.$nextTick().then(() => {
            expect(wrapper.find('.blocker.window').exists()).toBe(true)
            expect(wrapper.find('.nuclear').exists()).toBe(true)
            expect(wrapper.findAll('.message').length).toBe(2)
        })
    })
})

describe('router', () => {
    test('маршруты login и main', () => {
        expect(router.options.routes).toHaveLength(2)
        expect(router.options.routes[0].path).toBe('/login')
        expect(router.options.routes[0].name).toBe('login')
        expect(router.options.routes[1].path).toBe('/*')
        expect(router.options.routes[1].name).toBe('main')

        expect(router.resolve('/login').route.name).toBe('login')
        expect(router.resolve('/ip/interface').route.name).toBe('main')
    })
})

describe('store/index: interceptor сессии', () => {
    test('session error разлогинивает, прочие — нет', async () => {
        const handlers = axios.interceptors.response.handlers
        expect(handlers).toBeTruthy()
        const rejected = handlers[0].rejected
        const dispatch = jest.spyOn(store, 'dispatch').mockResolvedValue(undefined)

        await expect(rejected({
            response: { status: 401 },
            config: { url: '/script/wrapper?@get' },
        })).rejects.toBeTruthy()
        expect(dispatch).toHaveBeenCalledWith('sessionExpired')

        dispatch.mockClear()
        await expect(rejected({
            response: { status: 404 },
            config: { url: '/script/wrapper?@get' },
        })).rejects.toBeTruthy()
        expect(dispatch).not.toHaveBeenCalledWith('sessionExpired')
    })
})
