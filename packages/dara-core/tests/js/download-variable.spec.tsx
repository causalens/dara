import { describe, expect, it } from "vitest";
import { processDataForDownload, restoreColumnName } from '../../js/actions/download-variable';

describe('Download Variable Processing Utils', () => {
    describe('restoreColumnName', () => {
        it('should restore original column names from __col__ format', () => {
            expect(restoreColumnName('__col__0__Sales')).toBe('Sales');
            expect(restoreColumnName('__col__1__Profit')).toBe('Profit');
            expect(restoreColumnName('__col__10__Revenue_Q1')).toBe('Revenue_Q1');
        });

        it('should handle multi-index flattened column names', () => {
            expect(restoreColumnName('__col__0__Sales_Q1')).toBe('Sales_Q1');
            expect(restoreColumnName('__col__1__Sales_Q2')).toBe('Sales_Q2');
            expect(restoreColumnName('__col__2__Profit_Q1')).toBe('Profit_Q1');
        });

        it('should preserve __index__ columns as-is and restore index columns', () => {
            expect(restoreColumnName('__index__0__level_0')).toBe('level_0');
            expect(restoreColumnName('__index__1__Store')).toBe('Store');
            expect(restoreColumnName('__index__')).toBe('__index__');
        });

        it('should return unchanged names that do not match patterns', () => {
            expect(restoreColumnName('NormalColumn')).toBe('NormalColumn');
            expect(restoreColumnName('col__0__test')).toBe('col__0__test');
            expect(restoreColumnName('__col_malformed')).toBe('__col_malformed');
        });

        it('should handle edge cases', () => {
            expect(restoreColumnName('')).toBe('');
            expect(restoreColumnName('__col__0__')).toBe('__col__0__'); // No match, returns as-is
            expect(restoreColumnName('__col__999__VeryLongColumnName')).toBe('VeryLongColumnName');
        });
    });

    describe('processDataForDownload', () => {
        it('should process simple data with __col__ prefixes', () => {
            const input = [
                {
                    __col__0__Name: 'John',
                    __col__1__Age: 30,
                    __col__2__City: 'NYC',
                },
                {
                    __col__0__Name: 'Jane',
                    __col__1__Age: 25,
                    __col__2__City: 'LA',
                },
            ];

            const expected = [
                { Name: 'John', Age: 30, City: 'NYC' },
                { Name: 'Jane', Age: 25, City: 'LA' },
            ];

            expect(processDataForDownload(input)).toEqual(expected);
        });

        it('should remove all __index__ columns', () => {
            const input = [
                {
                    __index__: 0,
                    __index__0__level_0: 'Store',
                    __index__1__level_1: 'A',
                    __col__0__Sales: 100,
                    __col__1__Profit: 20,
                },
                {
                    __index__: 1,
                    __index__0__level_0: 'Store',
                    __index__1__level_1: 'B',
                    __col__0__Sales: 80,
                    __col__1__Profit: 15,
                },
            ];

            const expected = [
                { level_0: 'Store', level_1: 'A', Sales: 100, Profit: 20 },
                { level_0: 'Store', level_1: 'B', Sales: 80, Profit: 15 },
            ];

            expect(processDataForDownload(input)).toEqual(expected);
        });

        it('should handle multi-index flattened columns', () => {
            const input = [
                {
                    __index__0__level_0: 'Store',
                    __index__1__level_1: 'A',
                    __col__0__Sales_Q1: 100,
                    __col__1__Sales_Q2: 120,
                    __col__2__Profit_Q1: 20,
                    __col__3__Profit_Q2: 25,
                },
            ];

            const expected = [
                {
                    level_0: 'Store',
                    level_1: 'A',
                    Sales_Q1: 100,
                    Sales_Q2: 120,
                    Profit_Q1: 20,
                    Profit_Q2: 25,
                },
            ];

            expect(processDataForDownload(input)).toEqual(expected);
        });

        it('should handle mixed column formats', () => {
            const input = [
                {
                    __index__: 0,
                    __col__0__ProcessedCol: 'value1',
                    NormalCol: 'value2',
                    __index__1__SomeIndex: 'indexValue',
                    __col__1__AnotherCol: 'value3',
                },
            ];

            const expected = [
                {
                    SomeIndex: 'indexValue',
                    ProcessedCol: 'value1',
                    NormalCol: 'value2',
                    AnotherCol: 'value3',
                },
            ];

            expect(processDataForDownload(input)).toEqual(expected);
        });

        it('should handle empty data', () => {
            expect(processDataForDownload([])).toEqual([]);
        });

        it('should handle rows with no processable columns', () => {
            const input = [
                {
                    __index__: 0,
                },
            ];

            const expected = [{}];

            expect(processDataForDownload(input)).toEqual(expected);
        });

        it('should preserve data types', () => {
            const input = [
                {
                    __col__0__StringCol: 'text',
                    __col__1__NumberCol: 42,
                    __col__2__BoolCol: true,
                    __col__3__NullCol: null,
                    __col__4__ArrayCol: [1, 2, 3],
                    __col__5__ObjectCol: { nested: 'value' },
                },
            ];

            const expected = [
                {
                    StringCol: 'text',
                    NumberCol: 42,
                    BoolCol: true,
                    NullCol: null,
                    ArrayCol: [1, 2, 3],
                    ObjectCol: { nested: 'value' },
                },
            ];

            expect(processDataForDownload(input)).toEqual(expected);
        });
    });
});

