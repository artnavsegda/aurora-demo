import { vi } from 'vitest'
import { createStore } from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

import Schema from '@/components/Schema.vue'

function makeStore() {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return createStore({
        state,
        mutations,
        getters,
        actions: {
            setPropertyValue: (ctx, payload) => {
                ctx.state.selectedPropertyValue = payload._value
                ctx.state.selectedPropertyName = payload.name
            },
            dropPropertyValue: (ctx) => {
                ctx.state.selectedPropertyValue = undefined
                ctx.state.selectedPropertyName = undefined
            },
            pushInform: vi.fn(),
            setStatusModel: vi.fn(),
        },
    })
}

function makeSch(extra = {}) {
    const schema = {
        patternProperties: {
            '.*': {
                properties: {
                    name: { type: 'string' },
                    state: { type: 'string' },
                    disabled: { type: 'boolean', default: false },
                },
            },
            actions: {
                ping: { exec: vi.fn(), wait: true },
                hidden: { exec: vi.fn(), hidden: true },
            },
        },
        showParams: ['name', 'state'],
        namesake: 'name',
        actions: {
            global: { exec: vi.fn(), title: 'Global' },
            hidden: { exec: vi.fn(), hidden: true },
        },
        status: { exec: 'status' },
        apply: { exec: 'apply' },
        delete: { exec: 'delete' },
        reorder: { exec: 'reorder' },
        ...extra,
    }
    const sch = new Sch(schema, '/test', vi.fn().mockResolvedValue({ data: {} }))
    sch.data = {
        rec1: { name: 'one', state: 4, _state: 4, disabled: '0' },
        rec2: { name: 'two', state: 8, _dynamic: 1 },
    }
    return sch
}

function mountSchema({ sch = makeSch(), store = makeStore(), props = {} } = {}) {
    store.state.schemas = { test: sch }
    const wrapper = shallowMount(Schema, {
        global: { plugins: [store], mocks: { $route: { path: '/test' }, $router: { push: vi.fn() } } },
        props: { schema: sch.schema, ...props },
    })
    return { wrapper, sch, store }
}

describe('components/Schema', () => {
    test('path, externalClasses, флаги схемы', () => {
        const { wrapper } = mountSchema()
        expect(wrapper.vm.path).toEqual(['test'])
        expect(wrapper.vm.externalClasses).toEqual(['test'])
        expect(wrapper.vm.hasPatternProperties).toBe(true)
        expect(wrapper.vm.hasActions).toBe(false)
        expect(wrapper.vm.hasReorder).toBe(true)
        expect(wrapper.vm.hasDelete).toBe(true)
        expect(wrapper.vm.hasDisable).toBe(true)
        expect(wrapper.vm.hasErrors).toBe(false)
    })

    test('showParams: name/state + showParams + status model', () => {
        const store = makeStore()
        store.state.status.model = [{ name: 'rec1', state: 5, uptime: '1h' }]
        const { wrapper } = mountSchema({ store })
        expect(wrapper.vm.showParams).toEqual(['name', 'state', 'uptime'])
        expect(wrapper.vm.showParams).toContain('uptime')
    })

    test('patternProperties: элементы, state2str и поиск', () => {
        const { wrapper } = mountSchema()
        const list = wrapper.vm.patternProperties
        expect(list.map((x) => x.name)).toEqual(['one', 'two'])
        expect(list[0]._params.state).toBe(' S')
        expect(list[1]._dynamic).toBe(1)

        wrapper.vm.searchText = 'two'
        const filtered = wrapper.vm.patternProperties
        expect(filtered.filter((x) => !x.hidden).map((x) => x.name)).toEqual(['two'])
    })

    test('currentSection и zItems', () => {
        const store = makeStore()
        store.state.selectedPropertyValue = 'rec1'
        const { wrapper, sch } = mountSchema({ store })
        expect(wrapper.vm.currentSection._value).toBe('rec1')
        expect(wrapper.vm.currentSection._pattern).toBe('.*')
        expect(wrapper.vm.zItems).toBeTruthy()
        expect(wrapper.vm.zItems.name).toBe('one')

        store.state.selectedPropertyValue = undefined
        expect(wrapper.vm.zItems).toEqual({})
    })

    test('zSchema: pattern -> properties записи, required и readOnly', () => {
        const store = makeStore()
        store.state.selectedPropertyValue = 'rec1'
        const sch = makeSch()
        sch.schema.required = ['name']
        const { wrapper } = mountSchema({ store, sch })

        const z = wrapper.vm.zSchema
        expect(z.patternProperties).toBeUndefined()
        expect(z.actions).toBeUndefined()
        expect(z.properties.name).toBeTruthy()
        expect(z.properties.name.isRequired).toBe(true)
        expect(wrapper.vm.zSchemaVisibleProperties).toBe(true)
        expect(wrapper.vm.isRequired('name')).toBe(true)
        expect(wrapper.vm.isRequired('state')).toBe(false)
    })

    test('zActions: скрывает hidden и status, sectionActions для записи', () => {
        const store = makeStore()
        const { wrapper } = mountSchema({ store })
        const actions = wrapper.vm.zActions
        expect(actions.global).toBeTruthy()
        expect(actions.hidden).toBeUndefined()
        expect(actions.status).toBeUndefined()
        expect(actions.apply).toBeTruthy()

        store.state.selectedPropertyValue = 'rec1'
        const sectionActions = wrapper.vm.zActions
        expect(sectionActions.ping).toBeTruthy()
        expect(sectionActions.hidden).toBeUndefined()
    })

    test('getState, sorterClass, setSorter, actionBtnIcon', () => {
        const { wrapper } = mountSchema()
        expect(wrapper.vm.getState({ _params: { state: 'X' } })).toBe('disabled')
        expect(wrapper.vm.getState({ _params: { state: 'E' } })).toBe('error')
        expect(wrapper.vm.getState({ _params: { state: ' D' } })).toBe('dynamic')
        expect(wrapper.vm.getState({ _params: { state: 'R' } })).toBe('running')
        expect(wrapper.vm.getState({ _params: { state: ' ' } })).toBe('')

        wrapper.vm.sortBy = 'name'
        expect(wrapper.vm.sorterClass('name')).toBe('pos-sortBy')
        expect(wrapper.vm.sorterClass('-name')).toBe('')
        wrapper.vm.setSorter('name')
        expect(wrapper.vm.sortBy).toBe('-name')
        wrapper.vm.sortBy = 'name'
        wrapper.vm.setSorter('-name')
        expect(wrapper.vm.sortBy).toBe('-name')

        expect(wrapper.vm.actionBtnIcon('apply')).toBe('ei:check')
        expect(wrapper.vm.actionBtnIcon('add')).toBe('ei:plus')
        expect(wrapper.vm.actionBtnIcon('delete')).toBe('ei:minus')
        expect(wrapper.vm.actionBtnIcon('clean')).toBe('ei:trash')
        expect(wrapper.vm.actionBtnIcon('close')).toBe('ei:close-o')
        expect(wrapper.vm.actionBtnIcon('revert')).toBe('ei:undo')
        expect(wrapper.vm.actionBtnIcon('download')).toBe('ei:arrow-down')
        expect(wrapper.vm.actionBtnIcon('edit')).toBe('ei:pencil')
        expect(wrapper.vm.actionBtnIcon('view')).toBe('ei:eye')
        expect(wrapper.vm.actionBtnIcon('other')).toBe('ei:play')
    })

    test('showActionWindow блокирует apply при ошибках', () => {
        const store = makeStore()
        const dispatch = vi.spyOn(store, 'dispatch')
        const { wrapper } = mountSchema({ store })
        const action = { exec: vi.fn(), schema: { properties: {} } }

        wrapper.vm.errors = { name: 'bad' }
        wrapper.vm.showActionWindow('apply', action)
        expect(wrapper.vm.actionObject).toBeUndefined()
        expect(dispatch).toHaveBeenCalledWith('pushInform', expect.objectContaining({ type: 'error' }))

        wrapper.vm.errors = {}
        wrapper.vm.showActionWindow('apply', action)
        expect(wrapper.vm.actionObject.name).toBe('apply')
    })

    test('disableEntry переключает disabled и _state', async () => {
        const store = makeStore()
        const { wrapper, sch } = mountSchema({ store })
        sch.set = vi.fn(() => Promise.resolve({}))
        sch.apply = vi.fn()
        sch._edited = true
        sch.data.rec1.disabled = '0'
        sch.data.rec1._state = 4

        wrapper.vm.disableEntry('rec1')
        expect(sch.data.rec1._state).toBe(6)
        expect(sch.set).toHaveBeenCalledWith(expect.objectContaining({
            _section: 'rec1',
            _option: 'disabled',
            _value: true,
        }))
        await Promise.resolve()
        expect(sch.apply).toHaveBeenCalledWith({ _section: 'rec1' })

        // динамическую запись не трогаем
        sch.data.rec2._dynamic = 1
        sch.set.mockClear()
        wrapper.vm.disableEntry('rec2')
        expect(sch.set).not.toHaveBeenCalled()
    })

    test('showActionWindow/closeActionWindow и hasChanges', () => {
        const store = makeStore()
        const { wrapper } = mountSchema({ store })
        wrapper.vm.showActionWindow('ping', { exec: vi.fn(), schema: { properties: {} }, action: { wait: true } })
        expect(wrapper.vm.actionObject.name).toBe('ping')
        expect(wrapper.vm.actionObject.action.wait).toBe(true)

        store.state.blocker.active = true
        wrapper.vm.closeActionWindow()
        expect(wrapper.vm.actionObject).toBeUndefined()
        expect(store.state.blocker.active).toBe(false)

        store.state.changes['/test/rec1'] = true
        expect(wrapper.vm.hasChanges('rec1')).toBe(true)
    })

    test('errorUpdate и hasErrors', async () => {
        const { wrapper } = mountSchema()
        wrapper.vm.errorUpdate({ name: 'name', err: 'bad' })
        expect(wrapper.vm.errors.name).toBe('bad')
        expect(wrapper.vm.hasErrors).toBe(true)

        wrapper.vm.errorUpdate({ name: 'name', err: undefined })
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.errors.name).toBeUndefined()
        // Vue 3: добавление ключа реактивно, ошибка снимается
        expect(wrapper.vm.hasErrors).toBe(false)
    })

    test('aquiredData/deleteEntry/reorderEntry/autoApply', () => {
        const { wrapper, sch } = mountSchema()
        sch.acquire = vi.fn()
        sch.delete = vi.fn()
        sch.reorder = vi.fn()
        sch.apply = vi.fn()

        wrapper.vm.aquiredData()
        expect(sch.acquire).toHaveBeenCalled()

        wrapper.vm.deleteEntry('rec1')
        expect(sch.delete).toHaveBeenCalledWith({ _section: 'rec1' })

        wrapper.vm.reorderEntry(0, 'rec1')
        expect(sch.reorder).toHaveBeenCalledWith({ name: 'rec1', position: 0 })

        sch._edited = true
        wrapper.vm.autoApply('rec1')
        expect(sch.apply).toHaveBeenCalledWith({ _section: 'rec1' })
    })

    test('resetForm и selectSection', () => {
        const store = makeStore()
        const { wrapper, sch } = mountSchema({ store })
        sch.acquire = vi.fn()
        wrapper.vm.searchText = 'x'
        wrapper.vm.errors = { a: 'b' }
        wrapper.vm.actionObject = { name: 'x' }

        wrapper.vm.resetForm()
        expect(wrapper.vm.searchText).toBe('')
        expect(wrapper.vm.errors).toEqual({})
        expect(wrapper.vm.actionObject).toBeUndefined()
        expect(store.state.selectedPropertyValue).toBeUndefined()
        expect(sch.acquire).toHaveBeenCalled()

        wrapper.vm.selectSection({ _value: 'rec1', name: 'one' })
        expect(store.state.selectedPropertyValue).toBe('rec1')
        expect(store.state.selectedPropertyName).toBe('one')
    })

    test('updateValue: setData, setChanges и игнор невалидного/неизменного', async () => {
        const store = makeStore()
        store.state.selectedPropertyValue = 'rec1'
        const { wrapper, sch } = mountSchema({ store })
        sch.set = vi.fn(() => Promise.resolve({}))

        wrapper.vm.updateValue({ value: 4, valid: true }, 'state')
        // значение не изменилось — ничего
        expect(sch.set).not.toHaveBeenCalled()

        wrapper.vm.updateValue({ value: 'bad', valid: false }, 'state')
        expect(sch.set).not.toHaveBeenCalled()

        wrapper.vm.updateValue({ value: 'new', valid: true }, 'state')
        expect(sch.set).toHaveBeenCalledWith({
            _title: 'one',
            _section: 'rec1',
            _option: 'state',
            _value: 'new',
        })
        expect(store.state.changes['/test/rec1']).toBe(true)
    })
})
