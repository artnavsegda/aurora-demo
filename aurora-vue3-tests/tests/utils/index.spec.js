import {
    deepMerge, json_clean, objSort, sortAlphaNum, state2str, typify,
} from '@/utils'

describe('utils/index', () => {
    test('typify', () => {
        expect(typify('', { type: 'string', default: 'x' })).toBe('x')
        expect(typify('42', { type: 'number' })).toBe(42)
        expect(typify('true', { type: 'boolean' })).toBe(true)
        expect(typify('false', { type: 'boolean' })).toBe(false)
        expect(typify('', { type: 'number' })).toBe('')
    })

    test('json_clean', () => {
        const obj = { a: 1 }
        expect(json_clean(obj)).toBe(obj)
        expect(json_clean('{"a":1}')).toEqual({ a: 1 })
        expect(json_clean('{bad')).toBeUndefined()
    })

    test('deepMerge', () => {
        expect(deepMerge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } })
        expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
    })

    test('state2str', () => {
        expect(state2str(0)).toBe(' ')
        expect(state2str(1)).toBe('R')
        expect(state2str(5)).toBe('RS')
        expect(state2str(12)).toBe(' -')
    })

    test('sortAlphaNum и objSort', () => {
        expect(['a10', 'a2', 'a1'].sort(sortAlphaNum)).toEqual(['a1', 'a2', 'a10'])
        const rows = [
            { _sortBy: { name: 'b', n: 2 } },
            { _sortBy: { name: 'a', n: 10 } },
            { _sortBy: { name: 'c', n: 1 } },
        ]
        expect(objSort([...rows], 'name').map((r) => r._sortBy.name)).toEqual(['a', 'b', 'c'])
        expect(objSort([...rows], '-n').map((r) => r._sortBy.n)).toEqual([10, 2, 1])
    })
})
