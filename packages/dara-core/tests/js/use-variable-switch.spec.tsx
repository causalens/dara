import { act, renderHook, waitFor } from '@testing-library/react';

import { useVariable } from '../../js/shared';
import { clearRegistries_TEST } from '../../js/shared/interactivity/store';
import type { SwitchVariable, Variable } from '../../js/types';
import { Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
jest.mock('lodash/debounce', () => jest.fn((fn) => fn));

mockLocalStorage();

describe('useVariable - SwitchVariable', () => {
    beforeEach(() => {
        server.listen();
        window.localStorage.clear();
        jest.useFakeTimers();
        jest.restoreAllMocks();
        clearRegistries_TEST();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    describe('Boolean Switching', () => {
        it('should switch between true and false values based on boolean condition', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-bool',
                value: true as any,
                value_map: { true: 'admin_panel', false: 'user_panel' },
                default: 'default_panel',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('admin_panel');
            expect(result.current[1]).toBeInstanceOf(Function);
        });

        it('should return false value when condition is false', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-bool-false',
                value: false as any,
                value_map: { true: 'admin_panel', false: 'user_panel' },
                default: 'default_panel',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('user_panel');
        });
    });

    describe('Value Mapping', () => {
        it('should map string values to corresponding outputs', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-mapping',
                value: 'admin' as any,
                value_map: {
                    admin: 'full_access',
                    editor: 'write_access',
                    viewer: 'read_access',
                },
                default: 'no_access',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('full_access');
        });

        it('should return default value when key not found in mapping', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-default',
                value: 'unknown_role' as any,
                value_map: {
                    admin: 'full_access',
                    editor: 'write_access',
                    viewer: 'read_access',
                },
                default: 'no_access',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('no_access');
        });
    });

    describe('Variable Dependencies', () => {
        it('should work with Variable as switch value', async () => {
            const baseVariable: Variable<boolean> = {
                __typename: 'Variable',
                uid: 'base-var',
                default: true,
                nested: [],
            };

            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-with-var',
                value: baseVariable as any,
                value_map: { true: 'enabled', false: 'disabled' },
                default: 'unknown',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            await waitFor(() => {
                expect(result.current[0]).toBe('enabled');
            });
        });

        it('should work with Variable as value_map', async () => {
            const mapVariable: Variable<Record<string, string>> = {
                __typename: 'Variable',
                uid: 'map-var',
                default: { admin: 'full_access', user: 'limited_access' },
                nested: [],
            };

            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-with-map-var',
                value: 'admin' as any,
                value_map: mapVariable,
                default: 'no_access',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            await waitFor(() => {
                expect(result.current[0]).toBe('full_access');
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle numeric keys correctly', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-numeric',
                value: 1 as any,
                value_map: { 1: 'one', 2: 'two', 3: 'three' },
                default: 'unknown',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('one');
        });

        it('should handle null/undefined values gracefully', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-null',
                value: null as any,
                value_map: { null: 'null_value', undefined: 'undefined_value' },
                default: 'fallback',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBe('null_value');
        });

        it('should return undefined when no default is provided and key not found', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-no-default',
                value: 'missing_key' as any,
                value_map: { existing_key: 'value' },
                default: undefined,
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[0]).toBeUndefined();
        });

        it('should return warning function for update attempts', () => {
            const switchVariable: SwitchVariable<string> = {
                __typename: 'SwitchVariable',
                uid: 'switch-readonly',
                value: true as any,
                value_map: { true: 'readonly', false: 'editable' },
                default: 'unknown',
            };

            const { result } = renderHook(() => useVariable(switchVariable), {
                wrapper: Wrapper,
            });

            expect(result.current[1]).toBeInstanceOf(Function);
            
            // Test that calling the update function logs a warning
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            act(() => {
                result.current[1]('new_value');
            });
            expect(consoleSpy).toHaveBeenCalledWith(
                'You tried to call update on variable with derived state, this is a noop and will be ignored.'
            );
            consoleSpy.mockRestore();
        });
    });
});