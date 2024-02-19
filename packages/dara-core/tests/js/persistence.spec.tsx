import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { rest } from 'msw';

import { BackendStoreMessage } from '@/api/websocket';
import { RequestExtrasProvider } from '@/shared';
import { getSessionKey } from '@/shared/interactivity/persistence';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import { useVariable } from '@/shared/interactivity/use-variable';
import { BackendStore, SingleVariable } from '@/types/core';

import { MockWebSocketClient, Wrapper, server } from './utils';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
jest.mock('lodash/debounce', () => jest.fn((fn) => fn));

const SESSION_TOKEN = 'TEST_TOKEN';

describe('Variable Persistence', () => {
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

    test('variable with persist_value updates when storage event is triggered', async () => {
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

        // @ts-expect-error hacky fix as our more sophisticated localStorage proxy mock does not work with storageevent
        // eslint-disable-next-line no-multi-assign
        window.localStorage = window.sessionStorage = {
            getItem(key) {
                return this[key];
            },
            setItem(key, value) {
                this[key] = value;
            },
        };

        act(() => {
            fireEvent(
                window,
                new StorageEvent('storage', {
                    key: getSessionKey(SESSION_TOKEN, 'session-test-1'),
                    newValue: JSON.stringify(newValue),
                    storageArea: localStorage,
                })
            );
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual(newValue);
        });
    });

    test('variable with BackendStore reads initial value from remote', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        foo: 'bar',
                    })
                );
            })
        );

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid',
                    },
                    uid: 'session-test-1',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: Wrapper,
            }
        );

        await waitFor(() => {
            expect(result.current[0]).toEqual({ foo: 'bar' });
        });
    });

    test('variable with BackendStore sends request to update remote', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        foo: 'bar',
                    })
                );
            })
        );

        const onSave = jest.fn();

        // Mock endpoint to save store value
        server.use(
            rest.post('/api/core/store', (req, res, ctx) => {
                onSave(req.body);
                return res(ctx.json({}));
            })
        );

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid',
                    },
                    uid: 'session-test-1',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: Wrapper,
            }
        );

        await waitFor(() => {
            expect(result.current).not.toBeNull();
        });

        act(() => {
            result.current[1]({ foo: 'baz' });
        });

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith({ 'store-uid': { foo: 'baz' } });
        });

        // Check that the value is updated
        expect(result.current[0]).toEqual({ foo: 'baz' });
    });

    test('variable with BackendStore sends separate request for different extras context', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        foo: 'bar',
                    })
                );
            })
        );

        const onSave = jest.fn();

        // Mock endpoint to save store value
        server.use(
            rest.post('/api/core/store', (req, res, ctx) => {
                onSave(Object.fromEntries(req.headers.entries())['x-dara-extras'], req.body);
                return res(ctx.json({}));
            })
        );

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid',
                    },
                    uid: 'session-test-1',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: ({ children }) => (
                    <Wrapper>
                        <RequestExtrasProvider
                            options={{
                                headers: {
                                    'X-Dara-Extras': 'foo',
                                },
                            }}
                        >
                            {children}
                        </RequestExtrasProvider>
                    </Wrapper>
                ),
            }
        );

        const { result: result2 } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid-2',
                    },
                    uid: 'session-test-2',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: ({ children }) => (
                    <Wrapper>
                        <RequestExtrasProvider
                            options={{
                                headers: {
                                    'X-Dara-Extras': 'bar',
                                },
                            }}
                        >
                            {children}
                        </RequestExtrasProvider>
                    </Wrapper>
                ),
            }
        );

        await waitFor(() => {
            expect(result.current).not.toBeNull();
            expect(result2.current).not.toBeNull();
        });

        act(() => {
            result.current[1]({ foo: 'new1' });
            result2.current[1]({ foo: 'new2' });
        });

        await waitFor(() => {
            // check each request has the correct extras depending on the context
            expect(onSave).toHaveBeenCalledWith('foo', { 'store-uid': { foo: 'new1' } });
            expect(onSave).toHaveBeenCalledWith('bar', { 'store-uid-2': { foo: 'new2' } });
        });

        // Check that the value is updated
        expect(result.current[0]).toEqual({ foo: 'new1' });
        expect(result2.current[0]).toEqual({ foo: 'new2' });
    });

    test('variable with BackendStore updates on received WS message', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        foo: 'bar',
                    })
                );
            })
        );

        const wsClient = new MockWebSocketClient('CHANNEL');

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid',
                    },
                    uid: 'session-test-1',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: ({ children }) => <Wrapper client={wsClient}>{children}</Wrapper>,
            }
        );

        await waitFor(() => {
            expect(result.current[0]).toEqual({ foo: 'bar' });
        });

        // First receive a message for other store uid
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'other_uid',
                    value: {
                        foo: 'baz',
                    },
                },
                type: 'message',
            } as BackendStoreMessage);
        });

        expect(result.current[0]).toEqual({ foo: 'bar' });

        // Then receive a message for the store uid
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'store-uid',
                    value: {
                        foo: 'updated',
                    },
                },
                type: 'message',
            } as BackendStoreMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ foo: 'updated' });
        });
    });

    test('variable with same uid with different extras are synchronized', async () => {
        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    uid: 'session-test-1',
                } as SingleVariable<any>),
            {
                wrapper: ({ children }) => (
                    <Wrapper>
                        <RequestExtrasProvider
                            options={{
                                headers: {
                                    'X-Dara-Extras': 'foo',
                                },
                            }}
                        >
                            {children}
                        </RequestExtrasProvider>
                    </Wrapper>
                ),
            }
        );

        const { result: result2 } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    uid: 'session-test-1',
                } as SingleVariable<any>),
            {
                wrapper: ({ children }) => (
                    <Wrapper>
                        <RequestExtrasProvider
                            options={{
                                headers: {
                                    'X-Dara-Extras': 'bar',
                                },
                            }}
                        >
                            {children}
                        </RequestExtrasProvider>
                    </Wrapper>
                ),
            }
        );

        await waitFor(() => {
            expect(result.current).not.toBeNull();
            expect(result2.current).not.toBeNull();
        });

        // update result1
        act(() => {
            result.current[1]('new1');
        });

        // both atoms should be updated
        await waitFor(() => {
            expect(result.current[0]).toEqual('new1');
            expect(result2.current[0]).toEqual('new1');
        });
    });

    test('variables with same uid and different extras created later are synchronized', async () => {
        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    uid: 'session-test-1',
                } as SingleVariable<any>),
            {
                wrapper: ({ children }) => (
                    <Wrapper>
                        <RequestExtrasProvider
                            options={{
                                headers: {
                                    'X-Dara-Extras': 'foo',
                                },
                            }}
                        >
                            {children}
                        </RequestExtrasProvider>
                    </Wrapper>
                ),
            }
        );

        // Update the value of first result
        act(() => {
            result.current[1]('new1');
        });

        // Create a new variable with no extras
        const { result: result2 } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    uid: 'session-test-1',
                } as SingleVariable<any>),
            {
                wrapper: Wrapper,
            }
        );

        // The new variable should have the same value as the first one
        await waitFor(() => {
            expect(result2.current[0]).toEqual('new1');
        });
    });
});
