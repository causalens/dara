/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';

import { type DerivedVariable, type StateVariable } from '@/types/core';
import { useVariable } from '@/shared/interactivity/use-variable';
import { Wrapper } from './utils';

// Mock the API calls
jest.mock('@/api/core', () => ({
    fetchDerivedVariable: jest.fn(),
}));

describe('useVariable with StateVariable', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createDerivedVariable = (): DerivedVariable => ({
        __typename: 'DerivedVariable',
        uid: 'test-derived-var',
        variables: [],
        deps: [],
        nested: [],
        cache: null,
    });

    const createStateVariable = (parentVariable: DerivedVariable, propertyName: 'loading' | 'error' | 'hasValue'): StateVariable => ({
        __typename: 'StateVariable',
        uid: `${parentVariable.uid}-${propertyName}`,
        parent_variable: parentVariable,
        property_name: propertyName,
    });

    it('should handle StateVariable for loading state', () => {
        const derivedVar = createDerivedVariable();
        const loadingStateVar = createStateVariable(derivedVar, 'loading');

        const { result } = renderHook(() => useVariable(loadingStateVar), {
            wrapper: Wrapper,
        });

        // Initially should be loading (true)
        expect(result.current[0]).toBe(true);

        // The second element should be a warning function for derived state
        expect(typeof result.current[1]).toBe('function');
    });

    it('should handle StateVariable for error state', () => {
        const derivedVar = createDerivedVariable();
        const errorStateVar = createStateVariable(derivedVar, 'error');

        const { result } = renderHook(() => useVariable(errorStateVar), {
            wrapper: Wrapper,
        });

        // Initially should not have error (false)
        expect(result.current[0]).toBe(false);

        // The second element should be a warning function for derived state
        expect(typeof result.current[1]).toBe('function');
    });

    it('should handle StateVariable for hasValue state', () => {
        const derivedVar = createDerivedVariable();
        const hasValueStateVar = createStateVariable(derivedVar, 'hasValue');

        const { result } = renderHook(() => useVariable(hasValueStateVar), {
            wrapper: Wrapper,
        });

        // Initially should not have value (false)
        expect(result.current[0]).toBe(false);

        // The second element should be a warning function for derived state
        expect(typeof result.current[1]).toBe('function');
    });

    it('should warn when trying to update StateVariable', () => {
        const derivedVar = createDerivedVariable();
        const loadingStateVar = createStateVariable(derivedVar, 'loading');

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const { result } = renderHook(() => useVariable(loadingStateVar), {
            wrapper: Wrapper,
        });

        // Try to update the state variable - this should warn
        result.current[1](false as any);

        expect(consoleSpy).toHaveBeenCalledWith(
            'You tried to call update on variable with derived state, this is a noop and will be ignored.'
        );

        consoleSpy.mockRestore();
    });
});