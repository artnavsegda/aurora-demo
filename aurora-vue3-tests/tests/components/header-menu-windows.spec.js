import { vi } from 'vitest'
import { reactive } from 'vue'
import { createStore } from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

import Header from '@/components/Header.vue'
import Menu from '@/components/Menu.vue'
import PopUpWindow from '@/components/PopUpWindow.vue'
import DialogWindow from '@/components/windows/DialogWindow.vue'
import FileUploadWindow from '@/components/windows/FileUploadWindow.vue'

function makeStore(actions = {}) {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return createStore({
        state,
        mutations,
        getters,
        actions: {
            logout: vi.fn(),
            revertAll: vi.fn(),
            commitAll: vi.fn(),
            showInformer: vi.fn(),
            showLog: vi.fn(),
            setPropertyValue: (ctx, payload) => {
                ctx.state.selectedPropertyValue = payload._value
                ctx.state.selectedPropertyName = payload.name
            },
            dropPropertyValue: (ctx) => {
                ctx.state.selectedPropertyValue = undefined
                ctx.state.selectedPropertyName = undefined
            },
            uploadToTemp: vi.fn(() => Promise.resolve({})),
            awaitProcessComplete: vi.fn(() => Promise.resolve({})),
            ...actions,
        },
    })
}

function makeSch(extra = {}) {
    return new Sch({
        properties: { hostname: { type: 'string' } },
        ...extra,
    }, '/test', vi.fn().mockResolvedValue({ data: {} }))
}

describe('components: Header, Menu, окна', () => {
    describe('Header', () => {
        test('boardModel, currentPath, login-путь', () => {
            const store = makeStore()
            store.state.user.login = 'admin'
            store.state.info = { board: { model: 'R50' } }
            store.state.selectedPropertyName = 'rec1'

            const route = reactive({ path: '/ip/interface' })
            const wrapper = shallowMount(Header, {
                global: { plugins: [store], mocks: { $route: route, $router: { push: vi.fn() } } },
            })

            expect(wrapper.vm.infoAvailable).toBe(true)
            expect(wrapper.vm.boardModel).toBe('R50')
            expect(wrapper.vm.navPath).toEqual(['ip', 'interface'])
            expect(wrapper.vm.currentPath).toEqual(['ip', 'interface', 'rec1'])

            route.path = '/login'
            expect(wrapper.vm.currentPath).toEqual([])
        })

        test('goToRoot и goTo', () => {
            const store = makeStore()
            const router = { push: vi.fn() }
            const sch = makeSch()
            sch.acquire = vi.fn()
            store.state.schemas = { ip: sch }
            store.state.selectedPropertyName = ''

            const wrapper = shallowMount(Header, {
                global: { plugins: [store], mocks: { $route: { path: '/ip' }, $router: router } },
            })

            wrapper.vm.goToRoot()
            expect(store.state.selectedPropertyName).toBeUndefined()
            expect(store.state.selectedPropertyValue).toBeUndefined()
            expect(router.push).toHaveBeenCalledWith('/')

            wrapper.vm.goTo(0)
            expect(sch.acquire).toHaveBeenCalledWith(true)
            expect(router.push).toHaveBeenCalledWith('/ip')
        })

        test('гоTo не срабатывает для текущего selectedPropertyName', () => {
            const store = makeStore()
            const router = { push: vi.fn() }
            store.state.selectedPropertyName = 'ip'
            const wrapper = shallowMount(Header, {
                global: { plugins: [store], mocks: { $route: { path: '/ip' }, $router: router } },
            })
            wrapper.vm.goTo(0)
            expect(router.push).not.toHaveBeenCalled()
        })

        test('кнопки commit/revert/logout уходят в actions', () => {
            const store = makeStore()
            store.state.user.login = 'admin'
            const dispatch = vi.spyOn(store, 'dispatch')
            const wrapper = shallowMount(Header, {
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })

            wrapper.vm.commitAll()
            wrapper.vm.revertAll()
            wrapper.vm.logout()
            expect(dispatch).toHaveBeenCalledWith('commitAll')
            expect(dispatch).toHaveBeenCalledWith('revertAll')
            expect(dispatch).toHaveBeenCalledWith('logout')
        })
    })

    describe('Menu', () => {
        test('sortedLinks и showMenuWithSchema', () => {
            const store = makeStore()
            const sch = makeSch()
            store.state.schemas = { ip: { interface: sch } }
            store.state.schemasList = { list: ['/ip/interface'] }
            const route = reactive({ path: '/' })

            const wrapper = shallowMount(Menu, {
                global: { plugins: [store], mocks: { $route: route, $router: { push: vi.fn() } } },
            })

            expect(wrapper.vm.path).toEqual([])
            expect(wrapper.vm.sortedLinks).toEqual(['ip'])
            expect(wrapper.vm.showMenuWithSchema).toBe(true)

            route.path = '/ip/interface'
            expect(wrapper.vm.showMenuWithSchema).toBe(false)
            expect(wrapper.vm.sortedLinks).toEqual([])
        })

        test('sortedLinks не падает до загрузки schemasList', () => {
            const store = makeStore()
            store.state.schemas = {}
            store.state.schemasList = {}
            const wrapper = shallowMount(Menu, {
                global: { plugins: [store], mocks: { $route: reactive({ path: '/' }), $router: { push: vi.fn() } } },
            })
            expect(wrapper.vm.sortedLinks).toEqual([])
        })

        test('goTo: папка, схема, скрытая схема, отсутствующий путь', async () => {
            const store = makeStore()
            const sch = makeSch()
            sch.acquire = vi.fn(() => Promise.resolve())
            const hidden = makeSch({ hidden: true })
            hidden.schema.hidden = true
            const router = { push: vi.fn() }
            store.state.schemas = { ip: { interface: sch }, hidden }
            store.state.schemasList = { list: ['/ip/interface', '/hidden'] }
            const route = reactive({ path: '/' })

            const wrapper = shallowMount(Menu, {
                global: { plugins: [store], mocks: { $route: route, $router: router } },
            })

            wrapper.vm.goTo('ip')
            expect(router.push).toHaveBeenCalledWith('/ip')

            router.push.mockClear()
            wrapper.vm.goTo('hidden')
            expect(router.push).toHaveBeenCalledWith('/')

            router.push.mockClear()
            wrapper.vm.goTo('missing')
            expect(router.push).toHaveBeenCalledWith('/')

            // схема с patternProperties пушится сразу
            router.push.mockClear()
            route.path = '/ip'
            wrapper.vm.goTo('interface')
            await Promise.resolve()
            expect(router.push).toHaveBeenCalledWith('/ip/interface')
        })

        test('goBack', () => {
            const store = makeStore()
            const router = { push: vi.fn() }
            store.state.selectedPropertyValue = ''
            const route = reactive({ path: '/ip/interface' })
            const wrapper = shallowMount(Menu, {
                global: { plugins: [store], mocks: { $route: route, $router: router } },
            })

            wrapper.vm.goBack()
            expect(router.push).toHaveBeenCalledWith('/ip')

            store.state.selectedPropertyValue = 'rec1'
            wrapper.vm.goBack()
            expect(store.state.selectedPropertyValue).toBeUndefined()
        })

        test('drag/drop: файлы и ошибка', () => {
            vi.useFakeTimers()
            const store = makeStore()
            const dispatch = vi.spyOn(store, 'dispatch')
            const wrapper = shallowMount(Menu, {
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })

            const event = (files) => ({
                dataTransfer: { dropEffect: '', files: files || [] },
                stopPropagation: vi.fn(),
                preventDefault: vi.fn(),
            })

            const over = event()
            wrapper.vm.dragOver(over)
            expect(over.dataTransfer.dropEffect).toBe('copy')
            expect(wrapper.vm.dragStart).toBe(true)

            wrapper.vm.dragLeave(event())
            expect(wrapper.vm.dragStart).toBe(false)

            const files = [{ name: 'a.txt' }]
            wrapper.vm.dropContent(event(files))
            expect(dispatch).toHaveBeenCalledWith('uploadToTemp', { files })

            wrapper.vm.dropContent(event([]))
            expect(wrapper.vm.dragError).toBe(true)
            vi.advanceTimersByTime(2000)
            expect(wrapper.vm.dragError).toBe(false)
            vi.useRealTimers()
        })
    })

    describe('PopUpWindow', () => {
        test('выбор типа окна', async () => {
            const store = makeStore()
            const wrapper = shallowMount(PopUpWindow, {
                props: {
                    action: {},
                    schema: {},
                    func: vi.fn(() => Promise.resolve()),
                },
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })
            expect(wrapper.vm.isDialog).toBeFalsy()
            expect(wrapper.vm.isSchema).toBeFalsy()
            expect(wrapper.vm.isFileUpload).toBeFalsy()
            expect(wrapper.vm.type).toBeUndefined()

            await wrapper.setProps({ action: { confirm: true } })
            expect(wrapper.vm.isDialog).toBe(true)
            expect(wrapper.vm.type).toBeTruthy()

            await wrapper.setProps({ action: { wait: true }, schema: {} })
            expect(wrapper.vm.isSchema).toBe(true)

            await wrapper.setProps({ action: { fileUpload: true }, schema: {} })
            expect(wrapper.vm.isFileUpload).toBe(true)
        })

        test('beforeMount/close управляют blocker', () => {
            const store = makeStore()
            const wrapper = shallowMount(PopUpWindow, {
                props: { action: { confirm: true }, schema: {}, func: vi.fn() },
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })
            expect(store.state.blocker.active).toBe(true)
            expect(store.state.blocker.window).toBe(true)

            wrapper.vm.close()
            expect(store.state.blocker.active).toBe(false)
            expect(store.state.blocker.window).toBe(false)
            expect(wrapper.emitted().onClose).toBeTruthy()
        })
    })

    describe('DialogWindow', () => {
        test('description', async () => {
            const store = makeStore()
            const wrapper = shallowMount(DialogWindow, {
                props: {
                    action: { confirm: true, description: 'Sure' },
                    path: ['ip', 'interface'],
                    func: vi.fn(),
                },
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })
            expect(wrapper.vm.description).toBe('Sure?')

            await wrapper.setProps({ action: { confirm: 'Custom?' } })
            expect(wrapper.vm.description).toBe('Custom?')
        })

        test('execute и close', async () => {
            const store = makeStore()
            const func = vi.fn(() => Promise.resolve({}))
            const wrapper = shallowMount(DialogWindow, {
                props: {
                    action: {},
                    path: ['ip', 'interface'],
                    section: { _value: 'rec1' },
                    func,
                },
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })

            await wrapper.vm.execute()
            expect(func).toHaveBeenCalledWith({ _section: 'rec1' })
            expect(wrapper.emitted().onClose).toBeTruthy()

            wrapper.vm.close()
            expect(wrapper.emitted().onClose.length).toBe(2)
        })
    })

    describe('FileUploadWindow', () => {
        test('fileChosen и execute', async () => {
            const store = makeStore()
            const dispatch = vi.spyOn(store, 'dispatch')
            const wrapper = shallowMount(FileUploadWindow, {
                props: { action: {}, path: ['storage', 'file'], func: vi.fn() },
                global: { plugins: [store], mocks: { $route: { path: '/' }, $router: { push: vi.fn() } } },
            })

            const files = [{ name: 'a.txt' }, { name: 'b.txt' }]
            wrapper.vm.fileChosen({ target: { files } })
            expect(wrapper.vm.files).toEqual(files)

            wrapper.vm.execute()
            await Promise.resolve()
            await Promise.resolve()
            expect(dispatch).toHaveBeenCalledWith('uploadToTemp', { files })
            expect(wrapper.vm.files).toEqual([])
            expect(wrapper.emitted().onClose).toBeTruthy()
        })
    })
})
