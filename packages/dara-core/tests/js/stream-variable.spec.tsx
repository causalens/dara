/**
 * Tests for StreamVariable client-side implementation.
 *
 * Covers:
 * - Pure functions: extractKey, applyStreamEvent, getStreamValue
 * - Atom state management
 * - SSE connection lifecycle (with mocks)
 */
import { HttpResponse, http } from 'msw';

import { setSessionToken } from '@/auth/use-session-token';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import {
    type StreamAtomParams,
    type StreamEvent,
    type StreamState,
    _internal,
    applyStreamEvent,
    extractKey,
    getStreamValue,
} from '@/shared/interactivity/stream-variable';

import { server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

const SESSION_TOKEN = 'TEST_TOKEN';

mockLocalStorage();

describe('StreamVariable', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
        setSessionToken(SESSION_TOKEN);
        clearRegistries_TEST();
        // Clear active connections between tests
        _internal.activeConnections.clear();
    });

    afterEach(() => {
        setSessionToken(null);
        vi.clearAllTimers();
        server.resetHandlers();
        // Abort any remaining connections
        for (const controller of _internal.activeConnections.values()) {
            controller.abort();
        }
        _internal.activeConnections.clear();
    });

    afterAll(() => server.close());

    describe('extractKey', () => {
        it('extracts string key from simple property', () => {
            const item = { id: 'abc123', name: 'Test' };
            expect(extractKey(item, 'id')).toBe('abc123');
        });

        it('extracts number key from simple property', () => {
            const item = { id: 42, name: 'Test' };
            expect(extractKey(item, 'id')).toBe(42);
        });

        it('extracts key from nested property', () => {
            const item = { data: { id: 'nested-id' }, name: 'Test' };
            expect(extractKey(item, 'data.id')).toBe('nested-id');
        });

        it('returns undefined for null item', () => {
            expect(extractKey(null, 'id')).toBeUndefined();
        });

        it('returns undefined for undefined item', () => {
            expect(extractKey(undefined, 'id')).toBeUndefined();
        });

        it('returns undefined when property does not exist', () => {
            const item = { name: 'Test' };
            expect(extractKey(item, 'id')).toBeUndefined();
        });

        it('returns undefined for non-string/number key values', () => {
            const item = { id: { nested: 'object' } };
            expect(extractKey(item, 'id')).toBeUndefined();
        });

        it('returns undefined for array key values', () => {
            const item = { id: [1, 2, 3] };
            expect(extractKey(item, 'id')).toBeUndefined();
        });
    });

    describe('applyStreamEvent', () => {
        // Use 'connected' as initial status - in real usage, atom starts pending (no state)
        // until first event, then applyStreamEvent creates state with 'connected'
        const initialState: StreamState = {
            data: undefined,
            status: 'connected',
        };

        describe('json_snapshot events', () => {
            it('replaces entire state with snapshot data', () => {
                const event: StreamEvent = {
                    type: 'json_snapshot',
                    data: { items: [1, 2, 3], count: 3 },
                };

                const result = applyStreamEvent(initialState, event, null);

                expect(result.data).toEqual({ items: [1, 2, 3], count: 3 });
                expect(result.status).toBe('connected');
                expect(result.error).toBeUndefined();
            });

            it('works with array snapshot', () => {
                const event: StreamEvent = {
                    type: 'json_snapshot',
                    data: ['a', 'b', 'c'],
                };

                const result = applyStreamEvent(initialState, event, null);

                expect(result.data).toEqual(['a', 'b', 'c']);
                expect(result.status).toBe('connected');
            });

            it('clears previous error on snapshot', () => {
                const errorState: StreamState = {
                    data: undefined,
                    status: 'error',
                    error: 'Previous error',
                };
                const event: StreamEvent = { type: 'json_snapshot', data: 'new data' };

                const result = applyStreamEvent(errorState, event, null);

                expect(result.status).toBe('connected');
                expect(result.error).toBeUndefined();
            });
        });

        describe('add events', () => {
            it('adds single item to keyed collection', () => {
                const state: StreamState = {
                    data: { '1': { id: '1', name: 'First' } },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'add',
                    data: { id: '2', name: 'Second' },
                };

                const result = applyStreamEvent(state, event, 'id');

                expect(result.data).toEqual({
                    '1': { id: '1', name: 'First' },
                    '2': { id: '2', name: 'Second' },
                });
            });

            it('adds multiple items from array', () => {
                const state: StreamState = { data: {}, status: 'connected' };
                const event: StreamEvent = {
                    type: 'add',
                    data: [
                        { id: '1', name: 'First' },
                        { id: '2', name: 'Second' },
                    ],
                };

                const result = applyStreamEvent(state, event, 'id');

                expect(result.data).toEqual({
                    '1': { id: '1', name: 'First' },
                    '2': { id: '2', name: 'Second' },
                });
            });

            it('updates existing item with same key (deduplication)', () => {
                const state: StreamState = {
                    data: { '1': { id: '1', name: 'Old', value: 10 } },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'add',
                    data: { id: '1', name: 'Updated', value: 20 },
                };

                const result = applyStreamEvent(state, event, 'id');

                expect(result.data).toEqual({
                    '1': { id: '1', name: 'Updated', value: 20 },
                });
            });

            it('initializes empty data when adding to undefined state', () => {
                const event: StreamEvent = {
                    type: 'add',
                    data: { id: '1', name: 'First' },
                };

                const result = applyStreamEvent(initialState, event, 'id');

                expect(result.data).toEqual({
                    '1': { id: '1', name: 'First' },
                });
            });

            it('warns and returns unchanged state when no key_accessor', () => {
                const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const state: StreamState = { data: {}, status: 'connected' };
                const event: StreamEvent = {
                    type: 'add',
                    data: { id: '1', name: 'Test' },
                };

                const result = applyStreamEvent(state, event, null);

                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('add() event received but no key_accessor')
                );
                expect(result).toBe(state); // Unchanged
            });

            it('warns when key cannot be extracted', () => {
                const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const state: StreamState = { data: {}, status: 'connected' };
                const event: StreamEvent = {
                    type: 'add',
                    data: { name: 'No ID field' },
                };

                applyStreamEvent(state, event, 'id');

                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining("Could not extract key using accessor 'id'"),
                    expect.anything()
                );
            });

            it('supports nested key accessor', () => {
                const state: StreamState = { data: {}, status: 'connected' };
                const event: StreamEvent = {
                    type: 'add',
                    data: { meta: { uuid: 'abc' }, value: 42 },
                };

                const result = applyStreamEvent(state, event, 'meta.uuid');

                expect(result.data).toEqual({
                    abc: { meta: { uuid: 'abc' }, value: 42 },
                });
            });
        });

        describe('patch events', () => {
            it('applies add operation', () => {
                const state: StreamState = {
                    data: { items: ['a', 'b'] },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'json_patch',
                    data: [{ op: 'add', path: '/items/-', value: 'c' }],
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.data).toEqual({ items: ['a', 'b', 'c'] });
            });

            it('applies replace operation', () => {
                const state: StreamState = {
                    data: { count: 5, name: 'test' },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'json_patch',
                    data: [{ op: 'replace', path: '/count', value: 10 }],
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.data).toEqual({ count: 10, name: 'test' });
            });

            it('applies remove operation', () => {
                const state: StreamState = {
                    data: { a: 1, b: 2, c: 3 },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'json_patch',
                    data: [{ op: 'remove', path: '/b' }],
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.data).toEqual({ a: 1, c: 3 });
            });

            it('applies multiple operations in sequence', () => {
                const state: StreamState = {
                    data: { items: [], meta: { count: 0 } },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'json_patch',
                    data: [
                        { op: 'add', path: '/items/-', value: 'first' },
                        { op: 'replace', path: '/meta/count', value: 1 },
                    ],
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.data).toEqual({
                    items: ['first'],
                    meta: { count: 1 },
                });
            });

            it('warns and returns unchanged when patching undefined state', () => {
                const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const event: StreamEvent = {
                    type: 'json_patch',
                    data: [{ op: 'add', path: '/items/-', value: 'x' }],
                };

                const result = applyStreamEvent(initialState, event, null);

                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('patch event received but no state exists')
                );
                expect(result).toBe(initialState);
            });

            it('sets error status on invalid patch', () => {
                const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
                const state: StreamState = {
                    data: { items: [] },
                    status: 'connected',
                };
                const event: StreamEvent = {
                    type: 'json_patch',
                    // Invalid: trying to replace non-existent path
                    data: [{ op: 'replace', path: '/nonexistent/deep/path', value: 'x' }],
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.status).toBe('error');
                expect(result.error).toContain('Patch failed');
                expect(consoleSpy).toHaveBeenCalled();
            });
        });

        describe('reconnect events', () => {
            it('sets status to reconnecting', () => {
                const state: StreamState = {
                    data: { preserved: 'data' },
                    status: 'connected',
                };
                const event: StreamEvent = { type: 'reconnect', data: null };

                const result = applyStreamEvent(state, event, null);

                expect(result.status).toBe('reconnecting');
                expect(result.data).toEqual({ preserved: 'data' }); // Data preserved
            });
        });

        describe('error events', () => {
            it('sets error status with string message', () => {
                const state: StreamState = { data: { some: 'data' }, status: 'connected' };
                const event: StreamEvent = {
                    type: 'error',
                    data: 'Connection lost',
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.status).toBe('error');
                expect(result.error).toBe('Connection lost');
                expect(result.data).toEqual({ some: 'data' }); // Data preserved
            });

            it('handles non-string error data', () => {
                const state: StreamState = { data: null, status: 'connected' };
                const event: StreamEvent = {
                    type: 'error',
                    data: { code: 500, message: 'Internal error' },
                };

                const result = applyStreamEvent(state, event, null);

                expect(result.status).toBe('error');
                expect(result.error).toBe('Unknown error');
            });
        });

        describe('unknown events', () => {
            it('warns and returns unchanged state', () => {
                const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const state: StreamState = { data: 'test', status: 'connected' };
                const event = { type: 'unknown_type', data: null } as unknown as StreamEvent;

                const result = applyStreamEvent(state, event, null);

                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown event type'));
                expect(result).toBe(state);
            });
        });
    });

    describe('getStreamValue', () => {
        it('returns data as-is for custom mode (no key_accessor)', () => {
            const state: StreamState = {
                data: { custom: 'structure', nested: { value: 1 } },
                status: 'connected',
            };

            const value = getStreamValue(state, null);

            expect(value).toEqual({ custom: 'structure', nested: { value: 1 } });
        });

        it('returns array of values for keyed mode', () => {
            const state: StreamState = {
                data: {
                    '1': { id: '1', name: 'First' },
                    '2': { id: '2', name: 'Second' },
                },
                status: 'connected',
            };

            const value = getStreamValue(state, 'id');

            expect(value).toEqual([
                { id: '1', name: 'First' },
                { id: '2', name: 'Second' },
            ]);
        });

        it('returns array data as-is even with key_accessor', () => {
            const state: StreamState = {
                data: [{ id: '1' }, { id: '2' }],
                status: 'connected',
            };

            const value = getStreamValue(state, 'id');

            // Array data is returned as-is (not double-wrapped)
            expect(value).toEqual([{ id: '1' }, { id: '2' }]);
        });

        it('returns null/undefined data as-is', () => {
            const nullState: StreamState = { data: null, status: 'connected' };
            const undefinedState: StreamState = { data: undefined, status: 'connected' };

            expect(getStreamValue(nullState, 'id')).toBeNull();
            expect(getStreamValue(undefinedState, 'id')).toBeUndefined();
        });
    });

    describe('helper functions', () => {
        describe('getBackoffDelay', () => {
            it('returns exponential backoff delays', () => {
                expect(_internal.getBackoffDelay(0)).toBe(1000);
                expect(_internal.getBackoffDelay(1)).toBe(2000);
                expect(_internal.getBackoffDelay(2)).toBe(4000);
                expect(_internal.getBackoffDelay(3)).toBe(8000);
            });

            it('caps at maximum delay', () => {
                expect(_internal.getBackoffDelay(10)).toBe(30000); // MAX_DELAY_MS
                expect(_internal.getBackoffDelay(100)).toBe(30000);
            });
        });

        describe('serializeAtomParams / deserializeAtomParams', () => {
            it('round-trips params correctly', () => {
                const params: StreamAtomParams = {
                    uid: 'test-uid',
                    resolvedValues: [1, 'test', { nested: true }],
                    variables: [],
                    keyAccessor: 'id',
                    extras: { headers: { 'X-Custom': 'value' } },
                };

                const serialized = _internal.serializeAtomParams(params);
                const deserialized = _internal.deserializeAtomParams(serialized);

                expect(deserialized).toEqual(params);
            });

            it('handles null keyAccessor', () => {
                const params: StreamAtomParams = {
                    uid: 'uid',
                    resolvedValues: [],
                    variables: [],
                    keyAccessor: null,
                    extras: {},
                };

                const serialized = _internal.serializeAtomParams(params);
                const deserialized = _internal.deserializeAtomParams(serialized);

                expect(deserialized.keyAccessor).toBeNull();
            });
        });
    });

    describe('startStreamConnection', () => {
        const createMockParams = (overrides: Partial<StreamAtomParams> = {}): StreamAtomParams => ({
            uid: 'test-stream',
            resolvedValues: [],
            variables: [],
            keyAccessor: 'id',
            extras: {},
            ...overrides,
        });

        it('returns a cleanup function that aborts the connection', () => {
            // Setup SSE mock that never completes
            server.use(
                http.post('/api/core/stream/test-stream', () => {
                    return new HttpResponse(null, {
                        status: 200,
                        headers: { 'Content-Type': 'text/event-stream' },
                    });
                })
            );

            const setSelf = vi.fn();
            const params = createMockParams();

            const cleanup = _internal.startStreamConnection(params, setSelf);

            expect(typeof cleanup).toBe('function');

            // Should have registered a connection
            expect(_internal.activeConnections.size).toBe(1);

            // Cleanup should abort
            cleanup();

            // Connection should be removed
            expect(_internal.activeConnections.size).toBe(0);
        });

        it('aborts existing connection when starting new one with same key', () => {
            server.use(
                http.post('/api/core/stream/test-stream', () => {
                    return new HttpResponse(null, {
                        status: 200,
                        headers: { 'Content-Type': 'text/event-stream' },
                    });
                })
            );

            const setSelf = vi.fn();
            const params = createMockParams({ resolvedValues: ['dep1'] });

            // Start first connection
            _internal.startStreamConnection(params, setSelf);
            expect(_internal.activeConnections.size).toBe(1);

            // Get the first controller (we verified size is 1 above)
            const firstKey = Array.from(_internal.activeConnections.keys())[0]!;
            const firstController = _internal.activeConnections.get(firstKey)!;
            const abortSpy = vi.spyOn(firstController, 'abort');

            // Start second connection with same params (should abort first)
            _internal.startStreamConnection(params, setSelf);

            expect(abortSpy).toHaveBeenCalled();
            expect(_internal.activeConnections.size).toBe(1); // Still just one
        });
    });
});
