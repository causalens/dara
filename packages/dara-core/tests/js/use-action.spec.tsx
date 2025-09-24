import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useState } from 'react';

import { INPUT, TOGGLE } from '@/actions/update-variable';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import { clearActionHandlerCache_TEST, preloadActions, useActionIsLoading } from '@/shared/interactivity/use-action';

import { EventCapturer, useAction, useVariable } from '../../js/shared';
import type {
    Action,
    ActionImpl,
    AnnotatedAction,
    DaraEventMap,
    DerivedVariable,
    NavigateToImpl,
    QueryParamStore,
    ResetVariablesImpl,
    ServerVariable,
    SingleVariable,
    UpdateVariableImpl,
    Variable,
} from '../../js/types/core';
import { MockWebSocketClient, Wrapper, server, wrappedRender } from './utils';
import { mockActions } from './utils/test-server-handlers';
import { importers } from './utils/wrapped-render';

const LOADING_VARIABLE: SingleVariable<boolean> = {
    __typename: 'Variable',
    default: false,
    nested: [],
    uid: 'loading_uid',
};

describe('useAction', () => {
    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'error' });
    });

    beforeEach(async () => {
        window.localStorage.clear();
        window.history.replaceState(null, '', '/');
        vi.restoreAllMocks();

        clearRegistries_TEST();
        clearActionHandlerCache_TEST();

        await preloadActions(importers, Object.values(mockActions));
    });
    afterEach(() => {
        window.history.replaceState(null, '', '/');
        server.resetHandlers();
        clearRegistries_TEST();
    });
    afterAll(() => server.close());

    it('should accept an action as an argument and return a handler', async () => {
        const wrapper = ({ children }: any): JSX.Element => <Wrapper>{children}</Wrapper>;
        const { result } = renderHook(
            () =>
                useAction({
                    __typename: 'ActionImpl',
                    name: 'NavigateTo',
                    new_tab: false,
                    uid: 'uid',
                    url: 'foo',
                } as NavigateToImpl),
            { wrapper }
        );

        await waitFor(() => {
            expect(result.current).toBeInstanceOf(Function);
        });
    });

    it('should handle the NAVIGATE_TO action', async () => {
        const { result } = renderHook(
            () =>
                useAction({
                    __typename: 'ActionImpl',
                    name: 'NavigateTo',
                    new_tab: false,
                    uid: 'uid',
                    url: '/simple/url',
                } as NavigateToImpl),
            { wrapper: Wrapper }
        );
        await waitFor(() => {
            expect(result.current).toBeInstanceOf(Function);
        });

        act(() => {
            result.current(null);
        });
        await waitFor(() => expect(window.location.pathname).toBe('/simple/url'));
    });

    it('should handle UPDATE_VARIABLE action', async () => {
        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const update = useAction(props.action);

            return (
                <>
                    <span data-testid="result">{a}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent action={action} var={variable} />);

        await waitFor(() => expect(getByTestId('result').innerHTML).toBe('value'));

        const button = getByTestId('update');
        fireEvent.click(button);

        await waitFor(() => expect(getByTestId('result').innerHTML).not.toBe('value'));

        expect(getByTestId('result').innerHTML).toBe('updated');
    });

    it('UPDATE_VARIABLE should fire event for updating a variable not registered with useVariable', async () => {
        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const urlVariable: SingleVariable<string, QueryParamStore> = {
            __typename: 'Variable',
            default: 'url_value',
            store: {
                __typename: 'QueryParamStore',
                query: 'q',
            },
            uid: 'url-uid',
            nested: [],
        };

        const action1: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };
        const action2: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable: urlVariable,
        };
        const receivedData: Array<[keyof DaraEventMap, DaraEventMap[keyof DaraEventMap]]> = [];

        const MockComponent = (props: { action: Action }): JSX.Element => {
            const update = useAction(props.action);

            return (
                <>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = render(<MockComponent action={[action1, action2]} />, {
            wrapper: ({ children }) => (
                <EventCapturer
                    onEvent={(e) => {
                        receivedData.push([e.type, e.data]);
                    }}
                >
                    <Wrapper>{children}</Wrapper>
                </EventCapturer>
            ),
        });

        fireEvent.click(getByTestId('update'));

        await waitFor(() => expect(receivedData).toHaveLength(2));
        expect(receivedData[0]).toEqual([
            'PLAIN_VARIABLE_LOADED',
            {
                variable,
                value: 'updated',
            },
        ]);
        expect(receivedData[1]).toEqual([
            'PLAIN_VARIABLE_LOADED',
            {
                variable: urlVariable,
                value: 'updated',
            },
        ]);
    });

    it('UPDATE_VARIABLE should fire event when toggling variable', async () => {
        const variable: SingleVariable<boolean> = {
            __typename: 'Variable',
            default: false,
            nested: [],
            uid: 'uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: TOGGLE,
            variable,
        };

        const receivedData: Array<[keyof DaraEventMap, DaraEventMap[keyof DaraEventMap]]> = [];

        const MockComponent = (props: { action: Action }): JSX.Element => {
            const update = useAction(props.action);

            return (
                <>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = render(<MockComponent action={action} />, {
            wrapper: ({ children }) => (
                <EventCapturer
                    onEvent={(e) => {
                        receivedData.push([e.type, e.data]);
                    }}
                >
                    <Wrapper>{children}</Wrapper>
                </EventCapturer>
            ),
        });

        fireEvent.click(getByTestId('update'));

        await waitFor(() => expect(receivedData).toHaveLength(1));
        expect(receivedData[0]).toEqual([
            'PLAIN_VARIABLE_LOADED',
            {
                variable,
                value: true,
            },
        ]);
        fireEvent.click(getByTestId('update'));

        await waitFor(() => expect(receivedData).toHaveLength(2));
        expect(receivedData[1]).toEqual([
            'PLAIN_VARIABLE_LOADED',
            {
                variable,
                value: false,
            },
        ]);
    });

    it('should UPDATE_VARIABLE even when variable is not yet registered with useVariable', async () => {
        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };

        // Now render a component with the variable and see that it has been updated
        const MockComponent2 = (props: { var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);

            return <span data-testid="result">{a}</span>;
        };

        const MockComponent = (props: { action: Action }): JSX.Element => {
            const update = useAction(props.action);
            const loading = useActionIsLoading(props.action);
            const [renderVariable, setRenderVariable] = useState(false);

            return (
                <>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                    <span data-testid="loading">{loading.toString()}</span>
                    {/* Do not render the nested component so not calling useVariable until true */}
                    <button data-testid="render" onClick={() => setRenderVariable(true)} type="button">
                        render
                    </button>
                    {renderVariable && <MockComponent2 var={variable} />}
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent action={action} />);

        await waitFor(() => expect(getByTestId('update')).toBeInTheDocument());

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getByTestId('loading').innerHTML).toBe('false'));

        act(() => {
            const button = getByTestId('render');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getByTestId('result').innerHTML).toBe('updated'));
    });

    it('should handle UPDATE_VARIABLE action with nested property', async () => {
        const variable: SingleVariable<any> = {
            __typename: 'Variable',
            default: {
                nested: {
                    inner_nested: {
                        key: 'value',
                    },
                    key: 'value',
                },
            },
            nested: [],
            uid: 'test-nested-111-uid',
        };

        const actionNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable: {
                ...variable,
                nested: ['nested', 'key'],
            },
        };

        const actionInnerNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable: {
                ...variable,
                nested: ['nested', 'inner_nested', 'key'],
            },
        };

        const MockComponent = (): JSX.Element => {
            const [a] = useVariable(variable);
            const updateNested = useAction(actionNested);
            const updateInnerNested = useAction(actionInnerNested);

            return (
                <>
                    <span data-testid="result">{JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="updateNested" onClick={() => updateNested('updated')} type="button">
                        update
                    </button>
                    <button data-testid="updateInnerNested" onClick={() => updateInnerNested('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent />);

        const getContent = (): Record<string, any> => JSON.parse(getByTestId('result').innerHTML);

        await waitFor(() => expect(getContent()).toEqual(variable.default));

        act(() => {
            const button = getByTestId('updateNested');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getContent()).not.toEqual(variable.default));

        expect(getContent()).toEqual({ nested: { inner_nested: { key: 'value' }, key: 'updated' } });

        act(() => {
            const button = getByTestId('updateInnerNested');
            fireEvent.click(button);
        });

        await waitFor(() =>
            expect(getContent()).not.toEqual({ nested: { inner_nested: { key: 'value' }, key: 'updated' } })
        );

        expect(getContent()).toEqual({ nested: { inner_nested: { key: 'updated' }, key: 'updated' } });
    });

    it('should handle UPDATE_VARIABLE TOGGLE action', async () => {
        const variable: SingleVariable<any> = {
            __typename: 'Variable',
            default: false,
            nested: [],
            uid: 'uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: TOGGLE,
            variable,
        };

        const MockComponent = (): JSX.Element => {
            const [a] = useVariable(variable);
            const update = useAction(action);

            return (
                <>
                    <span data-testid="result">{JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent />);

        const getContent = (): Record<string, any> => JSON.parse(getByTestId('result').innerHTML);

        await waitFor(() => expect(getContent()).toEqual(variable.default));

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getContent()).not.toEqual(variable.default));

        expect(getContent()).toEqual(true);
    });

    it('should handle UPDATE_VARIABLE TOGGLE action with nested property', async () => {
        const variable: SingleVariable<any> = {
            __typename: 'Variable',
            default: {
                nested: {
                    inner_nested: {
                        key: false,
                    },
                    key: false,
                },
            },
            nested: [],
            uid: 'update-var-toggle-nested-uid',
        };

        const actionNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: TOGGLE,
            variable: {
                ...variable,
                nested: ['nested', 'key'],
            },
        };

        const actionInnerNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: TOGGLE,
            variable: {
                ...variable,
                nested: ['nested', 'inner_nested', 'key'],
            },
        };

        const MockComponent = (): JSX.Element => {
            const [a] = useVariable(variable);
            const updateNested = useAction(actionNested);
            const updateInnerNested = useAction(actionInnerNested);

            return (
                <>
                    <span data-testid="result">{JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="updateNested" onClick={() => updateNested('updated')} type="button">
                        update
                    </button>
                    <button data-testid="updateInnerNested" onClick={() => updateInnerNested('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent />);

        const getContent = (): Record<string, any> => JSON.parse(getByTestId('result').innerHTML);

        await waitFor(() => expect(getContent()).toEqual(variable.default));

        act(() => {
            const button = getByTestId('updateNested');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getContent()).not.toEqual(variable.default));

        expect(getContent()).toEqual({ nested: { inner_nested: { key: false }, key: true } });

        act(() => {
            const button = getByTestId('updateInnerNested');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getContent()).not.toEqual({ nested: { inner_nested: { key: false }, key: true } }));

        expect(getContent()).toEqual({ nested: { inner_nested: { key: true }, key: true } });
    });

    it('should handle UPDATE_VARIABLE SYNC action', async () => {
        const variable: SingleVariable<any> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'sync-uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: INPUT,
            variable,
        };

        const MockComponent = (): JSX.Element => {
            const [a] = useVariable(variable);
            const update = useAction(action);

            return (
                <>
                    <span data-testid="result">{JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent />);

        const getContent = (): Record<string, any> => JSON.parse(getByTestId('result').innerHTML);

        await waitFor(() => expect(getContent()).toEqual(variable.default));

        const button = getByTestId('update');
        fireEvent.click(button);

        await waitFor(() => expect(getContent()).not.toEqual(variable.default));

        expect(getContent()).toEqual('updated');
    });

    it('should handle UPDATE_VARIABLE SYNC action with nested property', async () => {
        const variable: SingleVariable<any> = {
            __typename: 'Variable',
            default: {
                nested: {
                    inner_nested: {
                        key: 'value',
                    },
                    key: 'value',
                },
            },
            nested: [],
            uid: 'uid',
        };

        const actionNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: INPUT,
            variable: {
                ...variable,
                nested: ['nested', 'key'],
            },
        };

        const actionInnerNested: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: INPUT,
            variable: {
                ...variable,
                nested: ['nested', 'inner_nested', 'key'],
            },
        };

        const MockComponent = (): JSX.Element => {
            const [a] = useVariable(variable);
            const updateNested = useAction(actionNested);
            const updateInnerNested = useAction(actionInnerNested);

            return (
                <>
                    <span data-testid="result">{JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="updateNested" onClick={() => updateNested('updated')} type="button">
                        update
                    </button>
                    <button data-testid="updateInnerNested" onClick={() => updateInnerNested('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent />);

        const getContent = (): Record<string, any> => JSON.parse(getByTestId('result').innerHTML);

        await waitFor(() => expect(getContent()).toEqual(variable.default));

        act(() => {
            const button = getByTestId('updateNested');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getContent()).not.toEqual(variable.default));

        expect(getContent()).toEqual({ nested: { inner_nested: { key: 'value' }, key: 'updated' } });

        act(() => {
            const button = getByTestId('updateInnerNested');
            fireEvent.click(button);
        });

        await waitFor(() =>
            expect(getContent()).not.toEqual({ nested: { inner_nested: { key: 'value' }, key: 'updated' } })
        );

        expect(getContent()).toEqual({ nested: { inner_nested: { key: 'updated' }, key: 'updated' } });
    });

    it('should handle UPDATE_VARIABLE for Variable with QueryParamStore', async () => {
        const variable: SingleVariable<string, QueryParamStore> = {
            __typename: 'Variable',
            default: 'value',
            store: {
                __typename: 'QueryParamStore',
                query: 'q',
            },
            uid: 'uid',
            nested: [],
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const update = useAction(props.action);

            return (
                <>
                    <span data-testid="result">{a}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = render(<MockComponent action={action} var={variable} />, {
            wrapper: Wrapper,
        });

        await waitFor(() => expect(getByTestId('update')).toBeInTheDocument());

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(window.location.search).toBe('?q=updated'));
    });

    it('should handle UPDATE_VARIABLE for multiple Variables with QueryParamStore', async () => {
        const variable1: SingleVariable<string, QueryParamStore> = {
            __typename: 'Variable',
            default: '1',
            store: {
                __typename: 'QueryParamStore',
                query: 'x',
            },
            uid: 'uid1',
            nested: [],
        };

        const variable2: SingleVariable<string, QueryParamStore> = {
            __typename: 'Variable',
            default: '1',
            store: {
                __typename: 'QueryParamStore',
                query: 'y',
            },
            uid: 'uid2',
            nested: [],
        };

        const action1: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: '2',
            variable: variable1,
        };
        const action2: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: '2',
            variable: variable2,
        };

        const MockComponent = (props: { action: Action; var1: Variable<any>; var2: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var1);
            const [b] = useVariable(props.var2);
            const update = useAction(props.action);

            return (
                <>
                    <span data-testid="result1">{a}</span>
                    <span data-testid="result2">{b}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('2')} type="button">
                        update
                    </button>
                </>
            );
        };

        const { getByTestId } = render(
            <MockComponent action={[action1, action2]} var1={variable1} var2={variable2} />,
            { wrapper: Wrapper }
        );

        await waitFor(() => expect(getByTestId('update')).toBeInTheDocument());

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => {
            expect(window.location.search.includes('x=2')).toBe(true);
            expect(window.location.search.includes('y=2')).toBe(true);
        });
    });

    it('should handle AnnotatedAction with UPDATE_VARIABLE action', async () => {
        const wsClient = new MockWebSocketClient('uid');

        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const variableB: SingleVariable<number> = {
            __typename: 'Variable',
            default: 2,
            nested: [],
            uid: 'b',
        };

        const variableResult: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableB],
            nested: [],
            uid: 'result',
            variables: [variableB],
        };

        const dataVariableResult: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableB],
            uid: 'result2',
            variables: [variableB],
            cache: {
                policy: 'global',
                cache_type: 'session',
            },
            nested: [],
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };
        const annotated: AnnotatedAction = {
            dynamic_kwargs: {
                var: variableResult,
                var2: dataVariableResult,
            },
            loading: LOADING_VARIABLE,
            uid: 'uid',
            definition_uid: 'definition',
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const update = useAction(props.action);

            return (
                <>
                    <span data-testid="result">{typeof a === 'string' ? a : JSON.stringify(a)}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('input')} type="button">
                        update
                    </button>
                </>
            );
        };

        // store received message
        let serverReceivedMessage: Record<string, any> | null = null;

        server.use(
            http.post('/api/core/action/:uid', async (info) => {
                serverReceivedMessage = await info.request.json();
                return HttpResponse.json({
                    execution_id: 'execution_uid',
                });
            })
        );

        const { getByTestId } = render(
            <Wrapper client={wsClient}>
                <MockComponent action={annotated} var={variable} />
            </Wrapper>
        );

        await waitFor(() => expect(getByTestId('result').innerHTML).toBe('value'));

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(serverReceivedMessage).not.toBeNull());

        act(() => {
            // get execution id from the received message
            const executionId = serverReceivedMessage!.execution_id;
            wsClient.receiveMessage({
                message: {
                    action,
                    uid: executionId,
                },
                type: 'message',
            });
            wsClient.receiveMessage({
                message: {
                    action: null,
                    uid: executionId,
                },
                type: 'message',
            });
        });

        await waitFor(() => expect(getByTestId('result').innerHTML).not.toBe('value'));
        expect(getByTestId('result').innerHTML).toBe('updated');

        expect(serverReceivedMessage).toMatchObject({
            execution_id: expect.any(String),
            input: 'input',
            values: {
                data: {
                    var: { type: 'derived', uid: 'result', values: [{ __ref: 'Variable:b' }] },
                    var2: {
                        type: 'derived',
                        uid: 'result2',
                        values: [{ __ref: 'Variable:b' }],
                    },
                },
                lookup: {
                    'Variable:b': 2,
                },
            },
            ws_channel: 'uid',
        });
    });

    it('should handle RESET_VARIABLE for Variable with QueryParamStore', async () => {
        window.history.pushState(null, '', '/');
        const variable: SingleVariable<string, QueryParamStore> = {
            __typename: 'Variable',
            default: 'default-value',
            store: {
                __typename: 'QueryParamStore',
                query: 'q',
            },
            uid: 'uid',
            nested: [],
        };

        const resetAction: ResetVariablesImpl = {
            __typename: 'ActionImpl',
            name: 'ResetVariables',
            variables: [variable],
        };

        const updateAction: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            value: 'updated',
            variable,
        };

        const MockComponent = (props: {
            resetAction: Action;
            updateAction: Action;
            var: Variable<any>;
        }): JSX.Element => {
            const [a] = useVariable(props.var);
            const reset = useAction(props.resetAction);
            const update = useAction(props.updateAction);

            return (
                <>
                    <span data-testid="result">{a}</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="update" onClick={() => update('updated')} type="button">
                        update
                    </button>
                    {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
                    <button data-testid="reset" onClick={() => reset('reset')} type="button">
                        reset value
                    </button>
                </>
            );
        };
        const { getByTestId } = render(
            <MockComponent resetAction={resetAction} updateAction={updateAction} var={variable} />,
            { wrapper: Wrapper }
        );

        await waitFor(() => expect(getByTestId('reset')).toBeInTheDocument());

        act(() => {
            const updateButton = getByTestId('update');
            fireEvent.click(updateButton);
        });

        await waitFor(() => expect(window.location.search).toBe('?q=updated'));

        act(() => {
            const resetButton = getByTestId('reset');
            fireEvent.click(resetButton);
        });

        await waitFor(() => expect(window.location.search).toBe('?q=default-value'));
    });

    it('should handle arbitrary ActionImpl', async () => {
        interface CustomActionImpl extends ActionImpl {
            extra: number;
        }

        interface CustomActionImpl2 extends ActionImpl {
            other: string;
        }

        const customAction: CustomActionImpl = {
            __typename: 'ActionImpl',
            extra: 10,
            name: 'CustomAction',
        };

        const customAction2: CustomActionImpl2 = {
            __typename: 'ActionImpl',
            name: 'CustomAction2',
            other: 'other',
        };

        const onUnhandledAction = vi.fn();

        // Use render hook and pass in a custom action handler
        const { result } = renderHook(
            () =>
                useAction([customAction, customAction2], {
                    onUnhandledAction,
                }),
            { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> }
        );

        await waitFor(() => {
            expect(result.current).toBeInstanceOf(Function);
        });

        // Call the action handler
        await act(async () => {
            await result.current('input');
        });

        // There should be two calls to onUnhandledAction
        expect(onUnhandledAction).toHaveBeenCalledTimes(2);

        // Check that the onUnhandledAction handler was called with the context and the action1
        expect(onUnhandledAction).toHaveBeenCalledWith(
            expect.objectContaining({
                input: 'input',
            }),
            customAction
        );

        // Check it was also called with action2
        expect(onUnhandledAction).toHaveBeenCalledWith(
            expect.objectContaining({
                input: 'input',
            }),
            customAction2
        );
    });

    it('should handle AnnotatedAction returning multiple custom actions', async () => {
        interface CustomActionImpl extends ActionImpl {
            extra: number;
        }

        interface CustomActionImpl2 extends ActionImpl {
            other: string;
        }

        const customAction: CustomActionImpl = {
            __typename: 'ActionImpl',
            extra: 10,
            name: 'CustomAction',
        };

        const customAction2: CustomActionImpl2 = {
            __typename: 'ActionImpl',
            name: 'CustomAction2',
            other: 'other',
        };

        const variable: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'value',
            nested: [],
            uid: 'uid',
        };

        const annotated: AnnotatedAction = {
            definition_uid: 'definition',
            dynamic_kwargs: {
                foo: variable,
            },
            loading: LOADING_VARIABLE,
            uid: 'uid',
        };

        const onUnhandledAction = vi.fn();

        const wsClient = new MockWebSocketClient('uid');

        const { result } = renderHook(
            (): [(input?: any) => Promise<void>, boolean] => {
                const action = useAction(annotated, {
                    onUnhandledAction,
                });
                const isLoading = useActionIsLoading(annotated);
                return [action, isLoading];
            },
            { wrapper: ({ children }) => <Wrapper client={wsClient}>{children}</Wrapper> }
        );

        // store received message
        let serverReceivedMessage: Record<string, any> | null = null;

        server.use(
            http.post('/api/core/action/:uid', async (info) => {
                serverReceivedMessage = (await info.request.json()) as any as Record<string, any>;
                return HttpResponse.json({
                    execution_id: 'execution_uid',
                });
            })
        );

        // Execute action
        act(() => {
            result.current[0]('input');
        });

        expect(result.current[1]).toEqual(true);

        // Wait for server to receive message
        await waitFor(() => expect(serverReceivedMessage).not.toBeNull());

        // Send custom impls via wsClient
        act(() => {
            // get execution id from the received message
            const executionId = serverReceivedMessage!.execution_id;
            wsClient.receiveMessage({
                message: {
                    action: customAction,
                    uid: executionId,
                },
                type: 'message',
            });
            wsClient.receiveMessage({
                message: {
                    action: customAction2,
                    uid: executionId,
                },
                type: 'message',
            });

            // send null to indicate end
            wsClient.receiveMessage({
                message: {
                    action: null,
                    uid: executionId,
                },
                type: 'message',
            });
        });

        await waitFor(() => expect(result.current[1]).toEqual(false));

        // There should be two calls to onUnhandledAction
        await waitFor(() => expect(onUnhandledAction).toHaveBeenCalledTimes(2));

        // Check that the onUnhandledAction handler was called with the context and the action1
        expect(onUnhandledAction).toHaveBeenCalledWith(
            expect.objectContaining({
                input: 'input',
            }),
            customAction
        );

        // Check it was also called with action2
        expect(onUnhandledAction).toHaveBeenCalledWith(
            expect.objectContaining({
                input: 'input',
            }),
            customAction2
        );
    });

    it('should resolve ServerVariable unused otherwise (regression)', async () => {
        interface CustomActionImpl extends ActionImpl {
            extra: number;
        }

        const customAction: CustomActionImpl = {
            __typename: 'ActionImpl',
            extra: 10,
            name: 'CustomAction',
        };

        const variable: ServerVariable = {
            __typename: 'ServerVariable',
            uid: 'server-uid',
            scope: 'global',
        };

        const seqCalled = vi.fn();

        server.use(
            http.get('/api/core/server-variable/server-uid/sequence', () => {
                seqCalled();
                return HttpResponse.json({ sequence_number: 1 });
            })
        );

        const annotated: AnnotatedAction = {
            definition_uid: 'definition',
            dynamic_kwargs: {
                foo: variable,
            },
            loading: LOADING_VARIABLE,
            uid: 'uid',
        };

        const onUnhandledAction = vi.fn();

        const wsClient = new MockWebSocketClient('uid');

        const { result } = renderHook(
            (): [(input?: any) => Promise<void>, boolean] => {
                const action = useAction(annotated, {
                    onUnhandledAction,
                });
                const isLoading = useActionIsLoading(annotated);
                return [action, isLoading];
            },
            { wrapper: ({ children }) => <Wrapper client={wsClient}>{children}</Wrapper> }
        );

        // store received message
        let serverReceivedMessage: Record<string, any> | null = null;

        server.use(
            http.post('/api/core/action/:uid', async (info) => {
                serverReceivedMessage = (await info.request.json()) as any as Record<string, any>;
                return HttpResponse.json({
                    execution_id: 'execution_uid',
                });
            })
        );

        // Execute action
        act(() => {
            result.current[0]('input');
        });

        expect(result.current[1]).toEqual(true);

        // should hit the server to resolve the sequence number
        await waitFor(() => expect(seqCalled).toHaveBeenCalled());

        // Wait for server to receive message
        await waitFor(() => expect(serverReceivedMessage).not.toBeNull());

        // Send custom impls via wsClient
        act(() => {
            // get execution id from the received message
            const executionId = serverReceivedMessage!.execution_id;
            wsClient.receiveMessage({
                message: {
                    action: customAction,
                    uid: executionId,
                },
                type: 'message',
            });
            // send null to indicate end
            wsClient.receiveMessage({
                message: {
                    action: null,
                    uid: executionId,
                },
                type: 'message',
            });
        });

        await waitFor(() => expect(result.current[1]).toEqual(false));

        // There should be one call to onUnhandledAction
        await waitFor(() => expect(onUnhandledAction).toHaveBeenCalledTimes(1));

        // Check that the onUnhandledAction handler was called with the context and the action1
        expect(onUnhandledAction).toHaveBeenCalledWith(
            expect.objectContaining({
                input: 'input',
            }),
            customAction
        );
    });
});
