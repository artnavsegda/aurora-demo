import { isReactive } from 'vue'
import Sch from '@/utils/schema'
import state from '@/store/state'

function makeSchema(extra = {}) {
    return {
        patternProperties: {
            '.*': {
                properties: {
                    name: { type: 'string' },
                    disabled: { type: 'boolean', default: false },
                    metric: { type: 'number', default: 0 },
                    mode: { type: 'string', enum: ['a', 'b'], default: 'a' },
                    free: { type: 'string', cue: ['+x'], default: 'x', strictEnum: true },
                },
            },
            actions: {
                ping: { exec: 'ping.uc', wait: true },
                hiddenAction: { exec: 'x', hidden: true },
                cliAction: { exec: 'y', cliOnly: true },
            },
        },
        actions: {
            global: { exec: 'global.uc', title: 'Global' },
        },
        apply: { exec: 'apply.uc' },
        add: { exec: 'add.uc', schema: { properties: { name: {} } } },
        clean: { exec: 'clean.uc' },
        delete: { exec: 'delete.uc' },
        status: { exec: 'status.uc' },
        reorder: { exec: 'reorder.uc' },
        namesake: 'name',
        showParams: ['metric', 'missing'],
        ...extra,
    }
}

import { vi } from 'vitest'

describe('utils/schema (Sch)', () => {
    afterEach(() => {
        state.schemas = {}
    })

    test('конструктор: actions/sectionActions/apply/add/...', () => {
        const schema = makeSchema()
        const sch = new Sch(schema, '/test', vi.fn())

        expect(sch.path).toBe('/test')
        expect(sch['$schema']).toBe(true)
        expect(sch.actions.global.action).toEqual({ exec: 'global.uc', title: 'Global' })
        expect(sch.actions.apply).toBeTruthy()
        expect(sch.actions.add).toBeTruthy()
        expect(sch.actions.clean).toBeTruthy()
        expect(sch.actions.delete).toBeUndefined() // delete — только sectionAction
        expect(sch.actions.status).toBeTruthy()
        expect(sch.actions.status.action.isTable).toBe(true)

        expect(sch.sectionActions.ping).toBeTruthy()
        expect(sch.sectionActions.ping.hidden).toBeFalsy()
        expect(sch.sectionActions.hiddenAction).toBeUndefined()
        expect(sch.sectionActions.cliAction).toBeUndefined()
        expect(sch.sectionActions.apply).toBe(sch.actions.apply)
        expect(sch.sectionActions.delete).toBeTruthy()
    })

    test('apply/add/clean/delete/status/reorder вызывают actionCallBack', async () => {
        const schema = makeSchema()
        const cb = vi.fn().mockResolvedValue({ data: {} })
        const sch = new Sch(schema, '/test', cb)

        sch.data = { rec1: { name: 'one', _edited: true } }

        await sch.apply({ _section: 'rec1' })
        expect(cb).toHaveBeenCalledWith('apply', sch, schema.apply, { _section: 'rec1' })
        expect(sch.data.rec1._edited).toBeUndefined()

        sch.add({ name: 'two' })
        expect(cb).toHaveBeenCalledWith('add', sch, schema.add, { name: 'two' })

        sch.clean()
        expect(cb).toHaveBeenCalledWith('clean', sch, schema.clean, undefined)

        sch.delete({ _section: 'rec1' })
        expect(cb).toHaveBeenCalledWith('delete', sch, schema.delete, { _section: 'rec1' })

        sch.status({ _section: 'rec1' })
        expect(cb).toHaveBeenCalledWith('status', sch, schema.status, { _section: 'rec1' })

        await sch.reorder({ name: 'rec1', position: 0 })
        expect(cb).toHaveBeenCalledWith('reorder', sch, schema.reorder, { name: 'rec1', position: 0 })
        expect(cb).toHaveBeenCalledWith('@get', sch, schema.acquire, { force: true })
    })

    test('set: обновляет значение и _edited, берёт значение из ответа', async () => {
        const schema = makeSchema({ set: { exec: 'set.uc' } })
        const cb = vi.fn().mockResolvedValue({ data: { rec1: { metric: 42 } } })
        const sch = new Sch(schema, '/test', cb)
        sch.data = { rec1: { name: 'one', metric: 1 } }

        await sch.set({ _section: 'rec1', _option: 'metric', _value: 2 })
        expect(cb.mock.calls[0][3]).toMatchObject({ _section: 'rec1', _option: 'metric' })
        expect(sch.data.rec1.metric).toBe(42)
        expect(sch._edited).toBe(true)

        // без _section у схемы с секциями — колбэк вызван, но данные не меняются
        await sch.set({ _option: 'metric', _value: 3 })
        expect(sch.data.rec1.metric).toBe(42)
    })

    test('set: схема без секций', async () => {
        const schema = {
            properties: { hostname: { type: 'string' } },
            set: { exec: 'set.uc' },
        }
        const cb = vi.fn().mockResolvedValue({ data: { hostname: 'new' } })
        const sch = new Sch(schema, '/flat', cb)
        sch.data = { hostname: 'old' }

        await sch.set({ _option: 'hostname', _value: 'x' })
        expect(sch.data.hostname).toBe('new')
    })

    test('acquire: кэш на 5 секунд и force', async () => {
        const schema = makeSchema()
        const cb = vi.fn().mockResolvedValue({ data: {} })
        const sch = new Sch(schema, '/test', cb)

        await sch.acquire()
        expect(cb).toHaveBeenCalledTimes(1)

        await sch.acquire()
        expect(cb).toHaveBeenCalledTimes(1)

        await sch.acquire(true)
        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb.mock.calls[1][3]).toEqual({ force: true })

        sch._stamp = Date.now() - 6000
        await sch.acquire()
        expect(cb).toHaveBeenCalledTimes(3)
    })

    test('noCache: статус перечитывает данные без секции', async () => {
        const schema = makeSchema({ status: undefined, noCache: true })
        const cb = vi.fn().mockResolvedValue({ data: {} })
        const sch = new Sch(schema, '/test', cb)

        const res = await sch.status({})
        expect(res).toBe('')
        expect(cb).toHaveBeenCalledWith('@get', sch, schema.acquire, { force: true })

        cb.mockClear()
        const res2 = await sch.status({ _section: 'rec1' })
        expect(res2).toBe('')
        expect(cb).not.toHaveBeenCalled()
    })

    test('elements: статус, _index, namesake, showParams и фильтры', () => {
        const schema = makeSchema()
        const sch = new Sch(schema, '/test', vi.fn())
        sch.data = {
            rec1: { name: 'one', metric: 10, disabled: '1', _index: 3 },
            rec2: { name: 'two', metric: 20, _dynamic: 1 },
        }

        const all = sch.elements()
        expect(all).toHaveLength(2)
        const one = all.find((e) => e.name === 'one')
        const two = all.find((e) => e.name === 'two')

        expect(one._value).toBe('rec1')
        expect(one._index).toBe(3)
        expect(one._params.metric).toBe(10)
        expect(one._params.missing).toBe('')
        expect(one._params.state).toBe(4 | 2) // running + disabled

        expect(two._dynamic).toBe(1)
        expect(two._params.state).toBe(8)
        expect(two._pattern).toBe('.*')

        const filtered = sch.elements({ metric: ['10'] })
        expect(filtered.map((e) => e.name)).toEqual(['one'])

        const negative = sch.elements({ metric: ['!10'] })
        expect(negative.map((e) => e.name)).toEqual(['two'])

        const unknown = sch.elements({ nope: ['x'] })
        expect(unknown).toEqual([])
    })

    test('elements: showParams берёт default из схемы', () => {
        const schema = makeSchema()
        const sch = new Sch(schema, '/test', vi.fn())
        sch.data = { rec1: { name: 'one' } }
        const row = sch.elements()[0]
        expect(row._params.metric).toBe(0)
    })

    test('model: default для enum/cue и observable', () => {
        const schema = makeSchema()
        const sch = new Sch(schema, '/test', vi.fn())
        sch.data = {
            rec1: { name: 'one' },
            rec2: { name: 'two', mode: 'b', free: 'y' },
        }

        const model = sch.model()
        expect(model.rec1.mode).toBe('a')
        expect(model.rec1.free).toBe('x')
        expect(model.rec2.mode).toBe('b')
        expect(model.rec2.free).toBe('y')
        expect(isReactive(model)).toBe(true)
    })

    test('model: схема без секций', () => {
        const schema = {
            properties: {
                mode: { type: 'string', enum: ['a'], default: 'a' },
                plain: { type: 'string', default: 'x' },
            },
        }
        const sch = new Sch(schema, '/flat', vi.fn())
        sch.data = {}

        const model = sch.model()
        expect(model.mode).toBe('a')
        expect(model.plain).toBeUndefined()
    })

    test('untraverse', () => {
        const schema = makeSchema()
        const sch = new Sch(schema, '/test', vi.fn())
        sch.data = { rec1: { name: 'one' } }
        expect(sch.untraverse('rec1')).toBe('one')
        expect(sch.untraverse('missing')).toBeUndefined()

        const flat = new Sch({ properties: {} }, '/flat', vi.fn())
        expect(flat.untraverse('rec1')).toBe('rec1')
    })

    test('resolve: возвращает schema записи и подтягивает $ref', () => {
        const schema = makeSchema({
            definitions: {
                refdef: { type: 'string', description: 'from defs' },
            },
        })
        schema.patternProperties['.*'].properties.metric = { $ref: '#/definitions/refdef' }

        const sch = new Sch(schema, '/test', vi.fn())
        sch.data = { rec1: { name: 'one' } }
        const resolved = sch.resolve('rec1')
        expect(resolved).toBe(schema.patternProperties['.*'])
        expect(resolved.properties.metric.description).toBe('from defs')
        expect(sch.resolve('missing')).toBeUndefined()
    })

    test('refProcess: локальные, внешние и отсутствующие ссылки', () => {
        const sch = new Sch({ properties: {}, definitions: {} }, '/test', vi.fn())
        const local = { $ref: '#/definitions/x' }
        sch.refProcess(local, { x: { type: 'number' } })
        expect(local.type).toBe('number')

        const noItem = { $ref: '#/' }
        sch.refProcess(noItem, {})
        expect(noItem.type).toBeUndefined()

        const noRef = { type: 'string' }
        sch.refProcess(noRef, {})
        expect(noRef.type).toBe('string')

        const external = { $ref: '/other#/definitions/y' }
        const other = new Sch({ definitions: { y: { type: 'boolean' } }, properties: {} }, '/other', vi.fn())
        state.schemas = { other }
        sch.refProcess(external, {})
        expect(external.type).toBe('boolean')

        const missing = { $ref: '/missing#/definitions/z' }
        sch.refProcess(missing, {})
        expect(missing.type).toBeUndefined()
    })
})
