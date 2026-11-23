import actions from '@/store/actions'
import initialState from '@/store/state'
import Sch from '@/utils/schema'
import router from '@/router'

import { vi } from 'vitest'
import axios from 'axios'

vi.mock('@/router', () => ({ default: { push: vi.fn() } }))
vi.mock('@/utils/session', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        idleWatchStart: vi.fn(),
        idleWatchStop: vi.fn(),
        idleBusy: vi.fn(),
    }
})

import { idleBusy, idleWatchStart, idleWatchStop } from '@/utils/session'

function makeStore() {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return {
        state,
        dispatch: vi.fn(() => Promise.resolve({})),
        commit: vi.fn(),
    }
}

function makeSch(extra = {}) {
    return new Sch({
        properties: { hostname: { type: 'string' } },
        ...extra,
    }, '/test', vi.fn().mockResolvedValue({ data: {} }))
}

describe('store/actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        axios.post.mockResolvedValue({ data: {} })
        axios.get.mockResolvedValue({ data: {} })
        axios.mockResolvedValue({ data: {} })
    })

    describe('blocker / informs / log', () => {
        test('blockerDeviceUnreachable', () => {
            const store = makeStore()
            actions.blockerDeviceUnreachable(store)
            expect(store.state.blocker).toEqual({
                text: 'device unreachable', loader: false, active: true, window: false,
            })
        })

        test('blockerAwait', () => {
            const store = makeStore()
            actions.blockerAwait(store, { text: 'wait', loader: false })
            expect(store.state.blocker.text).toBe('wait')
            expect(store.state.blocker.active).toBe(true)
            expect(store.state.blocker.loader).toBe(true)
        })

        test('pushInform / showInformer / showLog', () => {
            const store = makeStore()
            actions.pushInform(store, { text: 'x' })
            expect(store.state.informs).toEqual([{ text: 'x' }])

            actions.showInformer(store)
            expect(store.state.showInforms).toBe(true)
            actions.showInformer(store)
            expect(store.state.showInforms).toBe(false)

            actions.showLog(store, true)
            expect(store.state.showSyslog).toBe(true)
            actions.showLog(store)
            expect(store.state.showSyslog).toBe(false)
        })

        test('setPropertyValue / dropPropertyValue', () => {
            const store = makeStore()
            actions.setPropertyValue(store, { _value: 'v', name: 'n' })
            expect(store.state.selectedPropertyValue).toBe('v')
            expect(store.state.selectedPropertyName).toBe('n')

            actions.dropPropertyValue(store)
            expect(store.state.selectedPropertyValue).toBeUndefined()
            expect(store.state.selectedPropertyName).toBeUndefined()
        })
    })

    describe('ajaxPostExec / schemaActionExec', () => {
        test('ajaxPostExec подставляет токен и возвращает ответ', async () => {
            const store = makeStore()
            store.state.user.token = 'tok'
            axios.post.mockResolvedValue({ data: { ok: true } })

            const resp = await actions.ajaxPostExec(store, {
                uri: '/x',
                values: { a: 1 },
                opts: {},
            })

            expect(axios.post).toHaveBeenCalledWith('/x', { a: 1, token: 'tok' }, {})
            expect(resp.data).toEqual({ ok: true })
        })

        test('ajaxPostExec: ошибка пробрасывается', async () => {
            const store = makeStore()
            axios.post.mockRejectedValue(new Error('fail'))
            await expect(actions.ajaxPostExec(store, { uri: '/x', values: {}, opts: {} }))
                .rejects.toThrow('fail')
        })

        test('schemaActionExec собирает wrapper-запрос', async () => {
            const store = makeStore()
            axios.post.mockResolvedValue({ data: {} })
            await actions.schemaActionExec(store, {
                values: { type: 'apply', path: '/ip/interface' },
            })
            expect(store.dispatch).toHaveBeenCalledWith('ajaxPostExec', {
                uri: '/script/wrapper?apply,/ip/interface',
                values: { type: 'apply', path: '/ip/interface' },
                opts: { responseType: undefined },
            })
        })
    })

    describe('login / logout / sessionExpired', () => {
        test('login сохраняет пользователя, токен и заголовки', async () => {
            const store = makeStore()
            axios.post.mockResolvedValue({ data: { token: 'tok', timeout: 60 } })

            await actions.login(store, { username: 'admin', password: 'p' })

            expect(axios.post).toHaveBeenCalledWith('/script/auth', { username: 'admin', password: 'p' }, { auth: { username: 'admin', password: 'p' } })
            expect(store.state.user.login).toBe('admin')
            expect(store.state.user.token).toBe('tok')
            expect(axios.defaults.headers.common.Token).toBe('tok')
            expect(idleWatchStart).toHaveBeenCalledWith(60, expect.any(Function))
        })

        test('logout чистит состояние и уводит на login', () => {
            const store = makeStore()
            store.state.user.token = 'tok'
            store.state.user.login = 'admin'
            store.state.schemas = { a: 1 }
            store.state.showSyslog = true

            actions.logout(store)

            expect(axios.post).toHaveBeenCalledWith('/script/logout', { token: 'tok' })
            expect(store.state.user.token).toBeNull()
            expect(store.state.user.login).toBeNull()
            expect(store.state.schemas).toEqual({})
            expect(store.state.changes).toEqual({})
            expect(store.state.commited).toBe(true)
            expect(store.state.showSyslog).toBe(false)
            expect(idleWatchStop).toHaveBeenCalled()
            expect(router.push).toHaveBeenCalledWith('/login')
        })

        test('sessionExpired без токена ничего не делает', () => {
            const store = makeStore()
            store.state.user.token = null
            actions.sessionExpired(store, 'expired')
            expect(store.dispatch).not.toHaveBeenCalled()
        })

        test('sessionExpired с токеном показывает ошибку и разлогинивает', () => {
            const store = makeStore()
            store.state.user.token = 'tok'
            actions.sessionExpired(store, 'expired')
            expect(store.state.informs[0]).toEqual({ type: 'error', text: 'expired' })
            expect(store.dispatch).toHaveBeenCalledWith('logout')
        })
    })

    describe('схемы', () => {
        test('loadSchema создаёт Sch и кладёт в state.schemas', async () => {
            const store = makeStore()
            axios.get.mockResolvedValue({ data: { $schema: true, title: 'Test' } })

            const sch = await actions.loadSchema(store, { file: '/test' })
            expect(axios.get).toHaveBeenCalledWith('/schema//test.json')
            expect(sch).toBeInstanceOf(Sch)
            expect(store.state.schemas.test).toBe(sch)
        })

        test('loadSchema: пустой ответ и скрытая схема', async () => {
            const store = makeStore()
            axios.get.mockResolvedValue({ data: '{bad' })
            const res = await actions.loadSchema(store, { file: '/bad' })
            expect(res).toBeUndefined()
            expect(store.dispatch).toHaveBeenCalledWith('pushInform', expect.objectContaining({ type: 'error' }))

            axios.get.mockResolvedValue({ data: { title: 'Hidden' } })
            const sch = await actions.loadSchema(store, { file: '/hidden' })
            expect(sch).toBeInstanceOf(Sch)
            expect(store.commit).toHaveBeenCalledWith('setHiddenSchemas', expect.any(Array))
        })

        test('loadSchemasList: успешный список', async () => {
            const store = makeStore()
            store.state.user.login = 'admin'
            store.dispatch.mockResolvedValue(undefined)
            axios.mockResolvedValue({
                data: {
                    list: ['/a'],
                    hidden: ['/b'],
                    visible: ['/a'],
                    denied: [],
                    chpasswd_req: 0,
                },
            })

            await actions.loadSchemasList(store)

            expect(store.state.schemasList.list).toEqual(['/a'])
            expect(store.commit).toHaveBeenCalledWith('setVisibleSchemas', ['/a'])
            expect(store.commit).toHaveBeenCalledWith('setHiddenSchemas', ['/b'])
            expect(store.dispatch).toHaveBeenCalledWith('loadSchema', expect.objectContaining({ file: '/a' }))
            expect(store.dispatch).toHaveBeenCalledWith('loadSchema', expect.objectContaining({ file: '/b' }))
        })

        test('loadSchemasList: пустой список разлогинивает', async () => {
            const store = makeStore()
            store.state.user.login = 'admin'
            axios.mockResolvedValue({ data: { list: [], hidden: [] } })

            await actions.loadSchemasList(store)
            expect(store.state.informs[0].type).toBe('error')
            expect(store.dispatch).toHaveBeenCalledWith('logout')
        })

        test('loadSchemasList: ошибка устройства', async () => {
            const store = makeStore()
            store.state.user.login = 'admin'
            axios.mockRejectedValue({ response: { status: 500 } })

            await actions.loadSchemasList(store)
            expect(store.dispatch).toHaveBeenCalledWith('blockerDeviceUnreachable')
        })

        test('loadSchemasList: нет логина', async () => {
            const store = makeStore()
            const original = window.location
            delete window.location
            window.location = { hash: '', href: '' }

            await actions.loadSchemasList(store)
            expect(window.location).toBe('#/login')

            window.location = original
        })
    })

    describe('schemaCallBack', () => {
        test('@get кладёт данные в path', async () => {
            const store = makeStore()
            store.dispatch.mockResolvedValue({ data: { x: 1 } })
            const payload = {
                method: '@get',
                path: '/test',
                sch: { schema: {}, data: {} },
                action: {},
                values: {},
            }

            await actions.schemaCallBack(store, payload)
            expect(store.dispatch).toHaveBeenCalledWith('schemaActionExec', expect.objectContaining({
                values: { type: '@get', data: {}, path: '/test' },
            }))
            expect(store.commit).toHaveBeenCalledWith('setDataToPath', { path: '/test', data: { x: 1 } })
        })

        test('wait уходит в schemaCallBackAwait', () => {
            const store = makeStore()
            const payload = {
                method: 'ping',
                path: '/tools',
                sch: { schema: {}, data: {} },
                action: { wait: true },
                values: {},
            }
            actions.schemaCallBack(store, payload)
            expect(store.dispatch).toHaveBeenCalledWith('schemaCallBackAwait', expect.any(Object))
        })

        test('apply сбрасывает changes', async () => {
            const store = makeStore()
            store.dispatch.mockResolvedValue({ data: {} })
            const payload = {
                method: 'apply',
                path: '/test',
                sch: { schema: {}, data: {} },
                action: {},
                values: { _section: 'rec1' },
            }

            await actions.schemaCallBack(store, payload)
            expect(store.commit).toHaveBeenCalledWith('setChanges', { path: '/test/rec1', value: null })
        })

        test('add мержит запись и выбирает её', async () => {
            const store = makeStore()
            const sch = makeSch({ namesake: 'name' })
            sch.schema.apply = { exec: 'apply' }
            sch.data = { cfg01: { name: 'new' } }
            store.state.schemas = { test: sch }
            store.dispatch.mockResolvedValue({ data: { cfg01: { name: 'new' } } })

            const payload = {
                method: 'add',
                path: '/test',
                sch,
                action: {},
                values: {},
            }

            await actions.schemaCallBack(store, payload)
            expect(store.commit).toHaveBeenCalledWith('mergeDataToPath', {
                path: '/test',
                data: { cfg01: { name: 'new', _edited: true } },
            })
            expect(store.commit).toHaveBeenCalledWith('setChanges', { path: '/test/cfg01', value: true })
            expect(store.dispatch).toHaveBeenCalledWith('setPropertyValue', { _value: 'cfg01', name: 'new' })
        })

        test('ошибка показывает inform, но не падает', async () => {
            const store = makeStore()
            store.dispatch.mockImplementation((type) => type === 'schemaActionExec'
                ? Promise.reject({
                    response: { status: 500, data: 'boom' },
                    config: { data: JSON.stringify({ path: '/test', type: 'apply' }) },
                })
                : Promise.resolve({}))
            const payload = {
                method: 'apply',
                path: '/test',
                sch: { schema: {}, data: {} },
                action: {},
                values: {},
            }

            // schemaCallBack возвращает исходный rejected promise, но свой catch уже повесил
            await expect(actions.schemaCallBack(store, payload)).rejects.toBeDefined()
            for (let i = 0; i < 5; i++)
                await Promise.resolve()
            expect(store.dispatch).toHaveBeenCalledWith('pushInform', { text: '/test/apply => boom', type: 'error' })
        })
    })

    describe('schemaCallBackAwait', () => {
        test('читает поток и отдаёт строки', async () => {
            const store = makeStore()
            const output = vi.fn()
            const source = { token: 'cancel' }
            axios.mockResolvedValue({ data: 'ok' })

            const payload = {
                values: {
                    type: 'ping',
                    path: '/tools',
                    data: { _options: { output, source } },
                },
                action: { args: ['run'] },
                sch: { schema: {}, data: {} },
            }

            const promise = actions.schemaCallBackAwait(store, payload)
            const cfg = axios.mock.calls[0][0]

            expect(cfg.url).toBe('/script/wrapper?ping')
            expect(cfg.cancelToken).toBe('cancel')
            cfg.onDownloadProgress({ currentTarget: { response: 'line1\nline2\n' } })

            await promise
            expect(output).toHaveBeenCalledWith(['line1', 'line2'])
            expect(idleBusy).toHaveBeenCalledWith(1)
            expect(idleBusy).toHaveBeenCalledWith(-1)
        })
    })

    describe('cue / upload / commit / dashboard / status', () => {
        test('cueRequest успешный и с ошибкой', async () => {
            const store = makeStore()
            store.dispatch.mockResolvedValue({ data: { enum: ['a'] } })

            const res = await actions.cueRequest(store, { path: '/test', data: ['+a'] })
            expect(res.data.enum).toEqual(['a'])

            store.dispatch.mockImplementation((type) => type === 'schemaActionExec'
                ? Promise.reject({ response: { status: 500, data: 'boom' } })
                : Promise.resolve({}))
            const failed = await actions.cueRequest(store, { path: '/test', data: ['+a'] })
            expect(failed.data.enum).toEqual([])
            expect(store.dispatch).toHaveBeenCalledWith('pushInform', expect.objectContaining({ type: 'error' }))
        })

        test('uploadToTemp: успех и ошибка', async () => {
            vi.useFakeTimers()
            const store = makeStore()
            const sch = makeSch()
            sch.acquire = vi.fn()
            store.state.schemas = { storage: { file: sch } }
            axios.post.mockResolvedValue({})

            await actions.uploadToTemp(store, { files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })
            vi.advanceTimersByTime(500)
            expect(sch.acquire).toHaveBeenCalledWith('force')

            axios.post.mockRejectedValue({ response: { data: 'no' } })
            await actions.uploadToTemp(store, { files: [] })
            expect(store.dispatch).toHaveBeenCalledWith('pushInform', expect.objectContaining({ type: 'error' }))
            vi.useRealTimers()
        })

        test('revertAll и commitAll', async () => {
            const store = makeStore()
            axios.post.mockResolvedValue({})

            actions.revertAll(store)
            for (let i = 0; i < 10; i++) await Promise.resolve()
            expect(axios.post).toHaveBeenCalledWith('/script/wrapper?revert', {
                type: 'revert', path: '/system/config', token: null,
            })
            expect(store.state.changes).toEqual({})
            expect(store.dispatch).toHaveBeenCalledWith('loadSchemasList')

            axios.post.mockClear()
            actions.commitAll(store)
            for (let i = 0; i < 10; i++) await Promise.resolve()
            expect(axios.post).toHaveBeenCalledWith('/script/wrapper?commit', {
                type: 'commit', path: '/system/config', token: null,
            })
            expect(store.state.commited).toBe(true)
        })

        test('makeReqDashboard обновляет board info', async () => {
            const store = makeStore()
            axios.post.mockResolvedValue({
                data: [{
                    label: 'device',
                    items: [{
                        label: 'board',
                        items: [{ label: 'model', value: 'R50' }],
                    }],
                }],
            })

            const res = await actions.makeReqDashboard(store)
            expect(res).toHaveLength(1)
            expect(store.commit).toHaveBeenCalledWith('updateBoardInfo', { board: { model: 'R50' } })
        })

        test('makeReqDashboard: ошибка возвращается', async () => {
            const store = makeStore()
            axios.post.mockRejectedValue(new Error('fail'))
            const res = await actions.makeReqDashboard(store)
            expect(res).toBeInstanceOf(Error)
        })

        test('setStatusModel обновляет строку', () => {
            const store = makeStore()
            store.state.status.model = [
                { name: 'a', state: 1 },
                { name: 'b', state: 2 },
            ]

            actions.setStatusModel(store, { path: '/x', section: 'a', option: 'state', value: 9 })
            expect(store.state.status.model[0].state).toBe(9)
            expect(store.state.status.model[1].state).toBe(2)

            store.state.status.model = undefined
            actions.setStatusModel(store, { path: '/x', section: 'a', option: 'state', value: 9 })
            actions.setStatusModel(store, { section: 'a', option: 'state', value: 9 })
        })
    })
})
