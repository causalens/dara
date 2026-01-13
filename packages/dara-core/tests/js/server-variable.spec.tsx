import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';

import type { ServerVariableMessage } from '@/api/websocket';
import { setSessionToken } from '@/auth/use-session-token';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import type { DerivedVariable, ResolvedServerVariable, ServerVariable, Variable } from '@/types/core';

import { useVariable } from '../../js/shared';
import { MockWebSocketClient, Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

const SESSION_TOKEN = 'TEST_TOKEN';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
vi.mock('lodash/debounce', () => vi.fn((fn) => fn));

mockLocalStorage();

describe('ServerVariable', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();

        setSessionToken(SESSION_TOKEN);

        // This is necessary to avoid data bleeding between tests
        // Though this causes warnings about duplicate atoms in the test console
        clearRegistries_TEST();
    });
    afterEach(() => {
        setSessionToken(null);
        vi.clearAllTimers();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    it('can be used in a DerivedVariable', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
            const expectedHash = 'ServerVariable:dep2';
            expect(result.current[0]).toStrictEqual({
                force_key: null,
                values: {
                    data: [{ __ref: 'Variable:dep1' }, { __ref: expectedHash }],
                    lookup: {
                        'Variable:dep1': '1',
                        [expectedHash]: {
                            type: 'server',
                            uid: 'dep2',
                            sequence_number: 1,
                        } satisfies ResolvedServerVariable,
                    },
                },
                ws_channel: 'uid',
            });
        });
    });

    it('server variable sequence number changing updates parent DerivedVariable without forcing', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );

        const wsClient = new MockWebSocketClient('wsuid');

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
                                    __type: 'ServerVariable',
                                    uid: 'dep2',
                                    sequence_number: 2,
                                },
                                type: 'message',
                            } satisfies ServerVariableMessage)
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
            force_key: null,
            values: {
                data: [{ __ref: 'Variable:dep1' }, { __ref: 'ServerVariable:dep2' }],
                lookup: {
                    'ServerVariable:dep2': {
                        type: 'server',
                        uid: 'dep2',
                        sequence_number: 1,
                    },
                    'Variable:dep1': '1',
                },
            },
            ws_channel: 'wsuid',
        });

        fireEvent.click(getByTestId('trigger'));

        await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
        const result2 = JSON.parse(getByTestId('data').innerHTML);
        expect(result2).toEqual({
            ...result1,
            values: {
                ...result1.values,
                lookup: {
                    ...result1.values.lookup,
                    'ServerVariable:dep2': {
                        ...result1.values.lookup['ServerVariable:dep2'],
                        // recalculated with different sequence number
                        sequence_number: 2,
                    },
                },
            },
        });
    });

    it('server variable sequence number changing updates grandparent DerivedVariable without forcing', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );

        const wsClient = new MockWebSocketClient('wsuid');

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
                                    __type: 'ServerVariable',
                                    uid: 'dep2',
                                    sequence_number: 2,
                                },
                                type: 'message',
                            } satisfies ServerVariableMessage)
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
            force_key: null,
            values: {
                data: [
                    {
                        force_key: null,
                        nested: [],
                        type: 'derived',
                        uid: 'uid',
                        values: [{ __ref: 'Variable:dep1' }, { __ref: 'ServerVariable:dep2' }],
                    },
                ],
                lookup: {
                    'ServerVariable:dep2': {
                        type: 'server',
                        uid: 'dep2',
                        sequence_number: 1,
                    } satisfies ResolvedServerVariable,
                    'Variable:dep1': '1',
                },
            },
            ws_channel: 'wsuid',
        });

        // grandparent should be updated just like parent
        fireEvent.click(getByTestId('trigger'));

        await waitFor(() => expect(JSON.parse(getByTestId('data').innerHTML)).not.toEqual(result1));
        const result2 = JSON.parse(getByTestId('data').innerHTML);

        // no force keys are set, simply sequence number has changed
        expect(result2).toEqual({
            ...result1,
            values: {
                ...result1.values,
                lookup: {
                    ...result1.values.lookup,
                    'ServerVariable:dep2': {
                        ...result1.values.lookup['ServerVariable:dep2'],
                        // recalculated with different sequence number
                        sequence_number: 2,
                    },
                },
            },
        });
    });

    it('server variable sequence number changing should not update parent DerivedVariable when not in deps', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );
        const wsClient = new MockWebSocketClient('wsuid');

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
                                    uid: 'dep2',
                                    sequence_number: 2,
                                    __type: 'ServerVariable',
                                },
                                type: 'message',
                            } satisfies ServerVariableMessage)
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
            force_key: null,
            values: {
                data: [{ __ref: 'Variable:dep1' }, { __ref: 'ServerVariable:dep2' }],
                lookup: {
                    'ServerVariable:dep2': {
                        type: 'server',
                        uid: 'dep2',
                        sequence_number: 1,
                    } satisfies ResolvedServerVariable,
                    'Variable:dep1': '1',
                },
            },
            ws_channel: 'wsuid',
        });

        fireEvent.click(getByTestId('trigger'));

        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
        expect(JSON.parse(getByTestId('data').innerHTML)).toEqual(result1);
    });

    it('server variable sequence number updating should not update grandparent DerivedVariable when not in parent deps', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );
        const wsClient = new MockWebSocketClient('wsuid');

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
                                    uid: 'dep2',
                                    sequence_number: 1,
                                    __type: 'ServerVariable',
                                },
                                type: 'message',
                            } satisfies ServerVariableMessage)
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
            force_key: null,
            values: {
                data: [
                    {
                        force_key: null,
                        nested: [],
                        type: 'derived',
                        uid: 'uid',
                        values: [{ __ref: 'Variable:dep1' }, { __ref: 'ServerVariable:dep2' }],
                    },
                ],
                lookup: {
                    'ServerVariable:dep2': {
                        type: 'server',
                        uid: 'dep2',
                        sequence_number: 1,
                    } satisfies ResolvedServerVariable,
                    'Variable:dep1': '1',
                },
            },
            ws_channel: 'wsuid',
        });

        // grandparent not be updated just like parent
        fireEvent.click(getByTestId('trigger'));

        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

        expect(JSON.parse(getByTestId('data').innerHTML)).toEqual(result1);
    });

    it('server trigger should update grandparent DerivedVariable even when parent not in grandparent deps', async () => {
        // required for the server variable to resolve
        server.use(
            http.get('/api/core/server-variable/dep2/sequence', () => {
                return HttpResponse.json({ sequence_number: 1 });
            })
        );
        const wsClient = new MockWebSocketClient('wsuid');

        const dataVariable: ServerVariable = {
            __typename: 'ServerVariable',
            scope: 'global',
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
                                    uid: 'dep2',
                                    sequence_number: 1,
                                    __type: 'ServerVariable',
                                },
                                type: 'message',
                            } satisfies ServerVariableMessage)
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
            force_key: null,
            values: {
                data: [
                    {
                        type: 'derived',
                        uid: 'uid',
                        values: [{ __ref: 'Variable:dep1' }, { __ref: 'ServerVariable:dep2' }],
                        force_key: null,
                        nested: [],
                    },
                ],
                lookup: {
                    'ServerVariable:dep2': {
                        type: 'server',
                        sequence_number: 1,
                        uid: 'dep2',
                    } satisfies ResolvedServerVariable,
                    'Variable:dep1': '1',
                },
            },
            ws_channel: 'wsuid',
        });

        // grandparent not be updated
        fireEvent.click(getByTestId('trigger'));

        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

        expect(JSON.parse(getByTestId('data').innerHTML)).toEqual(result1);
    });
});
