import Vue from 'vue'
import Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'

import initialState from '@/store/state'
import mutations from '@/store/mutations'
import getters from '@/store/getters'

import Plate from '@/components/dashboard/Plate.vue'
import Changes from '@/components/Changes.vue'
import Informs from '@/components/Informs.vue'
import HBarGraph from '@/components/graphs/HBarGraph.vue'
import VBarGraph from '@/components/graphs/VBarGraph.vue'
import PieGraph from '@/components/graphs/PieGraph.vue'

Vue.use(Vuex)

function makeStore() {
    const state = JSON.parse(JSON.stringify(initialState))
    state.status = { model: undefined, interval: undefined }
    return new Vuex.Store({ state, mutations, getters })
}

describe('components: простые', () => {
    describe('Plate', () => {
        test('обычное значение и массив', () => {
            const wrapper = shallowMount(Plate, {
                propsData: { item: { label: 'Model', value: 'R50' } },
            })
            expect(wrapper.text()).toContain('Model')
            expect(wrapper.text()).toContain('R50')

            const list = shallowMount(Plate, {
                propsData: { item: { label: 'List', value: ['a', 'b'] } },
            })
            expect(list.findAll('.subvalue').length).toBe(2)
        })

        test('items с label/value', () => {
            const wrapper = shallowMount(Plate, {
                propsData: {
                    item: {
                        label: 'Board',
                        items: [{ label: 'serial', value: '123' }],
                    },
                },
            })
            expect(wrapper.text()).toContain('Board')
            expect(wrapper.text()).toContain('serial')
            expect(wrapper.text()).toContain('123')
        })

        test('графики: pie/v-bar/h-bar', () => {
            const item = { label: 'CPU', type: 'h-bar', total: 100, unit: '%', items: [{ label: 'load', value: 5 }] }
            const hbar = shallowMount(Plate, { propsData: { item } })
            expect(hbar.find('hbar-stub').exists() || hbar.findComponent(HBarGraph).exists()).toBe(true)

            const pie = shallowMount(Plate, { propsData: { item: { ...item, type: 'pie' } } })
            expect(pie.html()).toMatch(/piegraph-stub|PieGraph/)

            const vbar = shallowMount(Plate, { propsData: { item: { ...item, type: 'v-bar' } } })
            expect(vbar.html()).toMatch(/vbargraph-stub|VBarGraph/)
        })
    })

    describe('Changes', () => {
        test('фильтрует пустые и по строке', () => {
            jest.useFakeTimers()
            const store = makeStore()
            store.state.changes = ['one', '', 'two', 'three']
            const wrapper = shallowMount(Changes, { store })

            expect(wrapper.vm.filteredChanges).toEqual(['one', 'two', 'three'])

            wrapper.vm.$refs.strFilter.value = 'tw'
            wrapper.vm.updateFilter()
            jest.advanceTimersByTime(500)
            expect(wrapper.vm.strFilter).toBe('tw')
            expect(wrapper.vm.filteredChanges).toEqual(['two'])
            jest.useRealTimers()
        })

        test('scroll и пустой список', () => {
            jest.useFakeTimers()
            const store = makeStore()
            store.state.changes = []
            const wrapper = shallowMount(Changes, { store })
            jest.advanceTimersByTime(20)
            expect(wrapper.vm.filteredChanges).toEqual([])
            wrapper.vm.autoScroll = false
            wrapper.vm.scroll()
            jest.useRealTimers()
        })
    })

    describe('Informs', () => {
        test('рендер, удаление одного и всех', () => {
            const store = makeStore()
            store.state.informs = [
                { type: 'error', text: 'one' },
                { type: 'info', text: 'two' },
            ]
            const wrapper = shallowMount(Informs, { store })

            expect(wrapper.text()).toContain('one')
            expect(wrapper.text()).toContain('remove all messages')

            wrapper.vm.deleteInform(0)
            expect(store.state.informs).toEqual([{ type: 'info', text: 'two' }])

            wrapper.vm.deleteAllInform()
            expect(store.state.informs).toEqual([])
        })
    })

    describe('graphs', () => {
        test('HBarGraph: total, calcLine, legend', () => {
            const wrapper = shallowMount(HBarGraph, {
                propsData: {
                    title: 'RAM',
                    unit: 'MB',
                    total: 100,
                    values: [{ label: 'used', value: 25 }, { label: 'free', value: 75 }],
                },
            })
            expect(wrapper.vm.totalValue).toBe(100)
            expect(wrapper.vm.calcLine(25)).toBe('25%')
            expect(wrapper.vm.sortedValues[0].color).toBeTruthy()
            expect(wrapper.text()).toContain('RAM')
            expect(wrapper.text()).toContain('used')
        })

        test('HBarGraph: total по сумме', () => {
            const wrapper = shallowMount(HBarGraph, {
                propsData: { values: [{ label: 'a', value: 2 }, { label: 'b', value: 3 }] },
            })
            expect(wrapper.vm.totalValue).toBe(5)
        })

        test('VBarGraph: total и calcLine', () => {
            const wrapper = shallowMount(VBarGraph, {
                propsData: {
                    title: 'CPU',
                    unit: '%',
                    total: 100,
                    values: [{ label: 'load', value: 10 }],
                },
            })
            expect(wrapper.vm.totalValue).toBe(100)
            expect(wrapper.vm.calcLine(10)).toBe('10%')
            expect(wrapper.text()).toContain('CPU')
        })

        test('PieGraph: сортировка, фильтр нулей и total', () => {
            const wrapper = shallowMount(PieGraph, {
                propsData: {
                    title: 'Storage',
                    unit: 'MB',
                    values: [{ label: 'a', value: 2 }, { label: 'b', value: 0 }, { label: 'c', value: 5 }],
                },
            })
            expect(wrapper.vm.totalValue).toBe(7)
            expect(wrapper.vm.filteredValues.map((v) => v.label)).toEqual(['c', 'a'])
            expect(wrapper.vm.filteredValues[0].value).toBe(5)
        })
    })
})
