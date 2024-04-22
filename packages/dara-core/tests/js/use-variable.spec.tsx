import { Matcher, MatcherOptions, act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { rest } from 'msw';
import hash from 'object-hash';
import { useRecoilCallback } from 'recoil';

import { EventCapturer } from '@/shared/event-bus/event-bus';
import { getSessionKey } from '@/shared/interactivity/persistence';
import { DaraEventMap } from '@/types/event-types';

import { RequestExtrasProvider, useAction, useVariable } from '../../js/shared';
import {
    atomFamilyMembersRegistry,
    atomFamilyRegistry,
    clearRegistries_TEST,
} from '../../js/shared/interactivity/store';
import { getIdentifier } from '../../js/shared/utils/normalization';
import { Action, DerivedVariable, SingleVariable, UrlVariable, Variable } from '../../js/types';
import { DataVariable, TriggerVariableImpl } from '../../js/types/core';
import { MockWebSocketClient, Wrapper, server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
jest.mock('lodash/debounce', () => jest.fn((fn) => fn));

mockLocalStorage();

// Mock component to test interaction between multiple variables
const MockComponent = (props: {
    derivedVar: DerivedVariable;
    variableA: Variable<any>;
    variableB: Variable<any>;
}): JSX.Element => {
    const [a, setA] = useVariable(props.variableA);
    const [b, setB] = useVariable(props.variableB);
    const [c] = useVariable(props.derivedVar);

    return (
        <div>
            <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
            <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
            <span data-testid="c">{JSON.stringify(c)}</span>
        </div>
    );
};
// Helper to init the MockComponent and check its initial state
async function initComponent(
    varA: Variable<any>,
    varB: Variable<any>,
    derivedVar: DerivedVariable
): Promise<(id: Matcher, options?: MatcherOptions) => HTMLElement> {
    const { getByTestId } = wrappedRender(<MockComponent derivedVar={derivedVar} variableA={varA} variableB={varB} />);
    await waitFor(() => expect(getByTestId('c')).toBeVisible());
    const result = getByTestId('c').innerHTML;
    expect(result).toEqual(
        `{"force":false,"is_data_variable":false,"values":{"data":[{"__ref":"${getIdentifier(
            varA
        )}"},{"__ref":"${getIdentifier(varB)}"}],"lookup":{"${getIdentifier(varA)}":1,"${getIdentifier(
            varB
        )}":2}},"ws_channel":"uid"}`
    );
    return getByTestId;
}
// Helper to update a given input in the component
const updateInput = async (
    inputId: string,
    value: number,
    getter: (_props: any) => HTMLElement,
    resultTestId = 'c'
): Promise<Record<string, any>> => {
    act(() => {
        const input = getter(inputId);
        fireEvent.change(input, { target: { value } });
    });
    await waitFor(() => expect(getter('c')).toBeVisible());
    return JSON.parse(getter(resultTestId).innerHTML);
};

// Dummy variables
const variableA: SingleVariable<number> = {
    __typename: 'Variable',
    default: 1,
    nested: [],
    uid: 'a',
};
const variableB: SingleVariable<number> = {
    __typename: 'Variable',
    default: 2,
    nested: [],
    uid: 'b',
};
const variableC: SingleVariable<number> = {
    __typename: 'Variable',
    default: 3,
    nested: [],
    uid: 'C',
};

const SESSION_TOKEN = 'TEST_TOKEN';

describe('useVariable', () => {
    beforeEach(() => {
        server.listen();
        window.localStorage.clear();
        jest.useFakeTimers();
        jest.restoreAllMocks();

        // This is necessary to avoid data bleeding between tests
        // Though this causes warnings about duplicate atoms in the test console
        clearRegistries_TEST();
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        server.resetHandlers();
    });
    afterAll(() => server.close());

    describe('Plain Variable', () => {
        it('should accept a variable as an argument and create a recoil state for it', () => {
            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'Variable',
                        default: undefined,
                        nested: [],
                        uid: 'test',
                    } satisfies Variable<string>),
                {
                    wrapper: Wrapper,
                }
            );
            expect(result.current[0]).toBeUndefined();
            expect(result.current[1]).toBeInstanceOf(Function);

            act(() => {
                result.current[1]('test');
            });

            expect(result.current[0]).toBe('test');
        });

        it('should accept a normal value as an argument and create a dummy state for it', () => {
            const { result } = renderHook(() => useVariable<string>('test'), { wrapper: Wrapper });
            expect(result.current[0]).toBe('test');
            expect(result.current[1]).toBeInstanceOf(Function);

            act(() => {
                result.current[1]('test_noop');
            });

            // Value changes even if not a variable
            expect(result.current[0]).toBe('test_noop');
        });

        it('should resolve nested values for Variables', () => {
            const baseNestedVariable = {
                __typename: 'Variable',
                default: {
                    nested: {
                        key1: 'value1',
                        key2: 'value2',
                    },
                },
                nested: [],
                uid: 'nested_variable',
            } as Variable<Record<string, any>>;

            // Two variables pointing to the same UID but with different nested setting should correctly
            // Resolve to the nested respective values
            const variable1 = { ...baseNestedVariable, nested: ['nested', 'key1'] } as Variable<Record<string, any>>;
            const variable2 = { ...baseNestedVariable, nested: ['nested', 'key2'] } as Variable<Record<string, any>>;

            const { result: result1 } = renderHook(() => useVariable<Record<string, any>>(variable1), {
                wrapper: Wrapper,
            });
            const { result: result2 } = renderHook(() => useVariable<Record<string, any>>(variable2), {
                wrapper: Wrapper,
            });

            expect(result1.current[0]).toBe('value1');
            expect(result2.current[0]).toBe('value2');

            // Updating them should also work
            act(() => {
                result1.current[1]('updated_value1' as any);
                result2.current[1]('updated_value2' as any);
            });

            expect(result1.current[0]).toBe('updated_value1');
            expect(result2.current[0]).toBe('updated_value2');
        });

        it('should save values to localStorage for a Variable', () => {
            const setItemSpy = jest.spyOn(window.localStorage, 'setItem');

            // We're using an object to make sure the serialisation works correctly
            const defaultValue = { val: 0 };
            const newValue = { val: 5 };

            const { result } = renderHook(
                () =>
                    useVariable<any>({
                        __typename: 'Variable',
                        default: defaultValue,
                        nested: [],
                        persist_value: true,
                        uid: 'session-test-1',
                    } as SingleVariable<any>),
                {
                    wrapper: Wrapper,
                }
            );
            expect(result.current[0]).toEqual(defaultValue);
            expect(result.current[1]).toBeInstanceOf(Function);

            act(() => {
                result.current[1](newValue);
            });

            expect(setItemSpy).toHaveBeenCalledWith(
                getSessionKey(SESSION_TOKEN, 'session-test-1'),
                JSON.stringify(newValue)
            );
            expect(result.current[0]).toEqual(newValue);
        });

        it('should save values to localStorage for a Variable with nested', () => {
            const setItemSpy = jest.spyOn(window.localStorage, 'setItem');

            // We're using an object to make sure the serialisation works correctly
            const defaultValue = { val: 0 };
            const newValue = { val: 5 };
            const { result } = renderHook(
                () =>
                    useVariable<any>({
                        __typename: 'Variable',
                        default: defaultValue,
                        nested: ['val'],
                        persist_value: true,
                        uid: 'session-test-2',
                    } as SingleVariable<any>),
                {
                    wrapper: Wrapper,
                }
            );
            expect(result.current[0]).toEqual(defaultValue.val);
            expect(result.current[1]).toBeInstanceOf(Function);

            act(() => {
                // We call with just the nested value
                result.current[1](newValue.val);
            });

            // The whole object should be stored in localStorage
            expect(setItemSpy).toHaveBeenCalledWith(
                getSessionKey(SESSION_TOKEN, 'session-test-2'),
                JSON.stringify(newValue)
            );
            expect(result.current[0]).toEqual(newValue.val);
        });

        it('should restore values from localStorage for a Variable', () => {
            const getItemSpy = jest.spyOn(window.localStorage, 'getItem');

            // We're using an object to make sure the serialisation works correctly
            const defaultValue = { val: 0 };
            const storedValue = { val: 1 };

            localStorage.setItem(getSessionKey(SESSION_TOKEN, 'session-test-3'), JSON.stringify(storedValue));

            const { result } = renderHook(
                () =>
                    useVariable<any>({
                        __typename: 'Variable',
                        default: defaultValue,
                        nested: [],
                        persist_value: true,
                        uid: 'session-test-3',
                    } as SingleVariable<any>),
                {
                    wrapper: Wrapper,
                }
            );

            // Stored value should be used instead of default
            expect(result.current[0]).toEqual(storedValue);
            expect(getItemSpy).toHaveBeenCalledWith(getSessionKey(SESSION_TOKEN, 'session-test-3'));
        });

        it('should restore values from localStorage for a Variable with nested', () => {
            const getItemSpy = jest.spyOn(localStorage, 'getItem');

            // We're using an object to make sure the serialisation works correctly
            const defaultValue = { val: 0 };
            const storedValue = { val: 1 };

            localStorage.setItem(getSessionKey(SESSION_TOKEN, 'session-test-4'), JSON.stringify(storedValue));

            const { result } = renderHook(
                () =>
                    useVariable<any>({
                        __typename: 'Variable',
                        default: defaultValue,
                        nested: ['val'],
                        persist_value: true,
                        uid: 'session-test-4',
                    } as SingleVariable<any>),
                {
                    wrapper: Wrapper,
                }
            );

            // Stored value should be used instead of default
            expect(result.current[0]).toEqual(storedValue.val);
            expect(getItemSpy).toHaveBeenCalledWith(getSessionKey(SESSION_TOKEN, 'session-test-4'));
        });

        it('should handle DerivedVariable as the default', async () => {
            const inputVariableDef: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'input-variable',
            };

            const derivedVariableDef: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [inputVariableDef],
                nested: [],
                uid: 'derived-variable',
                variables: [inputVariableDef],
            };

            const variableFromDerived: SingleVariable<string> = {
                __typename: 'Variable',
                default: derivedVariableDef,
                nested: [],
                uid: 'variable-from-derived',
            };

            function TestComponent(): JSX.Element {
                const [inputVar, setInputVar] = useVariable(inputVariableDef);
                const [derivedVar] = useVariable(derivedVariableDef);
                const [varFromDerived, setVarFromDerived] = useVariable(variableFromDerived);

                const resetAtom = useRecoilCallback(({ reset }) => () => {
                    const family = atomFamilyRegistry.get(variableFromDerived.uid);
                    // reset first instance
                    const atomInstance = atomFamilyMembersRegistry.get(family).values().next().value;
                    reset(atomInstance);
                });

                return (
                    <div>
                        <button data-testid="set-input" onClick={() => setInputVar(inputVar + 1)} type="button">
                            click
                        </button>
                        <span data-testid="derived">{JSON.stringify(derivedVar)}</span>
                        <span data-testid="var-from-derived">{JSON.stringify(varFromDerived)}</span>
                        <button
                            data-testid="set-var-from-derived"
                            onClick={() => setVarFromDerived('test3')}
                            type="button"
                        >
                            click
                        </button>
                        <button data-testid="reset" onClick={() => resetAtom()} type="button">
                            reset
                        </button>
                    </div>
                );
            }

            const { getByTestId } = wrappedRender(<TestComponent />);

            await waitFor(() => expect(getByTestId('derived')).toBeVisible());

            // Derived and input-from-derived should be the same
            expect(getByTestId('derived').innerHTML).toEqual(getByTestId('var-from-derived').innerHTML);
            const initialDerived = getByTestId('derived').innerHTML;
            // Update the input variable
            act(() => {
                fireEvent.click(getByTestId('set-input'));
            });
            await waitFor(() => expect(getByTestId('derived')).toBeVisible());
            expect(getByTestId('derived').innerHTML).not.toEqual(initialDerived);
            // Derived and input-from-derived should be the same again
            expect(getByTestId('derived').innerHTML).toEqual(getByTestId('var-from-derived').innerHTML);

            const secondDerived = getByTestId('derived').innerHTML;

            // Update the variable from derived
            act(() => {
                fireEvent.click(getByTestId('set-var-from-derived'));
            });

            // var-from-derived should be 'test3'
            expect(getByTestId('var-from-derived').innerHTML).toEqual('"test3"');

            // update derived again
            act(() => {
                fireEvent.click(getByTestId('set-input'));
            });

            await waitFor(() => expect(getByTestId('derived')).toBeVisible());
            // Derived should be updated
            expect(getByTestId('derived').innerHTML).not.toEqual(secondDerived);

            const thirdDerived = getByTestId('derived').innerHTML;

            // input-from-derived should not have been updated
            expect(getByTestId('var-from-derived').innerHTML).toEqual('"test3"');

            // Reset the variable from derived
            act(() => {
                fireEvent.click(getByTestId('reset'));
            });

            // var-from-derived should be back to the previous dv value
            await waitFor(() => expect(getByTestId('var-from-derived').innerHTML).toEqual(thirdDerived));
        });

        it('handles RequestExtras contexts for Variable with default DerivedVariable', async () => {
            /*
             * Here we're testing that the RequestExtras is correctly used for different callsites
             * of the same variable with a default DerivedVariable.
             * Expected behaviour:
             * - all call-sites are kept in-sync with each other
             * - correct 'default' behaviour is preserved (as in previous test)
             * - local extras are sent for initial DV requests
             */

            // keep track of headers received
            const receivedHeaders: Headers[] = [];

            server.use(
                rest.post('/api/core/derived-variable/:uid', async (req, res, ctx) => {
                    receivedHeaders.push(req.headers);
                    return res(
                        ctx.json({
                            cache_key: JSON.stringify(req.body.values),
                            value: req.body,
                        })
                    );
                })
            );

            const inputVariableDef: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'input-variable',
            };

            const derivedVariableDef: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [inputVariableDef],
                nested: [],
                uid: 'derived-variable',
                variables: [inputVariableDef],
            };

            const variableFromDerived: SingleVariable<string> = {
                __typename: 'Variable',
                default: derivedVariableDef,
                nested: [],
                uid: 'variable-from-derived',
            };

            function TestComponent({ dvKey }: { dvKey: string }): JSX.Element {
                const [inputVar, setInputVar] = useVariable(inputVariableDef);
                const [varFromDerived, setVarFromDerived] = useVariable(variableFromDerived);

                const resetAtom = useRecoilCallback(({ reset }) => () => {
                    const family = atomFamilyRegistry.get(variableFromDerived.uid);
                    // reset one of them, we don't care which as both should be reset
                    const atomInstance = atomFamilyMembersRegistry.get(family).values().next().value;
                    reset(atomInstance);
                });

                return (
                    <div>
                        <button
                            data-testid={`${dvKey}-set-input`}
                            onClick={() => setInputVar(inputVar + 1)}
                            type="button"
                        >
                            click
                        </button>
                        <span data-testid={`${dvKey}-var-from-derived`}>{JSON.stringify(varFromDerived)}</span>
                        <button
                            data-testid={`${dvKey}-set-var-from-derived`}
                            onClick={() => setVarFromDerived('test3')}
                            type="button"
                        >
                            click
                        </button>
                        <button data-testid={`${dvKey}-reset`} onClick={() => resetAtom()} type="button">
                            reset
                        </button>
                    </div>
                );
            }

            const { getByTestId } = wrappedRender(
                <>
                    <RequestExtrasProvider
                        options={{
                            headers: {
                                'X-Dara-Test': 'test',
                            },
                        }}
                    >
                        <TestComponent dvKey="dv-1" />
                    </RequestExtrasProvider>
                    <RequestExtrasProvider
                        options={{
                            headers: {
                                'X-Dara-Test': 'test2',
                            },
                        }}
                    >
                        <TestComponent dvKey="dv-2" />
                    </RequestExtrasProvider>
                </>
            );

            // wait for both components to be rendered
            await waitFor(() => {
                expect(getByTestId('dv-1-var-from-derived')).toBeVisible();
                expect(getByTestId('dv-2-var-from-derived')).toBeVisible();
            });

            // Check both components have the same initial value
            expect(getByTestId('dv-1-var-from-derived').innerHTML).toEqual(
                getByTestId('dv-2-var-from-derived').innerHTML
            );

            const initialDerived = getByTestId('dv-1-var-from-derived').innerHTML;

            await waitFor(() => expect(receivedHeaders.length).toBe(2));

            // check headers were received and different - order unknown
            expect(new Set(receivedHeaders.map((h) => h.get('X-Dara-Test')))).toEqual(new Set(['test', 'test2']));

            // Clear headers
            receivedHeaders.length = 0;

            // update the input variable for the DV
            act(() => {
                fireEvent.click(getByTestId('dv-1-set-input'));
            });

            // wait for both components to be rendered
            await waitFor(() => {
                expect(getByTestId('dv-1-var-from-derived')).toBeVisible();
                expect(getByTestId('dv-2-var-from-derived')).toBeVisible();
            });

            // Check both components have the same updated value but different than before
            expect(getByTestId('dv-1-var-from-derived').innerHTML).not.toEqual(initialDerived);
            expect(getByTestId('dv-1-var-from-derived').innerHTML).toEqual(
                getByTestId('dv-2-var-from-derived').innerHTML
            );

            const dvAfterUpdate = getByTestId('dv-1-var-from-derived').innerHTML;

            // Check we got 2 more headers, one for each component
            expect(receivedHeaders.length).toBe(2);
            expect(new Set(receivedHeaders.map((h) => h.get('X-Dara-Test')))).toEqual(new Set(['test', 'test2']));

            // Clear headers again
            receivedHeaders.length = 0;

            // Update one of the variables directly
            act(() => {
                fireEvent.click(getByTestId('dv-1-set-var-from-derived'));
            });

            // wait for both components to be rendered
            await waitFor(() => {
                expect(getByTestId('dv-1-var-from-derived')).toBeVisible();
                expect(getByTestId('dv-2-var-from-derived')).toBeVisible();
            });

            // Both should have updated
            expect(getByTestId('dv-1-var-from-derived').innerHTML).toEqual('"test3"');
            expect(getByTestId('dv-2-var-from-derived').innerHTML).toEqual('"test3"');

            // Reset one of the variables
            act(() => {
                fireEvent.click(getByTestId('dv-1-reset'));
            });

            // wait for both components to be rendered
            await waitFor(() => {
                expect(getByTestId('dv-1-var-from-derived')).toBeVisible();
                expect(getByTestId('dv-2-var-from-derived')).toBeVisible();
            });

            // They should go back to the (previous) DV value
            expect(getByTestId('dv-1-var-from-derived').innerHTML).toEqual(dvAfterUpdate);
            expect(getByTestId('dv-2-var-from-derived').innerHTML).toEqual(dvAfterUpdate);

            // No new headers should be received - DV was not recalculated
            expect(receivedHeaders.length).toBe(0);
        });
    });

    describe('Derived Variable', () => {
        it('should create a selector in the background for a DerivedVariable', async () => {
            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'DerivedVariable',
                        default: 'test',
                        deps: [
                            { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                            { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                        ],
                        nested: [],
                        uid: 'uid',
                        variables: [
                            { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                            { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                        ],
                    } as DerivedVariable),
                { wrapper: Wrapper }
            );
            await waitFor(() => {
                expect(result.current[0]).toStrictEqual({
                    force: false,
                    is_data_variable: false,
                    values: {
                        data: [{ __ref: 'Variable:dep1' }, { __ref: 'Variable:dep2' }],
                        lookup: { 'Variable:dep1': '1', 'Variable:dep2': '2' },
                    },
                    ws_channel: 'uid',
                });
                expect(result.current[1]).toBeInstanceOf(Function);
            });
        });

        it('should publish EventBus notification on resolution', async () => {
            const variable = {
                __typename: 'DerivedVariable',
                deps: [
                    { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                    { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                ],
                nested: [] as string[],
                uid: 'uid',
                variables: [
                    { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                    { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                ],
            } satisfies DerivedVariable;
            const receivedData: Array<DaraEventMap['DERIVED_VARIABLE_LOADED']> = [];

            const { result } = renderHook(() => useVariable<string>(variable), {
                wrapper: (props) => (
                    <EventCapturer
                        onEvent={(ev) => {
                            if (ev.type === 'DERIVED_VARIABLE_LOADED') {
                                receivedData.push(ev.data);
                            }
                        }}
                    >
                        <Wrapper>{props.children}</Wrapper>
                    </EventCapturer>
                ),
            });
            await waitFor(() => {
                expect(receivedData).toHaveLength(1);
            });
            expect(receivedData[0].variable).toEqual(variable);
            expect(receivedData[0].value).toEqual(result.current[0]);
        });

        it('should resolve nested value using the selector for a DerivedVariable', async () => {
            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'DerivedVariable',
                        default: 'test',
                        deps: [
                            {
                                __typename: 'Variable',
                                default: { nested_key: 'value' },
                                uid: 'dep_nested',
                            } as Variable<any>,
                        ],
                        nested: ['values'],
                        uid: 'uid',
                        variables: [
                            {
                                __typename: 'Variable',
                                default: { nested_key: 'value' },
                                uid: 'dep_nested',
                            } as Variable<any>,
                        ],
                    } as DerivedVariable),
                { wrapper: Wrapper }
            );
            await waitFor(() => {
                expect(result.current[0]).toStrictEqual({
                    data: [{ __ref: 'Variable:dep_nested' }],
                    lookup: { 'Variable:dep_nested': { nested_key: 'value' } },
                });
                expect(result.current[1]).toBeInstanceOf(Function);
            });
        });

        it('should keep on updating the derived variable if polling_interval is set', async () => {
            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'DerivedVariable',
                        default: 'test',
                        deps: [
                            { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                            { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                        ],
                        nested: [],
                        polling_interval: 2,
                        uid: 'uid',
                        variables: [
                            { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                            { __typename: 'Variable', default: '2', uid: 'dep2' } as Variable<string>,
                        ],
                    } as DerivedVariable),
                { wrapper: Wrapper }
            );
            await waitFor(() => {
                expect(result.current[0]).toStrictEqual({
                    force: false,
                    is_data_variable: false,
                    values: {
                        data: [
                            {
                                __ref: 'Variable:dep1',
                            },
                            {
                                __ref: 'Variable:dep2',
                            },
                        ],
                        lookup: {
                            'Variable:dep1': '1',
                            'Variable:dep2': '2',
                        },
                    },
                    ws_channel: 'uid',
                });
                expect(result.current[1]).toBeInstanceOf(Function);
            });

            act(() => {
                jest.advanceTimersByTime(2500);
            });

            await waitFor(() => {
                expect(result.current[0]).toStrictEqual({
                    force: true,
                    is_data_variable: false,
                    values: {
                        data: [
                            {
                                __ref: 'Variable:dep1',
                            },
                            {
                                __ref: 'Variable:dep2',
                            },
                        ],
                        lookup: {
                            'Variable:dep1': '1',
                            'Variable:dep2': '2',
                        },
                    },
                    ws_channel: 'uid',
                });
                expect(result.current[1]).toBeInstanceOf(Function);
            });
        });

        it('should always update DerivedVariable when deps is not defined', async () => {
            const variableNone: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [variableA, variableB],
                nested: [],
                uid: 'none',
                variables: [variableA, variableB],
            };

            const getter = await initComponent(variableA, variableB, variableNone);

            // Updating both inputs should update the derived var
            let result = await updateInput('a', 2, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 2, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });
            result = await updateInput('b', 3, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 2, 'Variable:b': 3 },
                },
                ws_channel: 'uid',
            });
        });

        it('should only update DerivedVariable once if deps is empty array', async () => {
            const variableEmpty: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'empty',
                variables: [variableA, variableB],
            };

            const getter = await initComponent(variableA, variableB, variableEmpty);

            // Updating either of the inputs should NOT update the derived var
            let result = await updateInput('a', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });
            result = await updateInput('b', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });
        });

        it('should only update DerivedVariable if a variable included in deps is updated', async () => {
            const variablePartial: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [variableA],
                nested: [],
                uid: 'partial',
                variables: [variableA, variableB],
            };

            const getter = await initComponent(variableA, variableB, variablePartial);

            // Updating b should not update the result
            let result = await updateInput('b', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Updating a should update the result
            result = await updateInput('a', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 5, 'Variable:b': 5 },
                },
                ws_channel: 'uid',
            });
        });

        it('should only update DerivedVariable when a nested part of variable in deps is updated', async () => {
            const variableObject: SingleVariable<{ first: number; second: number }> = {
                __typename: 'Variable',
                default: {
                    first: 1,
                    second: 2,
                },
                nested: [],
                uid: 'd',
            };

            const variableObjectNestedFirst = { ...variableObject, nested: ['first'] };
            const variableObjectNestedSecond = { ...variableObject, nested: ['second'] };

            const variableDerived: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [variableObjectNestedFirst],
                nested: [],
                uid: 'derived',
                variables: [variableA, variableObject, variableObjectNestedFirst],
            };

            // Custom version of the MockComponent for the nested variable test
            const MockComponentNested = (props: {
                derivedVar: DerivedVariable;
                variableA: Variable<any>;
                variableNestedFirst: Variable<any>;
                variableNestedSecond: Variable<any>;
            }): JSX.Element => {
                const [a, setA] = useVariable(props.variableA);
                const [nestedFirst, setNestedFirst] = useVariable(props.variableNestedFirst);
                const [nestedSecond, setNestedSecond] = useVariable(props.variableNestedSecond);
                const [c] = useVariable(props.derivedVar);

                return (
                    <div>
                        <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                        <input
                            data-testid="b.first"
                            onChange={(e) => setNestedFirst(Number(e.target.value))}
                            value={nestedFirst.first}
                        />
                        <input
                            data-testid="b.second"
                            onChange={(e) => setNestedSecond(Number(e.target.value))}
                            value={nestedSecond.second}
                        />
                        <span data-testid="c">{JSON.stringify(c)}</span>
                    </div>
                );
            };

            const { getByTestId } = wrappedRender(
                <MockComponentNested
                    derivedVar={variableDerived}
                    variableA={variableA}
                    variableNestedFirst={variableObjectNestedFirst}
                    variableNestedSecond={variableObjectNestedSecond}
                />
            );
            await waitFor(() => expect(getByTestId('c')).toBeVisible());
            let result = JSON.parse(getByTestId('c').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:d' }, { __ref: 'Variable:d:first' }],
                    lookup: { 'Variable:a': 1, 'Variable:d': { first: 1, second: 2 }, 'Variable:d:first': 1 },
                },
                ws_channel: 'uid',
            });

            // Updating A should not update result
            result = await updateInput('a', 5, getByTestId);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:d' }, { __ref: 'Variable:d:first' }],
                    lookup: { 'Variable:a': 1, 'Variable:d': { first: 1, second: 2 }, 'Variable:d:first': 1 },
                },
                ws_channel: 'uid',
            });

            // Updating nested.second should not update result
            result = await updateInput('b.second', 5, getByTestId);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:d' }, { __ref: 'Variable:d:first' }],
                    lookup: { 'Variable:a': 1, 'Variable:d': { first: 1, second: 2 }, 'Variable:d:first': 1 },
                },
                ws_channel: 'uid',
            });

            // Updating nested.first should update result
            result = await updateInput('b.first', 5, getByTestId);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:d' }, { __ref: 'Variable:d:first' }],
                    lookup: { 'Variable:a': 5, 'Variable:d': { first: 5, second: 5 }, 'Variable:d:first': 5 },
                },
                ws_channel: 'uid',
            });
        });

        it('should update when a dependency of a nested DerivedVariable updates if present in deps', async () => {
            const intermediateVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [variableA],
                nested: [],
                uid: 'intermediate',
                variables: [variableA, variableB],
            };

            const finalResult: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [intermediateVariable],
                nested: [],
                uid: 'final',
                variables: [intermediateVariable, variableC],
            };

            // Custom mock component version to test nested derived variables
            const MockComponentNested = (props: {
                resultVariable: Variable<any>;
                variableA: Variable<any>;
                variableB: Variable<any>;
                variableC: Variable<any>;
            }): JSX.Element => {
                const [a, setA] = useVariable(props.variableA);
                const [b, setB] = useVariable(props.variableB);
                const [c, setC] = useVariable(props.variableC);
                const [result] = useVariable(props.resultVariable);

                return (
                    <div>
                        <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                        <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                        <input data-testid="c" onChange={(e) => setC(Number(e.target.value))} value={c} />
                        <span data-testid="result">{JSON.stringify(result)}</span>
                    </div>
                );
            };

            const { getByTestId } = wrappedRender(
                <MockComponentNested
                    resultVariable={finalResult}
                    variableA={variableA}
                    variableB={variableB}
                    variableC={variableC}
                />
            );

            await waitFor(() => expect(getByTestId('result')).toBeVisible());
            let result = JSON.parse(getByTestId('result').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate',
                            values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        },
                        { __ref: 'Variable:C' },
                    ],
                    lookup: { 'Variable:C': 3, 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Updating C should not update result
            result = await updateInput('c', 5, getByTestId, 'result');
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate',
                            values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        },
                        { __ref: 'Variable:C' },
                    ],
                    lookup: { 'Variable:C': 3, 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Updating B should not update result
            result = await updateInput('b', 5, getByTestId, 'result');
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate',
                            values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        },
                        { __ref: 'Variable:C' },
                    ],
                    lookup: { 'Variable:C': 3, 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Updating A should update result as it's a dependency of intermediateVariable which is in deps
            result = await updateInput('a', 5, getByTestId, 'result');
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate',
                            values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        },
                        { __ref: 'Variable:C' },
                    ],
                    lookup: { 'Variable:C': 5, 'Variable:a': 5, 'Variable:b': 5 },
                },
                ws_channel: 'uid',
            });
        });

        it('should recalculate DerivedVariable when trigger is used', async () => {
            const variableEmpty: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'empty',
                variables: [variableA, variableB],
            };

            const triggerAction: TriggerVariableImpl = {
                __typename: 'ActionImpl',
                force: true,
                name: 'TriggerVariable',
                variable: variableEmpty,
            };

            // Custom mock component version to test trigger
            const MockComponentTrigger = (props: {
                action: Action;
                derivedVar: DerivedVariable;
                variableA: Variable<any>;
                variableB: Variable<any>;
            }): JSX.Element => {
                const [a, setA] = useVariable(props.variableA);
                const [b, setB] = useVariable(props.variableB);
                const [c] = useVariable(props.derivedVar);
                const [callAction] = useAction(props.action);

                return (
                    <div>
                        <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                        <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                        <span data-testid="c">{JSON.stringify(c)}</span>
                        <button
                            data-testid="trigger"
                            onClick={(e) => {
                                callAction(e);
                            }}
                            type="button"
                        >
                            recalculate
                        </button>
                    </div>
                );
            };

            const { getByTestId } = wrappedRender(
                <MockComponentTrigger
                    action={triggerAction}
                    derivedVar={variableEmpty}
                    variableA={variableA}
                    variableB={variableB}
                />
            );
            await waitFor(() => expect(getByTestId('c')).toBeVisible());
            let result = JSON.parse(getByTestId('c').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Update both inputs; output should not change
            await updateInput('a', 6, getByTestId);
            await updateInput('b', 7, getByTestId);
            result = JSON.parse(getByTestId('c').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    lookup: { 'Variable:a': 1, 'Variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Fire the trigger button, output should update
            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });
            await waitFor(() =>
                expect(JSON.parse(getByTestId('c').innerHTML)).toEqual({
                    force: true,
                    is_data_variable: false,
                    values: {
                        data: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        lookup: { 'Variable:a': 6, 'Variable:b': 7 },
                    },
                    ws_channel: 'uid',
                })
            );
        });

        it('should update when nested derived variable is triggered', async () => {
            const variable: Variable<number> = {
                __typename: 'Variable',
                default: 5,
                nested: [],
                uid: 'base_variable',
            };

            const intermediateVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'intermediate_variable',
                variables: [variable],
            };

            const finalResult: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [intermediateVariable],
                nested: [],
                uid: 'final_variable',
                variables: [intermediateVariable],
            };

            const triggerAction: TriggerVariableImpl = {
                __typename: 'ActionImpl',
                force: true,
                name: 'TriggerVariable',
                variable: intermediateVariable,
            };

            // Custom mock component version
            const MockComponentTrigger = (props: {
                action: Action;
                derivedVar: DerivedVariable;
                variableA: Variable<any>;
            }): JSX.Element => {
                const [a, setA] = useVariable(props.variableA);
                const [callAction] = useAction(props.action);
                const [c] = useVariable(props.derivedVar);

                return (
                    <div>
                        <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                        <span data-testid="c">{JSON.stringify(c)}</span>
                        <button
                            data-testid="trigger"
                            onClick={(e) => {
                                callAction(e);
                            }}
                            type="button"
                        >
                            recalculate
                        </button>
                    </div>
                );
            };

            const { getByTestId } = wrappedRender(
                <MockComponentTrigger action={triggerAction} derivedVar={finalResult} variableA={variable} />
            );

            await waitFor(() => expect(getByTestId('c')).toBeVisible());
            let result = JSON.parse(getByTestId('c').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate_variable',
                            values: [{ __ref: 'Variable:base_variable' }],
                        },
                    ],
                    lookup: { 'Variable:base_variable': 5 },
                },
                ws_channel: 'uid',
            });

            // Update nested variable; final variable shouldn't change because intermediate_variable  has deps=[]
            await updateInput('a', 6, getByTestId);
            result = JSON.parse(getByTestId('c').innerHTML);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'intermediate_variable',
                            values: [{ __ref: 'Variable:base_variable' }],
                        },
                    ],
                    lookup: { 'Variable:base_variable': 5 },
                },
                ws_channel: 'uid',
            });

            // Fire the trigger button, output should update
            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });
            await waitFor(() =>
                expect(JSON.parse(getByTestId('c').innerHTML)).toEqual({
                    force: true,
                    is_data_variable: false,
                    values: {
                        data: [
                            {
                                force: false,
                                type: 'derived',
                                uid: 'intermediate_variable',
                                values: [{ __ref: 'Variable:base_variable' }],
                            },
                        ],
                        lookup: { 'Variable:base_variable': 6 },
                    },
                    ws_channel: 'uid',
                })
            );
        });

        it('should respect `nested` inside deps array', async () => {
            const variableNestedA: Variable<Record<string, number>> = {
                __typename: 'Variable',
                default: {
                    a: 1,
                    b: 2,
                },
                nested: ['a'],
                uid: 'nested-variable',
            };

            const variableNestedB = {
                ...variableNestedA,
                nested: ['b'],
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [variableNestedA],
                nested: [],
                uid: 'derived-variable',
                variables: [variableNestedA, variableNestedB],
            };

            const getter = await initComponent(variableNestedA, variableNestedB, derivedVariable);

            // Updating B should not update derived variable
            let result = await updateInput('b', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:nested-variable:a' }, { __ref: 'Variable:nested-variable:b' }],
                    lookup: { 'Variable:nested-variable:a': 1, 'Variable:nested-variable:b': 2 },
                },
                ws_channel: 'uid',
            });

            // Updating A should update derived variable
            result = await updateInput('a', 5, getter);
            expect(result).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [{ __ref: 'Variable:nested-variable:a' }, { __ref: 'Variable:nested-variable:b' }],
                    lookup: { 'Variable:nested-variable:a': 5, 'Variable:nested-variable:b': 5 },
                },
                ws_channel: 'uid',
            });
        });

        it('should respect RequestExtras at call site', async () => {
            const inputVariableDef: SingleVariable<string> = {
                __typename: 'Variable',
                default: 'test',
                nested: [],
                uid: 'input-variable',
            };
            function TestComponent({ dvKey }: { dvKey: string }): JSX.Element {
                const [, setInputVar] = useVariable(inputVariableDef);
                const [derivedVar] = useVariable({
                    __typename: 'DerivedVariable',
                    deps: [inputVariableDef],
                    nested: [],
                    uid: 'derived-variable',
                    variables: [inputVariableDef],
                });

                return (
                    <div>
                        <button onClick={() => setInputVar('test2')} type="button">
                            click
                        </button>
                        <span data-testid={dvKey}>{JSON.stringify(derivedVar)}</span>
                    </div>
                );
            }

            const receivedHeaders: Headers[] = [];

            server.use(
                rest.post('/api/core/derived-variable/:uid', async (req, res, ctx) => {
                    receivedHeaders.push(req.headers);
                    return res(
                        ctx.json({
                            cache_key: JSON.stringify(req.body.values),
                            value: req.body,
                        })
                    );
                })
            );

            const { getByTestId } = wrappedRender(
                <>
                    <RequestExtrasProvider
                        options={{
                            headers: {
                                'X-Dara-Test': 'test',
                            },
                        }}
                    >
                        <TestComponent dvKey="dv-1" />
                    </RequestExtrasProvider>
                    <RequestExtrasProvider
                        options={{
                            headers: {
                                'X-Dara-Test': 'test2',
                            },
                        }}
                    >
                        <TestComponent dvKey="dv-2" />
                    </RequestExtrasProvider>
                </>
            );

            await waitFor(() => {
                expect(getByTestId('dv-1')).toBeVisible();
                expect(getByTestId('dv-2')).toBeVisible();
            });

            await waitFor(() => expect(receivedHeaders.length).toBe(2));
            // check headers were received and different - order unknown
            expect(new Set(receivedHeaders.map((h) => h.get('X-Dara-Test')))).toEqual(new Set(['test', 'test2']));

            // Trigger the click so it recalculates
            act(() => {
                // find button next to dv-2
                fireEvent.click(getByTestId('dv-2').previousSibling as HTMLElement);
            });

            await waitFor(() => expect(receivedHeaders.length).toBe(4));

            // check headers were sent again
            expect(new Set(receivedHeaders.slice(2).map((h) => h.get('X-Dara-Test')))).toEqual(
                new Set(['test', 'test2'])
            );
        });
    });

    describe('DataVariable', () => {
        it('can be used in a DerivedVariable', async () => {
            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'DerivedVariable',
                        default: 'test',
                        deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
                        nested: [],
                        uid: 'uid',
                        variables: [
                            { __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>,
                            dataVariable,
                        ],
                    } as DerivedVariable),
                { wrapper: Wrapper }
            );

            await waitFor(() => {
                const expectedHash = `DataVariable:dep2:${hash(dataVariable.filters, { unorderedArrays: true })}`;
                expect(result.current[0]).toStrictEqual({
                    force: false,
                    is_data_variable: false,
                    values: {
                        data: [{ __ref: 'Variable:dep1' }, { __ref: expectedHash }],
                        lookup: {
                            'Variable:dep1': '1',
                            // ResolvedDataVariable structure
                            [expectedHash]: { filters: dataVariable.filters, type: 'data', uid: 'dep2' },
                        },
                    },
                    ws_channel: 'uid',
                });
            });
        });

        it('server trigger forces update of parent DerivedVariable', async () => {
            const wsClient = new MockWebSocketClient('wsuid');

            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
                nested: [],
                uid: 'uid',
                variables: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
            };

            function Component(): JSX.Element {
                const [data] = useVariable<string>(derivedVariable);

                return (
                    <div>
                        <span data-testid="data">{JSON.stringify(data)}</span>
                        <button
                            data-testid="trigger"
                            onClick={() =>
                                wsClient.receiveMessage({
                                    message: {
                                        data_id: 'dep2',
                                    },
                                    type: 'message',
                                })
                            }
                            type="button"
                        >
                            trigger
                        </button>
                    </div>
                );
            }

            const { getByTestId } = render(<Component />, {
                wrapper: (props) => <Wrapper client={wsClient} {...props} />,
            });

            await waitFor(() => expect(getByTestId('data')).toBeVisible());
            const result1 = JSON.parse(getByTestId('data').innerHTML);
            expect(result1).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        { __ref: 'Variable:dep1' },
                        { __ref: 'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18' },
                    ],
                    lookup: {
                        'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18': {
                            filters: {
                                clauses: [
                                    { column: 'col1', operator: 'EQ', value: 'val1' },
                                    { column: 'col2', operator: 'EQ', value: 'val2' },
                                ],
                                combinator: 'AND',
                            },
                            type: 'data',
                            uid: 'dep2',
                        },
                        'Variable:dep1': '1',
                    },
                },
                ws_channel: 'wsuid',
            });

            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });

            await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
            const result2 = JSON.parse(getByTestId('data').innerHTML);
            expect(result2).toEqual({
                ...result1,
                force: true,
            });
        });

        it('server trigger forces update of grandparent DerivedVariable', async () => {
            const wsClient = new MockWebSocketClient('wsuid');

            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',

                deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
                nested: [],
                uid: 'uid',
                variables: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
            };

            const grandparentDerivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [derivedVariable],
                nested: [],
                uid: 'uid2',
                variables: [derivedVariable],
            };

            function Component(): JSX.Element {
                const [data] = useVariable<string>(grandparentDerivedVariable);

                return (
                    <div>
                        <span data-testid="data">{JSON.stringify(data)}</span>
                        <button
                            data-testid="trigger"
                            onClick={() =>
                                wsClient.receiveMessage({
                                    message: {
                                        data_id: 'dep2',
                                    },
                                    type: 'message',
                                })
                            }
                            type="button"
                        >
                            trigger
                        </button>
                    </div>
                );
            }

            const { getByTestId } = render(<Component />, {
                wrapper: (props) => <Wrapper client={wsClient} {...props} />,
            });

            await waitFor(() => expect(getByTestId('data')).toBeVisible());
            const result1 = JSON.parse(getByTestId('data').innerHTML);
            expect(result1).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'uid',
                            values: [
                                { __ref: 'Variable:dep1' },
                                { __ref: 'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18' },
                            ],
                        },
                    ],
                    lookup: {
                        'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18': {
                            filters: {
                                clauses: [
                                    { column: 'col1', operator: 'EQ', value: 'val1' },
                                    { column: 'col2', operator: 'EQ', value: 'val2' },
                                ],
                                combinator: 'AND',
                            },
                            type: 'data',
                            uid: 'dep2',
                        },
                        'Variable:dep1': '1',
                    },
                },
                ws_channel: 'wsuid',
            });

            // grandparent should be updated just like parent
            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });

            await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
            const result2 = JSON.parse(getByTestId('data').innerHTML);
            expect(result2).toEqual({
                ...result1,
                force: true,
            });
        });

        it('server trigger should update parent DerivedVariable even when not in deps', async () => {
            const wsClient = new MockWebSocketClient('wsuid');

            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>],
                nested: [],
                uid: 'uid',
                variables: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
            };

            function Component(): JSX.Element {
                const [data] = useVariable<string>(derivedVariable);

                return (
                    <div>
                        <span data-testid="data">{JSON.stringify(data)}</span>
                        <button
                            data-testid="trigger"
                            onClick={() =>
                                wsClient.receiveMessage({
                                    message: {
                                        data_id: 'dep2',
                                    },
                                    type: 'message',
                                })
                            }
                            type="button"
                        >
                            trigger
                        </button>
                    </div>
                );
            }

            const { getByTestId } = render(<Component />, {
                wrapper: (props) => <Wrapper client={wsClient} {...props} />,
            });

            await waitFor(() => expect(getByTestId('data')).toBeVisible());
            const result1 = JSON.parse(getByTestId('data').innerHTML);
            expect(result1).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        { __ref: 'Variable:dep1' },
                        { __ref: 'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18' },
                    ],
                    lookup: {
                        'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18': {
                            filters: {
                                clauses: [
                                    { column: 'col1', operator: 'EQ', value: 'val1' },
                                    { column: 'col2', operator: 'EQ', value: 'val2' },
                                ],
                                combinator: 'AND',
                            },
                            type: 'data',
                            uid: 'dep2',
                        },
                        'Variable:dep1': '1',
                    },
                },
                ws_channel: 'wsuid',
            });

            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });

            await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
            const result2 = JSON.parse(getByTestId('data').innerHTML);
            expect(result2).toEqual({
                ...result1,
                force: true,
            });
        });

        it('server trigger should update grandparent DerivedVariable even when not in parent deps', async () => {
            const wsClient = new MockWebSocketClient('wsuid');

            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',

                deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>],
                nested: [],
                uid: 'uid',
                variables: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
            };

            const grandparentDerivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [derivedVariable],
                nested: [],
                uid: 'uid2',
                variables: [derivedVariable],
            };

            function Component(): JSX.Element {
                const [data] = useVariable<string>(grandparentDerivedVariable);

                return (
                    <div>
                        <span data-testid="data">{JSON.stringify(data)}</span>
                        <button
                            data-testid="trigger"
                            onClick={() =>
                                wsClient.receiveMessage({
                                    message: {
                                        data_id: 'dep2',
                                    },
                                    type: 'message',
                                })
                            }
                            type="button"
                        >
                            trigger
                        </button>
                    </div>
                );
            }

            const { getByTestId } = render(<Component />, {
                wrapper: (props) => <Wrapper client={wsClient} {...props} />,
            });

            await waitFor(() => expect(getByTestId('data')).toBeVisible());
            const result1 = JSON.parse(getByTestId('data').innerHTML);
            expect(result1).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'uid',
                            values: [
                                { __ref: 'Variable:dep1' },
                                { __ref: 'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18' },
                            ],
                        },
                    ],
                    lookup: {
                        'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18': {
                            filters: {
                                clauses: [
                                    { column: 'col1', operator: 'EQ', value: 'val1' },
                                    { column: 'col2', operator: 'EQ', value: 'val2' },
                                ],
                                combinator: 'AND',
                            },
                            type: 'data',
                            uid: 'dep2',
                        },
                        'Variable:dep1': '1',
                    },
                },
                ws_channel: 'wsuid',
            });

            // grandparent should be updated just like parent
            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });

            await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
            const result2 = JSON.parse(getByTestId('data').innerHTML);
            expect(result2).toEqual({
                ...result1,
                force: true,
            });
        });

        it('server trigger should update grandparent DerivedVariable even when parent not in grandparent deps', async () => {
            const wsClient = new MockWebSocketClient('wsuid');

            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const derivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',

                deps: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
                nested: [],
                uid: 'uid',
                variables: [{ __typename: 'Variable', default: '1', uid: 'dep1' } as Variable<string>, dataVariable],
            };

            const grandparentDerivedVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                deps: [],
                nested: [],
                uid: 'uid2',
                variables: [derivedVariable],
            };

            function Component(): JSX.Element {
                const [data] = useVariable<string>(grandparentDerivedVariable);

                return (
                    <div>
                        <span data-testid="data">{JSON.stringify(data)}</span>
                        <button
                            data-testid="trigger"
                            onClick={() =>
                                wsClient.receiveMessage({
                                    message: {
                                        data_id: 'dep2',
                                    },
                                    type: 'message',
                                })
                            }
                            type="button"
                        >
                            trigger
                        </button>
                    </div>
                );
            }

            const { getByTestId } = render(<Component />, {
                wrapper: (props) => <Wrapper client={wsClient} {...props} />,
            });

            await waitFor(() => expect(getByTestId('data')).toBeVisible());
            const result1 = JSON.parse(getByTestId('data').innerHTML);
            expect(result1).toEqual({
                force: false,
                is_data_variable: false,
                values: {
                    data: [
                        {
                            force: false,
                            type: 'derived',
                            uid: 'uid',
                            values: [
                                { __ref: 'Variable:dep1' },
                                { __ref: 'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18' },
                            ],
                        },
                    ],
                    lookup: {
                        'DataVariable:dep2:08ee1b0d5bda35d0b69848e31c471755ef6f5a18': {
                            filters: {
                                clauses: [
                                    { column: 'col1', operator: 'EQ', value: 'val1' },
                                    { column: 'col2', operator: 'EQ', value: 'val2' },
                                ],
                                combinator: 'AND',
                            },
                            type: 'data',
                            uid: 'dep2',
                        },
                        'Variable:dep1': '1',
                    },
                },
                ws_channel: 'wsuid',
            });

            // grandparent should be updated just like parent
            act(() => {
                fireEvent.click(getByTestId('trigger'));
            });

            await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
            const result2 = JSON.parse(getByTestId('data').innerHTML);
            expect(result2).toEqual({
                ...result1,
                force: true,
            });
        });
    });

    describe('UrlVariable', () => {
        it('should manage the state of a UrlVariable by using the history api', async () => {
            const history = createMemoryHistory();

            act(() => {
                history.push('/target');
            });

            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'UrlVariable',
                        default: 'test',
                        query: 'q',
                        uid: 'uid',
                    } as UrlVariable<string>),
                { wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper> }
            );
            await waitFor(() => {
                expect(result.current[0]).toBe('test');
            });

            // Test pushing to history updates the component
            act(() => {
                history.push('/target?q=test_push');
            });
            await waitFor(() => {
                expect(result.current[0]).toBe('test_push');
            });

            // Test updating via the hook updates the history
            act(() => {
                result.current[1]('test_update');
            });
            await waitFor(() => {
                expect(history.location.search).toBe('?q=test_update');
            });
        });

        it('should pick up the state of the url by first render of a UrlVariable', () => {
            const history = createMemoryHistory();

            act(() => {
                history.push('/target?q=initial');
            });
            const { result } = renderHook(
                () =>
                    useVariable<string>({
                        __typename: 'UrlVariable',
                        default: 'test',
                        query: 'q',
                        uid: 'uid',
                    } as UrlVariable<string>),
                { wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper> }
            );
            expect(result.current[0]).toBe('initial');
        });
    });
});
