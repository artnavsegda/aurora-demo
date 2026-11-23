import Vue from 'vue'
import Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import Sch from '@/utils/schema'

import SectionOption from '@/components/SectionOption.vue'
import TextElement from '@/components/elements/TextElement.vue'
import NumberElement from '@/components/elements/NumberElement.vue'
import BoolElement from '@/components/elements/BoolElement.vue'
import SelectElement from '@/components/elements/SelectElement.vue'
import MultipleTextElement from '@/components/elements/MultipleTextElement.vue'
import MultipleSelectElement from '@/components/elements/MultipleSelectElement.vue'
import MultiplePairElement from '@/components/elements/MultiplePairElement.vue'

Vue.use(Vuex)

function makeStore(cue = jest.fn(() => Promise.resolve({ data: { enum: ['a'] } }))) {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({
        state,
        mutations,
        getters,
        actions: {
            cueRequest: cue,
        },
    })
}

function mountOption({ schema, values = {}, store = makeStore(), ...rest }) {
    return shallowMount(SectionOption, {
        store,
        propsData: {
            schema,
            values,
            property_name: 'value',
            path: ['test'],
            section: '',
            definitions: {},
            ...rest,
        },
        mocks: { $route: { path: '/test' }, $router: { push: jest.fn() } },
    })
}

describe('components/SectionOption', () => {
    test('type: выбор компонента по схеме', () => {
        const cases = [
            [{ type: 'string', enum: ['a'] }, SelectElement],
            [{ type: 'string', cue: ['+a'] }, SelectElement],
            [{ type: 'boolean' }, BoolElement],
            [{ type: 'number' }, NumberElement],
            [{ type: 'integer' }, NumberElement],
            [{ type: 'array', items: { type: 'pair', enum: ['a'] } }, MultiplePairElement],
            [{ type: 'array', items: { enum: ['a'] } }, MultipleSelectElement],
            [{ type: 'array', items: { type: 'string' } }, MultipleTextElement],
            [{ type: 'string' }, TextElement],
        ]

        for (const [schema, component] of cases) {
            const wrapper = mountOption({ schema })
            expect(wrapper.vm.type).toBe(component)
        }
    })

    test('type: массив без items не роняет выбор компонента', () => {
        const wrapper = mountOption({ schema: { type: 'array' }, values: {} })
        expect(wrapper.vm.type).toBe(MultipleTextElement)
    })

    test('rSchema: title, readOnly, isRequired', () => {
        const wrapper = mountOption({
            schema: { type: 'string' },
            values: { _dynamic: 1 },
            isRequired: true,
        })
        expect(wrapper.vm.rSchema.title).toBe('value')
        expect(wrapper.vm.rSchema.readOnly).toBe(true)
        expect(wrapper.vm.rSchema.isRequired).toBe(true)
        expect(wrapper.vm.hasTitle).toBe(true)
    })

    test('modificator: then и отрицательное условие', () => {
        const wrapper = mountOption({
            schema: {
                type: 'string',
                modificator: [
                    { if: [{ mode: 'a' }], then: { title: 'A' } },
                    { if: [{ mode: '!a' }], then: { title: 'Not A' } },
                ],
            },
            values: { mode: 'a' },
        })
        expect(wrapper.vm.rSchema.title).toBe('A')

        const negative = mountOption({
            schema: {
                type: 'string',
                modificator: [
                    { if: [{ mode: 'a' }], then: { title: 'A' } },
                    { if: [{ mode: '!a' }], then: { title: 'Not A' } },
                ],
            },
            values: { mode: 'b' },
        })
        expect(negative.vm.rSchema.title).toBe('Not A')
        expect(negative.vm.condProcess([{ if: [{ mode: '!b' }], then: {} }])).toBe(-1)
    })

    test('refProcess: локальные и внешние $ref', () => {
        const local = mountOption({
            schema: { $ref: '#/definitions/x' },
            definitions: { x: { type: 'number' } },
        })
        expect(local.vm.rSchema.type).toBe('number')

        const store = makeStore()
        store.state.schemas = {
            other: new Sch({ definitions: { y: { type: 'boolean' } }, properties: {} }, '/other', jest.fn()),
        }
        const external = mountOption({ schema: { $ref: '/other#/definitions/y' }, store })
        expect(external.vm.rSchema.type).toBe('boolean')
    })

    test('check_valid: ошибки, hidden и readOnly', () => {
        const wrapper = mountOption({
            schema: { type: 'number', minimum: 5 },
            values: { value: 1 },
        })
        expect(wrapper.vm.check_valid(1)).toBe(false)
        expect(wrapper.vm.error).toBe('minimum is 5')
        expect(wrapper.emitted('error-update')[0][0]).toEqual({ name: 'value', err: 'minimum is 5' })

        expect(wrapper.vm.check_valid(10)).toBe(true)
        expect(wrapper.vm.error).toBeUndefined()

        const hidden = mountOption({ schema: { type: 'string', hidden: true }, values: {} })
        expect(hidden.vm.check_valid('x')).toBe(true)
        expect(hidden.vm.error).toBeUndefined()

        const readOnly = mountOption({
            schema: { type: 'string', readOnly: true },
            values: {},
        })
        expect(readOnly.vm.check_valid('x')).toBe(true)
    })

    test('changeValue: readOnly и emit value-update', () => {
        const wrapper = mountOption({
            schema: { type: 'number', minimum: 5 },
            values: {},
        })
        wrapper.vm.changeValue('input', 1)
        expect(wrapper.emitted('value-update')[0][0]).toEqual({ value: 1, valid: false })

        wrapper.vm.changeValue('input', 10)
        expect(wrapper.emitted('value-update')[1][0]).toEqual({ value: 10, valid: true })

        const readOnly = mountOption({ schema: { readOnly: true }, values: {} })
        readOnly.vm.changeValue('input', 1)
        expect(readOnly.emitted('value-update')).toBeUndefined()
    })

    test('cueProcess: запрос enum и strictEnum', async () => {
        const cue = jest.fn(() => Promise.resolve({ data: { enum: ['a', 'b'] } }))
        const store = makeStore(cue)
        const wrapper = mountOption({ schema: { type: 'string' }, store })

        const item = { cue: ['+a'] }
        await wrapper.vm.cueProcess(item, '/test')
        expect(cue.mock.calls[0][1]).toEqual({ path: '/test', data: ['+a'] })
        expect(item.cue).toBeUndefined()
        expect(item.strictEnum).toBe(false)
        expect(item.enum).toEqual(['a', 'b'])
    })

    test('cueWatch: зависимости $option', () => {
        const wrapper = mountOption({
            schema: { type: 'string', cue: ['$mode', '/defaults'] },
            values: { mode: 'ap' },
        })
        expect(wrapper.vm.cueWatch).toEqual({ mode: 'ap' })
    })
})
