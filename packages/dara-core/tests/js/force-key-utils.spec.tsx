import {
    countTriggersForVariable,
    embedForceKeyInResolvedVariable,
    embedForceKeyInValues,
    embedForceKeyInValuesWithMap,
} from '../../js/shared/interactivity/derived-variable';
import { buildTriggerMap } from '../../js/shared/interactivity/triggers';
import type { DataVariable, DerivedDataVariable, DerivedVariable, SingleVariable } from '../../js/types';

describe('Force Key Utility Functions', () => {
    describe('countTriggersForVariable', () => {
        it('should count 1 trigger for a simple derived variable with no nested variables', () => {
            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'simple-var',
                variables: [],
            };

            expect(countTriggersForVariable(variable)).toBe(1);
        });

        it('should count triggers correctly for derived variable with single variables', () => {
            const singleVar: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'single-var',
            };

            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'derived-var',
                variables: [singleVar],
            };

            // 1 for the derived variable itself + 0 for single variables (they don't contribute triggers)
            expect(countTriggersForVariable(variable)).toBe(1);
        });

        it('should count triggers correctly for derived variable with data variables', () => {
            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'derived-var',
                variables: [dataVar],
            };

            // 1 for the derived variable itself + 1 for the data variable
            expect(countTriggersForVariable(variable)).toBe(2);
        });

        it('should count triggers correctly for nested derived variables', () => {
            const nestedDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived',
                variables: [],
            };

            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'parent-derived',
                variables: [nestedDerived],
            };

            // 1 for parent + 1 for nested derived variable
            expect(countTriggersForVariable(variable)).toBe(2);
        });

        it('should count triggers correctly for complex nested structure', () => {
            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const nestedDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived',
                variables: [dataVar], // nested has 1 data variable
            };

            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'parent-derived',
                variables: [nestedDerived],
            };

            // 1 for parent + (1 for nested derived + 1 for its data variable) = 3
            expect(countTriggersForVariable(variable)).toBe(3);
        });

        it('should count triggers correctly for derived data variable', () => {
            const singleVar: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'single-var',
            };

            const variable: DerivedDataVariable = {
                __typename: 'DerivedDataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                deps: [],
                filters: null,
                uid: 'derived-data-var',
                variables: [singleVar],
            };

            // 1 for the derived data variable itself
            expect(countTriggersForVariable(variable)).toBe(1);
        });

        it('should count triggers correctly for deeply nested structure with multiple variable types', () => {
            const singleVar: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'single-var',
            };

            const dataVar1: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var-1',
            };

            const dataVar2: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var-2',
            };

            const nestedDerived1: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived-1',
                variables: [singleVar, dataVar1], // 0 + 1 = 1 trigger
            };

            const nestedDerived2: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived-2',
                variables: [dataVar2], // 1 trigger
            };

            const parentDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'parent-derived',
                variables: [nestedDerived1, nestedDerived2],
            };

            // 1 (parent) + (1 (nested1) + 1 (data1)) + (1 (nested2) + 1 (data2)) = 5 triggers
            expect(countTriggersForVariable(parentDerived)).toBe(5);
        });

        it('should handle empty variables array', () => {
            const variable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'empty-var',
                variables: [],
            };

            // 1 for the derived variable itself, even with empty variables
            expect(countTriggersForVariable(variable)).toBe(1);
        });
    });

    describe('embedForceKeyInResolvedVariable', () => {
        it('should embed force_key in resolved derived variable', () => {
            const resolvedVariable = {
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'test-var',
                values: [],
            };

            embedForceKeyInResolvedVariable(resolvedVariable, 'test-force-key');

            expect(resolvedVariable).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'test-var',
                values: [],
            });
        });

        it('should embed force_key in resolved derived data variable', () => {
            const resolvedVariable = {
                __typename: 'ResolvedDerivedDataVariable',
                type: 'derived-data',
                uid: 'test-data-var',
                filters: null,
                values: [],
            };

            embedForceKeyInResolvedVariable(resolvedVariable, 'test-force-key');

            expect(resolvedVariable).toEqual({
                __typename: 'ResolvedDerivedDataVariable',
                force_key: 'test-force-key',
                type: 'derived-data',
                uid: 'test-data-var',
                filters: null,
                values: [],
            });
        });

        it('should not modify non-resolved variable objects', () => {
            const nonResolvedVariable = {
                type: 'single',
                uid: 'test-var',
                value: 42,
            };

            const originalVariable = { ...nonResolvedVariable };
            embedForceKeyInResolvedVariable(nonResolvedVariable, 'test-force-key');

            // Should remain unchanged
            expect(nonResolvedVariable).toEqual(originalVariable);
        });
    });

    describe('embedForceKeyInValues', () => {
        it('should not modify values when force key is null', () => {
            const values = [
                { type: 'single', uid: 'var1', value: 1 },
                { type: 'single', uid: 'var2', value: 2 },
            ];
            const variables = [
                { __typename: 'Variable', uid: 'var1' },
                { __typename: 'Variable', uid: 'var2' },
            ];

            const originalValues = JSON.parse(JSON.stringify(values));
            embedForceKeyInValues(values, variables, null, 0, 0);

            expect(values).toEqual(originalValues);
        });

        it('should embed force key in the correct variable when triggered', () => {
            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] },
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var2', values: [] },
            ];
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var2', variables: [] },
            ];

            embedForceKeyInValues(values, variables, 'test-force-key', 0, 0);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'var1',
                values: [],
            });
            expect(values[1]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var2',
                values: [],
            });
        });

        it('should handle self trigger offset correctly', () => {
            const values = [{ __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] }];
            const variables = [{ __typename: 'DerivedVariable', uid: 'var1', variables: [] }];

            // When selfTriggerOffset > 0 and triggerIndex === 0, should not embed in any variable
            embedForceKeyInValues(values, variables, 'test-force-key', 0, 1);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var1',
                values: [],
            });
        });

        it('should handle complex nested variable structures', () => {
            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const nestedDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived',
                variables: [dataVar],
            };

            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'nested-derived', values: [] },
            ];
            const variables = [nestedDerived];

            // Trigger index 1 should correspond to the data variable within the nested derived variable
            embedForceKeyInValues(values, variables, 'test-force-key', 1, 0);

            // The nested derived variable should get the force key since the trigger belongs to it
            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'nested-derived',
                values: [],
            });
        });

        it('should handle multiple variables with different trigger indices', () => {
            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] },
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var2', values: [] },
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var3', values: [] },
            ];
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var2', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var3', variables: [] },
            ];

            // Trigger index 1 should embed force key in the second variable
            embedForceKeyInValues(values, variables, 'test-force-key', 1, 0);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var1',
                values: [],
            });
            expect(values[1]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'var2',
                values: [],
            });
            expect(values[2]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var3',
                values: [],
            });
        });

        it('should handle mixed variable types correctly', () => {
            const singleVar: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'single-var',
            };

            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const derivedVar: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'derived-var',
                variables: [singleVar, dataVar],
            };

            const values = [{ __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'derived-var', values: [] }];
            const variables = [derivedVar];

            // Trigger index 1 should correspond to the data variable within the derived variable
            // (single variables don't contribute triggers, so index 1 = data variable)
            embedForceKeyInValues(values, variables, 'test-force-key', 1, 0);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'derived-var',
                values: [],
            });
        });

        it('should handle trigger index beyond available triggers', () => {
            const values = [{ __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] }];
            const variables = [{ __typename: 'DerivedVariable', uid: 'var1', variables: [] }];

            // Trigger index 5 is beyond the available triggers (only 1 trigger available)
            embedForceKeyInValues(values, variables, 'test-force-key', 5, 0);

            // Should not embed force key in any variable
            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var1',
                values: [],
            });
        });

        it('should handle derived data variables correctly', () => {
            const values = [
                { __typename: 'ResolvedDerivedDataVariable', type: 'derived-data', uid: 'derived-data-var', filters: null, values: [] },
            ];
            const variables = [
                { __typename: 'DerivedDataVariable', uid: 'derived-data-var', variables: [] },
            ];

            embedForceKeyInValues(values, variables, 'test-force-key', 0, 0);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedDataVariable',
                force_key: 'test-force-key',
                type: 'derived-data',
                uid: 'derived-data-var',
                filters: null,
                values: [],
            });
        });
    });

    describe('buildTriggerMap', () => {
        it('should build correct trigger map for simple derived variable', () => {
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
            ];

            const triggerMap = buildTriggerMap(variables);

            expect(triggerMap.size).toBe(1);
            expect(triggerMap.get(0)).toEqual({
                index: 0,
                variableIndex: 0,
                variable: variables[0],
            });
        });

        it('should build correct trigger map for nested structure', () => {
            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const nestedDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived',
                variables: [dataVar],
            };

            const variables = [nestedDerived];
            const triggerMap = buildTriggerMap(variables);

            expect(triggerMap.size).toBe(2);
            
            // First trigger: the nested derived variable itself
            expect(triggerMap.get(0)).toEqual({
                index: 0,
                variableIndex: 0,
                variable: nestedDerived,
            });
            
            // Second trigger: the data variable within the nested derived
            expect(triggerMap.get(1)).toEqual({
                index: 1,
                variableIndex: 0, // Should point to the parent derived variable
                variable: dataVar,
            });
        });

        it('should build correct trigger map for multiple variables', () => {
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var2', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var3', variables: [] },
            ];

            const triggerMap = buildTriggerMap(variables);

            expect(triggerMap.size).toBe(3);
            expect(triggerMap.get(0)?.variableIndex).toBe(0);
            expect(triggerMap.get(1)?.variableIndex).toBe(1);
            expect(triggerMap.get(2)?.variableIndex).toBe(2);
        });
    });

    describe('embedForceKeyInValuesWithMap', () => {
        it('should embed force key using trigger map efficiently', () => {
            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] },
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var2', values: [] },
            ];
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
                { __typename: 'DerivedVariable', uid: 'var2', variables: [] },
            ];

            const triggerMap = buildTriggerMap(variables);
            embedForceKeyInValuesWithMap(values, triggerMap, 'test-force-key', 1, 0);

            expect(values[0]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                type: 'derived',
                uid: 'var1',
                values: [],
            });
            expect(values[1]).toEqual({
                __typename: 'ResolvedDerivedVariable',
                force_key: 'test-force-key',
                type: 'derived',
                uid: 'var2',
                values: [],
            });
        });

        it('should handle null force key gracefully', () => {
            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] },
            ];
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
            ];

            const triggerMap = buildTriggerMap(variables);
            const originalValues = JSON.parse(JSON.stringify(values));
            
            embedForceKeyInValuesWithMap(values, triggerMap, null, 0, 0);

            expect(values).toEqual(originalValues);
        });

        it('should handle self trigger offset correctly', () => {
            const values = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'var1', values: [] },
            ];
            const variables = [
                { __typename: 'DerivedVariable', uid: 'var1', variables: [] },
            ];

            const triggerMap = buildTriggerMap(variables);
            const originalValues = JSON.parse(JSON.stringify(values));
            
            // When selfTriggerOffset > 0 and triggerIndex === 0, should not embed
            embedForceKeyInValuesWithMap(values, triggerMap, 'test-force-key', 0, 1);

            expect(values).toEqual(originalValues);
        });
    });

    describe('Trigger Map vs Original Implementation Consistency', () => {
        it('should produce identical results for complex nested structure', () => {
            const singleVar: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'single-var',
            };

            const dataVar: DataVariable = {
                __typename: 'DataVariable',
                cache: { policy: 'default', cache_type: 'session' },
                filters: null,
                uid: 'data-var',
            };

            const nestedDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'nested-derived',
                variables: [singleVar, dataVar],
            };

            const variables = [nestedDerived];
            
            // Test with original implementation
            const valuesOriginal = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'nested-derived', values: [] },
            ];
            embedForceKeyInValues(valuesOriginal, variables, 'test-force-key', 1, 0);

            // Test with trigger map implementation
            const valuesWithMap = [
                { __typename: 'ResolvedDerivedVariable', type: 'derived', uid: 'nested-derived', values: [] },
            ];
            const triggerMap = buildTriggerMap(variables);
            embedForceKeyInValuesWithMap(valuesWithMap, triggerMap, 'test-force-key', 1, 0);

            // Results should be identical
            expect(valuesWithMap).toEqual(valuesOriginal);
        });
    });
});

