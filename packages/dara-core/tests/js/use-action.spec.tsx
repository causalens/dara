import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { rest } from 'msw';

import { clearRegistries_TEST } from '@/shared/interactivity/store';

import { useAction, useVariable } from '../../js/shared';
import {
    Action,
    AnnotatedAction,
    DerivedDataVariable,
    DerivedVariable,
    NavigateToImpl,
    ResetVariablesImpl,
    SingleVariable,
    UpdateVariableImpl,
    UrlVariable,
    Variable,
} from '../../js/types/core';
import { MockWebSocketClient, Wrapper, server, wrappedRender } from './utils';

describe('useAction', () => {
    beforeEach(() => server.listen({ onUnhandledRequest: 'error' }));
    afterEach(() => {
        server.resetHandlers();
        clearRegistries_TEST();
    });
    afterAll(() => server.close());

    it('should accept an action as an argument and return a handler that will call the backend', async () => {
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
            expect(result.current[0]).toBeInstanceOf(Function);
            expect(result.current[1]).toEqual(false);
        });
    });

    it('should handle the NAVIGATE_TO action', async () => {
        const history = createMemoryHistory();

        const { result } = renderHook(
            () =>
                useAction({
                    __typename: 'ActionImpl',
                    name: 'NavigateTo',
                    new_tab: false,
                    uid: 'uid',
                    url: '/simple/url',
                } as NavigateToImpl),
            { wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper> }
        );
        await waitFor(() => {
            expect(result.current[0]).toBeInstanceOf(Function);
        });

        act(() => {
            result.current[0](null);
        });
        await waitFor(() => expect(history.location.pathname).toBe('/simple/url'));
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
            target: variable,
            value: 'updated',
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const [update] = useAction(props.action);

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

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(getByTestId('result').innerHTML).not.toBe('value'));

        expect(getByTestId('result').innerHTML).toBe('updated');
    });

    it('should handle UPDATE_VARIABLE for UrlVariable', async () => {
        const history = createMemoryHistory();
        const variable: UrlVariable<string> = {
            __typename: 'UrlVariable',
            default: 'value',
            query: 'q',
            uid: 'uid',
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            target: variable,
            value: 'updated',
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const [update] = useAction(props.action);

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
            wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper>,
        });

        await waitFor(() => expect(getByTestId('update')).toBeInTheDocument());

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => expect(history.location.search).toBe('?q=updated'));
    });

    it('should handle UPDATE_VARIABLE for multiple UrlVariables', async () => {
        const history = createMemoryHistory();

        const variable1: UrlVariable<string> = {
            __typename: 'UrlVariable',
            default: '1',
            query: 'x',
            uid: 'uid1',
        };

        const variable2: UrlVariable<string> = {
            __typename: 'UrlVariable',
            default: '1',
            query: 'y',
            uid: 'uid2',
        };

        const action1: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            target: variable1,
            value: '2',
        };
        const action2: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            target: variable2,
            value: '2',
        };

        const MockComponent = (props: { action: Action; var1: Variable<any>; var2: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var1);
            const [b] = useVariable(props.var2);
            const [update] = useAction(props.action);

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
            { wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper> }
        );

        await waitFor(() => expect(getByTestId('update')).toBeInTheDocument());

        act(() => {
            const button = getByTestId('update');
            fireEvent.click(button);
        });

        await waitFor(() => {
            expect(history.location.search.includes('x=2')).toBe(true);
            expect(history.location.search.includes('y=2')).toBe(true);
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

        const dataVariableResult: DerivedDataVariable = {
            __typename: 'DerivedDataVariable',
            deps: [variableB],
            filters: {
                column: 'col1',
                value: 'val1',
            },
            uid: 'result2',
            variables: [variableB],
        };

        const action: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            target: variable,
            value: 'updated',
        };
        const annotated: AnnotatedAction = {
            dynamic_kwargs: {
                var: variableResult,
                var2: dataVariableResult,
            },
            uid: 'uid',
        };

        const MockComponent = (props: { action: Action; var: Variable<any> }): JSX.Element => {
            const [a] = useVariable(props.var);
            const [update] = useAction(props.action);

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
        let serverReceivedMessage: object = null;

        server.use(
            rest.post('/api/core/action/:uid', async (req, res, ctx) => {
                serverReceivedMessage = req.body as object;
                return res(
                    ctx.json({
                        execution_id: 'execution_uid',
                    })
                );
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
            const executionId = serverReceivedMessage.execution_id;
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
                        filters: { column: 'col1', value: 'val1' },

                        type: 'derived-data',
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

    it('should handle RESET_VARIABLE for UrlVariable', async () => {
        const history = createMemoryHistory();

        const variable: UrlVariable<string> = {
            __typename: 'UrlVariable',
            default: 'default-value',
            query: 'q',
            uid: 'uid',
        };

        const resetAction: ResetVariablesImpl = {
            __typename: 'ActionImpl',
            name: 'ResetVariables',
            variables: [variable],
        };

        const updateAction: UpdateVariableImpl = {
            __typename: 'ActionImpl',
            name: 'UpdateVariable',
            target: variable,
            value: 'updated',
        };

        const MockComponent = (props: {
            resetAction: Action;
            updateAction: Action;
            var: Variable<any>;
        }): JSX.Element => {
            const [a] = useVariable(props.var);
            const [reset] = useAction(props.resetAction);
            const [update] = useAction(props.updateAction);

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
            { wrapper: ({ children }) => <Wrapper history={history}>{children}</Wrapper> }
        );

        await waitFor(() => expect(getByTestId('reset')).toBeInTheDocument());

        act(() => {
            const updateButton = getByTestId('update');
            fireEvent.click(updateButton);
        });

        await waitFor(() => expect(history.location.search).toBe('?q=updated'));

        act(() => {
            const resetButton = getByTestId('reset');
            fireEvent.click(resetButton);
        });

        await waitFor(() => expect(history.location.search).toBe('?q=default-value'));
    });
});
