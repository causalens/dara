import { resolveNested, setNested } from '../../js/shared/interactivity/nested';

describe('Nested variable helpers', () => {
    describe('Resolve nested', () => {
        it('should return same object if nested or object are invalid', () => {
            const emptyObject = {};
            const testObject = {
                nested: {
                    key: 'value',
                },
            };

            // Nested not provided
            expect(resolveNested(testObject, [])).toBe(testObject);
            expect(resolveNested(testObject, undefined)).toBe(testObject);

            // Not an object or empty object
            expect(resolveNested(emptyObject, [] as never[])).toBe(emptyObject);
            expect(resolveNested(undefined, ['anything' as never])).toBe(undefined);
            expect(resolveNested(null, ['anything' as never])).toBe(null);

            // This is prevented by TypeScript but needs to be tested just in case
            expect(resolveNested('something' as unknown as Record<string, any>, ['anything' as never])).toBe(
                'something'
            );
        });
        it('should return null if attempting to retrieve a missing value', () => {
            const testObject = {
                key: 'value',
            } as Record<string, any>;

            expect(resolveNested(testObject, ['badKey'])).toEqual(null);
        });
        it('should retrieve nested value correctly', () => {
            const testObject = {
                a: {
                    b: {
                        c: 'd',
                    },
                },
            };

            // Testing a few depth levels
            expect(resolveNested(testObject, ['a', 'b', 'c'])).toBe('d');
            expect(resolveNested(testObject, ['a', 'b'])).toStrictEqual({ c: 'd' });
            expect(resolveNested(testObject, ['a'])).toStrictEqual({ b: { c: 'd' } });
            expect(resolveNested(testObject, [])).toStrictEqual(testObject);
        });
    });
    describe('Set nested', () => {
        it('should return same object if nested or object are invalid', () => {
            const emptyObject = {};
            const testObject = {
                nested: {
                    key: 'value',
                },
            };

            // Nested not provided
            expect(setNested(testObject, [], 'anything')).toStrictEqual(testObject);
            expect(setNested(testObject, undefined, 'anything')).toStrictEqual(testObject);

            // Not an object or empty object
            expect(setNested(emptyObject, [] as never[], 'anything')).toStrictEqual(emptyObject);
            expect(setNested(undefined, ['anything' as never], 'anything')).toBe(undefined);
            expect(setNested(null, ['anything' as never], 'anything')).toBe(null);

            // This is prevented by TypeScript but needs to be tested just in case
            expect(setNested('something' as unknown as Record<string, any>, ['anything' as never], 'anything')).toBe(
                'something'
            );
        });
        it('should add objects along the path when attempting to add a key which does not exist', () => {
            const testObject = {
                nested: {
                    key: 'value',
                },
            } as Record<string, any>;

            // Check both for immediate paths and nested ones
            expect(setNested(testObject, ['nested', 'badKey', 'badNestedKey'], 'anyValue')).toStrictEqual({
                nested: {
                    badKey: {
                        badNestedKey: 'anyValue',
                    },
                    key: 'value',
                },
            });
            expect(setNested(testObject, ['badKey'], 'anyValue')).toStrictEqual({
                badKey: 'anyValue',
                nested: {
                    key: 'value',
                },
            });
        });
        it('should retrieve nested value correctly', () => {
            const testObject = {
                a: {
                    b: {
                        c: 'd',
                    },
                    e: 'f',
                },
                g: 'h',
            };

            // Testing a few depth levels
            expect(setNested(testObject, ['a', 'b', 'c'], 'd_modified').a.b.c).toBe('d_modified');
            expect(setNested(testObject, ['a', 'e'], 'f_modified').a.e).toBe('f_modified');
            expect(setNested(testObject, ['g'], 'h_modified').g).toBe('h_modified');
        });
    });
});
