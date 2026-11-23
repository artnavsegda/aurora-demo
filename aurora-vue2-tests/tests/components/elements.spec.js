import { shallowMount } from '@vue/test-utils'

import BoolElement from '@/components/elements/BoolElement.vue'
import TextElement from '@/components/elements/TextElement.vue'
import NumberElement from '@/components/elements/NumberElement.vue'
import SelectElement from '@/components/elements/SelectElement.vue'
import MultipleTextElement from '@/components/elements/MultipleTextElement.vue'
import MultipleSelectElement from '@/components/elements/MultipleSelectElement.vue'
import MultiplePairElement from '@/components/elements/MultiplePairElement.vue'
import StatusElement from '@/components/elements/StatusElement.vue'
import description from '@/components/elements/description.vue'
import errorDescription from '@/components/elements/errorDescription.vue'

describe('components/elements', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    describe('BoolElement', () => {
        test('инициализация true/1/строкой и emit при клике', () => {
            const values = { flag: '1' }
            const wrapper = shallowMount(BoolElement, {
                propsData: { schema: {}, values, property_name: 'flag' },
            })
            expect(wrapper.vm.value).toBe(true)
            expect(values.flag).toBe(true)

            wrapper.vm.setValue()
            expect(wrapper.emitted().input[0]).toEqual([false])
            expect(wrapper.vm.value).toBe(false)
        })

        test('readOnly не переключает', () => {
            const wrapper = shallowMount(BoolElement, {
                propsData: { schema: { readOnly: true }, values: { flag: false }, property_name: 'flag' },
            })
            wrapper.vm.setValue()
            expect(wrapper.emitted().input).toBeUndefined()
        })
    })

    describe('TextElement', () => {
        test('инициализация, setValue и update с debounce', () => {
            jest.useFakeTimers()
            const wrapper = shallowMount(TextElement, {
                propsData: { schema: {}, values: { name: 'abc' }, property_name: 'name' },
            })
            expect(wrapper.vm.value).toBe('abc')

            wrapper.vm.setValue('  hello  ')
            expect(wrapper.emitted().input[0]).toEqual(['hello'])

            wrapper.vm.value = 'next'
            wrapper.vm.update()
            jest.advanceTimersByTime(700)
            expect(wrapper.emitted().input[1]).toEqual(['next'])
        })

        test('пустое значение и default', () => {
            jest.useFakeTimers()
            const wrapper = shallowMount(TextElement, {
                propsData: { schema: { default: 'def' }, values: {}, property_name: 'name' },
            })
            wrapper.vm.setValue('')
            expect(wrapper.emitted().input[0]).toEqual([undefined])

            wrapper.vm.value = 'def'
            wrapper.vm.update()
            jest.advanceTimersByTime(700)
            expect(wrapper.emitted().input).toHaveLength(2)
        })

        test('invert и password type', () => {
            const wrapper = shallowMount(TextElement, {
                propsData: {
                    schema: { type: 'password', enableInvert: true },
                    values: { name: '!secret' },
                    property_name: 'name',
                },
            })
            expect(wrapper.vm.inverted).toBe(true)
            expect(wrapper.vm.value).toBe('secret')
            expect(wrapper.vm.determineType).toBe('password')

            wrapper.vm.invert()
            expect(wrapper.vm.inverted).toBe(false)
            wrapper.vm.setValue('x')
            expect(wrapper.emitted().input[1]).toEqual(['x'])
        })

        test('placeholder и dynamicID', () => {
            const wrapper = shallowMount(TextElement, {
                propsData: {
                    schema: { example: 'ex', maxLength: 5 },
                    values: {},
                    property_name: 'name',
                },
            })
            expect(wrapper.vm.placeholder_value).toBe('ex')
            expect(wrapper.vm.dynamicID()).toMatch(/^_dynamicID_/)
        })
    })

    describe('NumberElement', () => {
        test('setValue: число, пусто, trim', () => {
            const wrapper = shallowMount(NumberElement, {
                propsData: { schema: {}, values: { n: 1 }, property_name: 'n' },
            })
            expect(wrapper.vm.value).toBe(1)

            wrapper.vm.setValue(' 42 ')
            expect(wrapper.emitted().input[0]).toEqual([42])

            wrapper.vm.setValue('')
            expect(wrapper.emitted().input[1]).toEqual([undefined])
        })

        test('update сбрасывает default и ставит число', () => {
            jest.useFakeTimers()
            const wrapper = shallowMount(NumberElement, {
                propsData: { schema: { default: 10 }, values: { n: 10 }, property_name: 'n' },
            })
            wrapper.vm.value = '10'
            wrapper.vm.update()
            jest.advanceTimersByTime(700)
            expect(wrapper.emitted().input[0]).toEqual([undefined]) // значение равно default -> пустое

            wrapper.vm.value = '20'
            wrapper.vm.update()
            jest.advanceTimersByTime(700)
            expect(wrapper.emitted().input[1]).toEqual([20])
        })

        test('placeholder_value', () => {
            const wrapper = shallowMount(NumberElement, {
                propsData: {
                    schema: { example: 'ex' },
                    values: {},
                    property_name: 'n',
                },
            })
            expect(wrapper.vm.placeholder_value).toBe('ex')
        })
    })

    describe('SelectElement', () => {
        test('items: enum, default и сортировка', () => {
            const wrapper = shallowMount(SelectElement, {
                propsData: {
                    schema: { enum: ['b', 'a'], default: 'c' },
                    values: {},
                    property_name: 'v',
                },
            })
            expect(wrapper.vm.enum).toEqual(['a', 'b'])
            expect(wrapper.vm.items).toEqual(['c', 'a', 'b'])
        })

        test('canBeEmpty и noStrictEnum', () => {
            const wrapper = shallowMount(SelectElement, {
                propsData: {
                    schema: { enum: ['a'], strictEnum: false },
                    values: {},
                    property_name: 'v',
                },
            })
            expect(wrapper.vm.noStrictEnum).toBe(true)
            expect(wrapper.vm.canBeEmpty).toBe(true)
        })

        test('setValue: default, пусто и число', () => {
            const wrapper = shallowMount(SelectElement, {
                propsData: {
                    schema: { type: 'number', enum: [1, 2], default: 1 },
                    values: {},
                    property_name: 'v',
                },
            })

            wrapper.vm.setValue('')
            expect(wrapper.emitted().input[0]).toEqual([undefined])

            wrapper.vm.setValue('2')
            expect(wrapper.emitted().input[1]).toEqual([2])

            wrapper.vm.setValue('1')
            expect(wrapper.emitted().input[2]).toEqual([''])
        })

        test('update с debounce', () => {
            jest.useFakeTimers()
            const wrapper = shallowMount(SelectElement, {
                propsData: { schema: { enum: ['a', 'b'] }, values: { v: 'a' }, property_name: 'v' },
            })
            wrapper.vm.value = 'b'
            wrapper.vm.update()
            jest.advanceTimersByTime(300)
            expect(wrapper.emitted().input[0]).toEqual(['b'])
        })
    })

    describe('MultipleTextElement', () => {
        test('добавление, дедупликация и сортировка', () => {
            const values = { list: ['b'] }
            const wrapper = shallowMount(MultipleTextElement, {
                propsData: {
                    schema: { items: { type: 'string' } },
                    values,
                    property_name: 'list',
                },
            })
            expect(wrapper.vm.value).toEqual(['b'])

            wrapper.vm.addValue('a')
            expect(wrapper.emitted().input[0]).toEqual([['a', 'b']])

            wrapper.vm.addValue('a')
            expect(wrapper.emitted().input).toHaveLength(1)
        })

        test('числа, удаление и навигация', () => {
            const values = { list: [1, 2] }
            const wrapper = shallowMount(MultipleTextElement, {
                propsData: {
                    schema: { items: { type: 'number' } },
                    values,
                    property_name: 'list',
                },
            })
            wrapper.vm.addValue('3')
            expect(wrapper.emitted().input[0]).toEqual([[1, 2, 3]])

            wrapper.vm.delValue(0)
            expect(wrapper.emitted().input[1]).toEqual([[2, 3]])

            wrapper.vm.currentChip = 0
            wrapper.vm.chips_right()
            expect(wrapper.vm.currentChip).toBe(1)
            wrapper.vm.chips_left()
            expect(wrapper.vm.currentChip).toBe(0)
        })

        test('readOnly не даёт редактировать', () => {
            const wrapper = shallowMount(MultipleTextElement, {
                propsData: {
                    schema: { readOnly: true, items: { type: 'string' } },
                    values: { list: ['a'] },
                    property_name: 'list',
                },
            })
            wrapper.vm.editValue(0)
            expect(wrapper.emitted().input).toBeUndefined()
        })
    })

    describe('MultipleSelectElement', () => {
        test('strict enum и добавление', () => {
            const values = { list: [] }
            const wrapper = shallowMount(MultipleSelectElement, {
                propsData: {
                    schema: { items: { enum: ['a', 'b'], type: 'string' } },
                    values,
                    property_name: 'list',
                },
            })
            expect(wrapper.vm.items).toEqual(['a', 'b'])
            wrapper.vm.addValue('c')
            expect(wrapper.emitted().input).toBeUndefined()

            wrapper.vm.addValue('a')
            expect(wrapper.emitted().input[0]).toEqual([['a']])
            expect(wrapper.vm.items).toEqual(['b'])
        })

        test('удаление и числа', () => {
            const values = { list: [1] }
            const wrapper = shallowMount(MultipleSelectElement, {
                propsData: {
                    schema: { items: { enum: [1, 2], type: 'number' } },
                    values,
                    property_name: 'list',
                },
            })
            wrapper.vm.addValue('2')
            expect(wrapper.emitted().input[0]).toEqual([[1, 2]])

            wrapper.vm.delValue(0)
            expect(wrapper.emitted().input[1]).toEqual([[2]])
        })
    })

    describe('MultiplePairElement', () => {
        test('selectEnum и addValue с проверками', () => {
            const values = { list: [] }
            const wrapper = shallowMount(MultiplePairElement, {
                propsData: {
                    schema: {
                        items: { enum: ['a', 'b'], type: 'pair' },
                        uniqueItems: true,
                    },
                    values,
                    property_name: 'list',
                },
            })

            wrapper.vm.selectEnum('a')
            expect(wrapper.vm.$refs.inputField.value).toBe('a=')

            wrapper.vm.addValue('a=1')
            expect(wrapper.emitted().input[0]).toEqual([['a=1']])

            wrapper.vm.addValue('a=2')
            expect(wrapper.emitted().input).toHaveLength(1) // ключ уже есть

            wrapper.vm.addValue('c=1')
            expect(wrapper.emitted().input).toHaveLength(1) // ключ не из enum

            wrapper.vm.addValue('b=2')
            expect(wrapper.emitted().input[1]).toEqual([['a=1', 'b=2']])
        })

        test('items скрывает использованные ключи', () => {
            const wrapper = shallowMount(MultiplePairElement, {
                propsData: {
                    schema: { items: { enum: ['a', 'b'], type: 'pair' }, uniqueItems: true },
                    values: { list: ['a=1'] },
                    property_name: 'list',
                },
            })
            expect(wrapper.vm.items).toEqual(['b'])
        })
    })

    describe('StatusElement', () => {
        test('объект и массив', () => {
            const wrapper = shallowMount(StatusElement, {
                propsData: { model: { state: 'running', uptime: '1h' } },
            })
            expect(wrapper.vm.isObject({ a: 1 })).toBe(true)
            expect(wrapper.vm.isObject([])).toBe(false)
            expect(wrapper.vm.isArray([])).toBe(true)
            expect(wrapper.vm.prepairStatusElement({ a: 1 })).toEqual([{ label: 'a', value: 1 }])
            expect(Object.keys(wrapper.vm.items)).toEqual(['state', 'uptime'])

            const arrayWrapper = shallowMount(StatusElement, {
                propsData: { model: [{ name: 'a' }] },
            })
            expect(arrayWrapper.vm.items).toEqual([{ name: 'a' }])

            wrapper.vm.showStatus()
            expect(wrapper.vm.shown).toBe(false)
        })
    })

    describe('description / errorDescription', () => {
        test('description показывает текст только при error', async () => {
            const wrapper = shallowMount(description, {
                propsData: { text: 'hello', error: '' },
            })
            expect(wrapper.text()).toBe('')
            await wrapper.setProps({ error: 'bad' })
            expect(wrapper.text()).toBe('hello')
        })

        test('errorDescription показывает ошибку и примеры', () => {
            const wrapper = shallowMount(errorDescription, {
                propsData: { error: 'bad', example: ['e1', 'e2'] },
            })
            expect(wrapper.text()).toContain('bad')
            expect(wrapper.text()).toContain('e1')
            expect(wrapper.text()).toContain('e2')
        })
    })
})
