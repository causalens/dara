import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { rest } from 'msw';

import { BackendStoreMessage, BackendStorePatchMessage } from '@/api/websocket';
import { setSessionToken } from '@/auth/use-session-token';
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
        setSessionToken(SESSION_TOKEN);

        // This is necessary to avoid data bleeding between tests
        // Though this causes warnings about duplicate atoms in the test console
        clearRegistries_TEST();
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        server.resetHandlers();
        setSessionToken(null);
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
                    key: getSessionKey('session-test-1'),
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
                        value: {
                            foo: 'bar',
                        },
                        sequence_number: 0,
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
                        value: {
                            foo: 'bar',
                        },
                        sequence_number: 0,
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
            expect(onSave).toHaveBeenCalledWith({
                values: { 'store-uid': { foo: 'baz' } },
                ws_channel: expect.any(String),
            });
        });

        // Check that the value is updated
        expect(result.current[0]).toEqual({ foo: 'baz' });
    });

    test('variable with readonly BackendStore does not send request on update', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        value: {
                            foo: 'bar',
                        },
                        sequence_number: 0,
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

        // first one is readonly
        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: 'foo',
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'store-uid',
                        readonly: true,
                    },
                    uid: 'session-test-1',
                } as SingleVariable<any, BackendStore>),
            { wrapper: Wrapper }
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
            { wrapper: Wrapper }
        );

        await waitFor(() => {
            expect(result.current).not.toBeNull();
            expect(result2.current).not.toBeNull();
        });

        // update both
        act(() => {
            result.current[1]({ foo: 'new1' });
            result2.current[1]({ foo: 'new2' });
        });

        await waitFor(() => {
            // check each request has the correct extras depending on the context
            expect(onSave).toHaveBeenCalledWith({
                values: { 'store-uid-2': { foo: 'new2' } },
                ws_channel: expect.any(String),
            });
            // not called for the readonly store
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        // Check that the value is updated for both
        expect(result.current[0]).toEqual({ foo: 'new1' });
        expect(result2.current[0]).toEqual({ foo: 'new2' });
    });

    test('variable with BackendStore sends separate request for different extras context', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        value: {
                            foo: 'bar',
                        },
                        sequence_number: 0,
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
            expect(onSave).toHaveBeenCalledWith('foo', {
                values: { 'store-uid': { foo: 'new1' } },
                ws_channel: expect.any(String),
            });
            expect(onSave).toHaveBeenCalledWith('bar', {
                values: { 'store-uid-2': { foo: 'new2' } },
                ws_channel: expect.any(String),
            });
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
                        value: {
                            foo: 'bar',
                        },
                        sequence_number: 0,
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
                    sequence_number: 1,
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
                    sequence_number: 1,
                },
                type: 'message',
            } as BackendStoreMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ foo: 'updated' });
        });
    });

    test('variable with BackendStore applies JSON patches on received WS message', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        value: {
                            user: {
                                name: 'John',
                                age: 30,
                            },
                            items: ['apple', 'banana'],
                        },
                        sequence_number: 0,
                    })
                );
            })
        );

        const wsClient = new MockWebSocketClient('CHANNEL');

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: {},
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
            expect(result.current[0]).toEqual({
                user: {
                    name: 'John',
                    age: 30,
                },
                items: ['apple', 'banana'],
            });
        });

        // Apply JSON patch to update user age and add item
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'store-uid',
                    patches: [
                        { op: 'replace', path: '/user/age', value: 31 },
                        { op: 'add', path: '/items/-', value: 'cherry' },
                        { op: 'add', path: '/user/city', value: 'New York' },
                    ],
                    sequence_number: 1,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({
                user: {
                    name: 'John',
                    age: 31,
                    city: 'New York',
                },
                items: ['apple', 'banana', 'cherry'],
            });
        });

        // Apply another patch to remove an item
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'store-uid',
                    patches: [{ op: 'remove', path: '/items/0' }],
                    sequence_number: 2,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({
                user: {
                    name: 'John',
                    age: 31,
                    city: 'New York',
                },
                items: ['banana', 'cherry'],
            });
        });

        // Test patch for different store uid should not affect our variable
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'other-store-uid',
                    patches: [{ op: 'replace', path: '/user/name', value: 'Jane' }],
                    sequence_number: 1,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        // Value should remain unchanged
        expect(result.current[0]).toEqual({
            user: {
                name: 'John',
                age: 31,
                city: 'New York',
            },
            items: ['banana', 'cherry'],
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

        // Create a new variable with different extras
        const { result: result3 } = renderHook(
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

        // The new variable should have the same value as the first one
        await waitFor(() => {
            expect(result3.current[0]).toEqual('new1');
        });
    });

    test('BackendStore validates sequence numbers', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(ctx.json({ value: { count: 0 }, sequence_number: 0 }));
            })
        );

        const wsClient = new MockWebSocketClient('CHANNEL');

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: { count: 0 },
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'sequence-validation-store',
                    },
                    uid: 'sequence-validation-var',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: ({ children }) => <Wrapper client={wsClient}>{children}</Wrapper>,
            }
        );

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 0 });
        });

        // Send a patch with correct sequence number 1
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'sequence-validation-store',
                    patches: [{ op: 'replace', path: '/count', value: 1 }],
                    sequence_number: 1,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 1 });
        });

        // Send patch with wrong sequence number - value should not change
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'sequence-validation-store',
                    patches: [{ op: 'replace', path: '/count', value: 999 }],
                    sequence_number: 999, // Wrong sequence
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        // Value should remain unchanged after invalid patch
        expect(result.current[0]).toEqual({ count: 1 });

        consoleSpy.mockRestore();
    });

    test('BackendStore resets sequence number on full value update', async () => {
        // Mock endpoint to retrieve store value
        server.use(
            rest.get('/api/core/store/:store_uid', (req, res, ctx) => {
                return res(
                    ctx.json({
                        value: {
                            count: 0,
                        },
                        sequence_number: 0,
                    })
                );
            })
        );

        const wsClient = new MockWebSocketClient('CHANNEL');

        const { result } = renderHook(
            () =>
                useVariable<any>({
                    __typename: 'Variable',
                    default: { count: 0 },
                    nested: [],
                    store: {
                        __typename: 'BackendStore',
                        uid: 'sequence-reset-store',
                    },
                    uid: 'sequence-reset-var',
                } as SingleVariable<any, BackendStore>),
            {
                wrapper: ({ children }) => <Wrapper client={wsClient}>{children}</Wrapper>,
            }
        );

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 0 });
        });

        // Send a patch with sequence number 1
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'sequence-reset-store',
                    patches: [{ op: 'replace', path: '/count', value: 1 }],
                    sequence_number: 1,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 1 });
        });

        // Send a full value update (resets sequence to 0)
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'sequence-reset-store',
                    value: { count: 10 },
                    sequence_number: 5,
                },
                type: 'message',
            } as BackendStoreMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 10 });
        });

        // Now send a patch with sequence number 6 (should be accepted since sequence was reset to 5)
        act(() => {
            wsClient.receiveMessage({
                message: {
                    store_uid: 'sequence-reset-store',
                    patches: [{ op: 'replace', path: '/count', value: 11 }],
                    sequence_number: 6,
                },
                type: 'message',
            } as BackendStorePatchMessage);
        });

        await waitFor(() => {
            expect(result.current[0]).toEqual({ count: 11 });
        });
    });
});
