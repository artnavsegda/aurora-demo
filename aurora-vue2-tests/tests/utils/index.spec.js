import {
    deepMerge, json_clean, objSort, sortAlphaNum, state2str, typify,
} from '@/utils'

describe('utils/index', () => {
    describe('typify', () => {
        test('string: пустое значение заменяется default/example', () => {
            expect(typify('', { type: 'string', default: 'x' })).toBe('x')
            expect(typify(undefined, { type: 'string', example: 'ex' })).toBe('ex')
            expect(typify('v', { type: 'string', default: 'x' })).toBe('v')
        })

        test('number: приведение и пустые значения', () => {
            expect(typify('42', { type: 'number' })).toBe(42)
            expect(typify('', { type: 'number' })).toBe('')
            expect(typify('abc', { type: 'number' })).toBe('')
            expect(typify(0, { type: 'number', default: 10 })).toBe(10)
            expect(typify(10, { type: 'number', default: 10 })).toBe(10)
        })

        test('boolean: true/1/строка', () => {
            expect(typify('true', { type: 'boolean' })).toBe(true)
            expect(typify('1', { type: 'boolean' })).toBe(true)
            expect(typify(1, { type: 'boolean' })).toBe(true)
            expect(typify('false', { type: 'boolean' })).toBe(false)
            expect(typify(0, { type: 'boolean' })).toBe(false)
        })

        test('array и прочие типы', () => {
            expect(typify(['a'], { type: 'array' })).toEqual(['a'])
            expect(typify('', { type: 'string', default: 'd' })).toBe('d')
        })
    })

    describe('json_clean', () => {
        test('объект возвращается как есть', () => {
            const obj = { a: 1 }
            expect(json_clean(obj)).toBe(obj)
        })

        test('валидный и невалидный JSON', () => {
            expect(json_clean('{"a":1}')).toEqual({ a: 1 })
            expect(json_clean('{bad')).toBeUndefined()
        })
    })

    describe('deepMerge', () => {
        test('мержит объекты рекурсивно', () => {
            const a = { x: { y: 1 }, keep: true }
            const b = { x: { z: 2 }, new: 'v' }
            expect(deepMerge(a, b)).toEqual({ x: { y: 1, z: 2 }, keep: true, new: 'v' })
        })

        test('массив из второго объекта заменяет первый (особенность реализации)', () => {
            expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
        })

        test('скаляр перекрывает объект', () => {
            expect(deepMerge({ a: { b: 1 } }, { a: 2 })).toEqual({ a: 2 })
        })
    })

    describe('state2str', () => {
        test('легенда статусов и конфигурации', () => {
            expect(state2str(0)).toBe(' ')
            expect(state2str(1)).toBe('R')
            expect(state2str(2)).toBe('X')
            expect(state2str(3)).toBe('E')
            expect(state2str(4)).toBe(' S')
            expect(state2str(5)).toBe('RS')
            expect(state2str(8)).toBe(' D')
            expect(state2str(12)).toBe(' -')
        })
    })

    describe('sortAlphaNum', () => {
        test('сортирует буквы и числа', () => {
            expect(['a10', 'a2', 'a1'].sort(sortAlphaNum)).toEqual(['a1', 'a2', 'a10'])
            expect(['10', '2', '1'].sort(sortAlphaNum)).toEqual(['1', '2', '10'])
        })

        test('обратный порядок', () => {
            expect(['a1', 'a2', 'a10'].sort((a, b) => sortAlphaNum(a, b, true)))
                .toEqual(['a10', 'a2', 'a1'])
        })
    })

    describe('objSort', () => {
        test('сортирует по _sortBy и поддерживает desc', () => {
            const rows = [
                { _sortBy: { name: 'b', n: 2 } },
                { _sortBy: { name: 'a', n: 10 } },
                { _sortBy: { name: 'c', n: 1 } },
            ]
            expect(objSort([...rows], 'name').map((r) => r._sortBy.name)).toEqual(['a', 'b', 'c'])
            expect(objSort([...rows], '-n').map((r) => r._sortBy.n)).toEqual([10, 2, 1])
        })
    })
})
