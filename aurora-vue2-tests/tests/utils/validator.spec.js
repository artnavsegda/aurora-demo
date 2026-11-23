import { validate } from '@/utils/validator'

describe('utils/validator', () => {
    test('default и required', () => {
        expect(validate({ type: 'string', default: 'x' }, 'x')).toEqual([true, undefined])
        expect(validate({ type: 'string', isRequired: true }, '')).toEqual([false, 'value required'])
        expect(validate({ type: 'string', isRequired: true }, undefined)).toEqual([false, 'value required'])
        expect(validate({ type: 'string' }, undefined)).toEqual([true, undefined])
    })

    test('string: enum strict/non-strict', () => {
        expect(validate({ type: 'string', enum: ['a', 'b'] }, 'c')).toEqual([false, "'c' - invalid value"])
        expect(validate({ type: 'string', enum: ['a', 'b'] }, 'a')).toEqual([true, undefined])
        expect(validate({ type: 'string', enum: ['a'], strictEnum: false }, 'c')).toEqual([true, undefined])
        expect(validate({ type: 'string', enum: ['a'], default: 'd' }, 'd')).toEqual([true, undefined])
    })

    test('string: pattern, negative pattern, длины', () => {
        expect(validate({ type: 'string', pattern: '^\\d+$' }, '123')).toEqual([true, undefined])
        expect(validate({ type: 'string', pattern: '^\\d+$' }, 'abc')).toEqual([false, "'abc' - not allowed value"])
        expect(validate({
            type: 'string',
            pattern: '^\\d+$',
            patternDescription: 'only digits',
        }, 'abc')).toEqual([false, 'only digits'])
        expect(validate({ type: 'string', pattern: '^\\d+$' }, '!123')).toEqual([true, undefined])

        expect(validate({ type: 'string', maxLength: 3 }, 'abcd')).toEqual([false, 'maximum length is 3'])
        expect(validate({ type: 'string', minLength: 3 }, 'ab')).toEqual([false, 'minimum length is 3'])
    })

    test('number/integer', () => {
        expect(validate({ type: 'number' }, '')).toEqual([true, undefined])
        expect(validate({ type: 'number' }, 'abc')).toEqual([false, 'must be a number'])
        expect(validate({ type: 'number' }, '1.5')).toEqual([false, 'must be a number'])
        expect(validate({ type: 'integer' }, '10')).toEqual([true, undefined])
        expect(validate({ type: 'number', maximum: 5 }, '6')).toEqual([false, 'maximum is 5'])
        expect(validate({ type: 'number', minimum: 5 }, '4')).toEqual([false, 'minimum is 5'])
        expect(validate({ type: 'number', enum: ['1', '2'] }, '3')).toEqual([false, "'3' - invalid value"])
    })

    test('boolean', () => {
        expect(validate({ type: 'boolean' }, '')).toEqual([true, undefined])
        expect(validate({ type: 'boolean' }, 'true')).toEqual([true, undefined])
        expect(validate({ type: 'boolean' }, 'false')).toEqual([true, undefined])
        expect(validate({ type: 'boolean' }, 1)).toEqual([true, undefined])
        expect(validate({ type: 'boolean' }, 0)).toEqual([true, undefined])
        expect(validate({ type: 'boolean' }, 'yes')).toEqual([false, 'must be: true or false (1 or 0)'])
    })

    test('array: уникальность и элементы', () => {
        expect(validate({ type: 'array', items: { type: 'string' } }, ['a', 'b'])).toEqual([true, undefined])
        expect(validate({ type: 'array', items: { type: 'string' } }, ['a', 'a']))
            .toEqual([false, 'a duplicated'])
        expect(validate({ type: 'array', items: { type: 'number' } }, ['1', 'x']))
            .toEqual([false, 'must be a number'])
        expect(validate({
            type: 'array',
            uniqueItems: false,
            items: { type: 'string' },
        }, ['a', 'a'])).toEqual([true, undefined])
    })

    test('pair: ключ из enum и уникальность ключей', () => {
        const schema = { type: 'pair', enum: ['a', 'b'] }
        expect(validate(schema, 'a=1')).toEqual([true, undefined])
        expect(validate(schema, 'c=1')).toEqual([false, "'c=1' - invalid value"])

        expect(validate({
            type: 'array',
            items: { type: 'pair', enum: ['a', 'b'] },
        }, ['a=1', 'a=2'])).toEqual([false, 'a=2 duplicated'])
    })

    test('неизвестный тип валидируется как строка', () => {
        expect(validate({ type: 'something' }, 'v')).toEqual([true, undefined])
    })
})
