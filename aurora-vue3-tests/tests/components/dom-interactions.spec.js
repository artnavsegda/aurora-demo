import { shallowMount } from '@vue/test-utils'
import BoolElement from '@/components/elements/BoolElement.vue'
import TextElement from '@/components/elements/TextElement.vue'
import NumberElement from '@/components/elements/NumberElement.vue'
import SelectElement from '@/components/elements/SelectElement.vue'
import MultipleTextElement from '@/components/elements/MultipleTextElement.vue'

describe('DOM-взаимодействия элементов', () => {
    test('BoolElement: клик по checker', async () => {
        const values = { flag: false }
        const wrapper = shallowMount(BoolElement, { props: { schema: {}, values, property_name: 'flag' } })
        await wrapper.find('.checker').trigger('click')
        expect(wrapper.emitted().input).toEqual([[true]])
        expect(wrapper.vm.value).toBe(true)
    })

    test('TextElement: ввод и blur', async () => {
        vi.useFakeTimers()
        const values = { name: '' }
        const wrapper = shallowMount(TextElement, { props: { schema: {}, values, property_name: 'name' } })
        const input = wrapper.find('input')
        await input.setValue('hello')
        vi.advanceTimersByTime(700)
        expect(wrapper.emitted().input[0]).toEqual(['hello'])
        await input.trigger('blur')
        expect(wrapper.emitted().input[1]).toEqual(['hello'])
        vi.useRealTimers()
    })

    test('NumberElement: ввод числа', async () => {
        vi.useFakeTimers()
        const values = { n: 0 }
        const wrapper = shallowMount(NumberElement, { props: { schema: {}, values, property_name: 'n' } })
        const input = wrapper.find('input')
        await input.setValue('42')
        vi.advanceTimersByTime(700)
        expect(wrapper.emitted().input[0]).toEqual([42])
        vi.useRealTimers()
    })

    test('SelectElement: change', async () => {
        const values = { v: '' }
        const wrapper = shallowMount(SelectElement, {
            props: { schema: { enum: ['a', 'b'], strictEnum: true }, values, property_name: 'v' },
        })
        await wrapper.find('select').setValue('b')
        expect(wrapper.emitted().input[0]).toEqual(['b'])
    })

    test('MultipleTextElement: добавление по Enter', async () => {
        const values = { list: [] }
        const wrapper = shallowMount(MultipleTextElement, {
            props: { schema: { items: { type: 'string' } }, values, property_name: 'list' },
        })
        const input = wrapper.find('input')
        await input.setValue('one')
        await input.trigger('keydown.enter')
        expect(wrapper.emitted().input[0]).toEqual([['one']])
    })
})

describe('защита от undefined в update()', () => {
    test('TextElement/NumberElement/SelectElement не падают', () => {
        const text = shallowMount(TextElement, { props: { schema: {}, values: {}, property_name: 'v' } })
        expect(() => text.vm.update(undefined)).not.toThrow()

        const number = shallowMount(NumberElement, { props: { schema: {}, values: {}, property_name: 'v' } })
        expect(() => number.vm.update(undefined)).not.toThrow()

        const select = shallowMount(SelectElement, { props: { schema: {}, values: {}, property_name: 'v' } })
        expect(() => select.vm.update(undefined)).not.toThrow()
    })
})


describe('защита от не-объекта в values', () => {
    test('BoolElement не падает, если values — строка', () => {
        expect(() => shallowMount(BoolElement, {
            props: { schema: {}, values: '1', property_name: 'disabled' },
        })).not.toThrow()
    })
})
