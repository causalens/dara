/**
 * Integration tests for StreamVariable via useVariable hook.
 * Tests user-observable behavior by rendering components and asserting on the DOM.
 */
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Suspense, useContext, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { setSessionIdentifier } from '@/auth/session-state';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import {
    clearStreamUsage_TEST,
    getActiveConnectionCount,
    getActiveConnectionKeys,
    getConnectionController,
    registerStreamConnection,
    _internal as streamTrackerInternal,
} from '@/shared/interactivity/stream-usage-tracker';
import { getOrRegisterStreamVariable } from '@/shared/interactivity/stream-variable';
import { useStreamSubscription } from '@/shared/interactivity/use-stream-subscription';
import { denormalize } from '@/shared/utils/normalization';
import type { StreamVariable } from '@/types/core';

import { useVariable } from '../../js/shared';
import { WebSocketCtx, useRequestExtras, useTaskContext } from '../../js/shared/context';
import { server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

const SESSION_TOKEN = 'TEST_TOKEN';

mockLocalStorage();

/**
 * Flush pending microtasks/effects between unmount and tracker teardown.
 * This reduces races where Recoil effects react to aborted streams during cleanup.
 */
async function flushPendingRecoilUpdates(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

/**
 * Create an SSE handler using MSW.
 * Returns SSE-formatted stream with the given events.
 */
function createSSEHandler(
    uid: string,
    events: Array<{ type: string; data: unknown }>,
    delayMs = 10
): ReturnType<typeof http.post> {
    return http.post(`/api/core/stream/${uid}`, () => {
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                for (const event of events) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    const sseData = `data: ${JSON.stringify({ type: event.type, data: event.data })}\n\n`;
                    controller.enqueue(encoder.encode(sseData));
                }
                controller.close();
            },
        });

        return new HttpResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        });
    });
}

/**
 * Component that displays stream data using useVariable
 */
function StreamDisplay({ variable }: { variable: StreamVariable }): JSX.Element {
    const [data] = useVariable(variable);
    return <div data-testid="stream-data">{JSON.stringify(data)}</div>;
}

/**
 * Component that displays stream data using useRecoilValue directly.
 * Note: Must use useStreamSubscription before Recoil hooks for SSE lifecycle management.
 */
function StreamDisplayDirect({ variable }: { variable: StreamVariable }): JSX.Element {
    const { client: wsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const extras = useRequestExtras();

    // Must subscribe BEFORE Recoil hooks so atom effect sees count > 0
    // Pass extras so subscriptions are keyed by uid+extras
    useStreamSubscription([variable.uid], extras);

    const selector = getOrRegisterStreamVariable(variable, wsClient, taskContext, extras);
    const data = useRecoilValue(selector);
    return <div data-testid="stream-data">{JSON.stringify(data)}</div>;
}

/**
 * Component with Suspense boundary using useVariable
 */
function StreamWithSuspense({ variable }: { variable: StreamVariable }): JSX.Element {
    return (
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
            <StreamDisplay variable={variable} />
        </Suspense>
    );
}

/**
 * Component with Suspense boundary using useRecoilValue directly
 */
function StreamWithSuspenseDirect({ variable }: { variable: StreamVariable }): JSX.Element {
    return (
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
            <StreamDisplayDirect variable={variable} />
        </Suspense>
    );
}

describe('useVariable with StreamVariable', () => {
    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'bypass' });
    });

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
        setSessionIdentifier(SESSION_TOKEN);
    });

    afterEach(async () => {
        // Unmount React tree BEFORE clearing streams so useEffect cleanups
        // run first and Recoil doesn't try to re-render on aborted connections
        cleanup();
        await flushPendingRecoilUpdates();

        clearStreamUsage_TEST();
        await flushPendingRecoilUpdates();

        vi.clearAllTimers();
        vi.useRealTimers();
        setSessionIdentifier(null);
        server.resetHandlers();
        clearRegistries_TEST();
    });

    afterAll(() => server.close());

    it('suspends and shows loading until first data arrives (useRecoilValue)', async () => {
        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-stream-direct',
            variables: [],
            key_accessor: null,
            nested: [],
        };

        server.use(createSSEHandler('test-stream-direct', [{ type: 'json_snapshot', data: { message: 'hello' } }]));

        wrappedRender(<StreamWithSuspenseDirect variable={streamVar} />);

        // Initially shows loading (suspension)
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        expect(screen.queryByTestId('stream-data')).not.toBeInTheDocument();

        // After snapshot arrives, shows data
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('stream-data')).toHaveTextContent('{"message":"hello"}');
    });

    it('suspends and shows loading until first data arrives (useVariable)', async () => {
        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-stream',
            variables: [],
            key_accessor: null,
            nested: [],
        };

        server.use(createSSEHandler('test-stream', [{ type: 'json_snapshot', data: { message: 'hello' } }]));

        wrappedRender(<StreamWithSuspense variable={streamVar} />);

        // Initially shows loading (suspension)
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        expect(screen.queryByTestId('stream-data')).not.toBeInTheDocument();

        // After snapshot arrives, shows data
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('stream-data')).toHaveTextContent('{"message":"hello"}');
    });

    it('suspends again when dependencies change', async () => {
        // Create a plain variable that the stream depends on
        const dependencyVar = {
            __typename: 'Variable' as const,
            uid: 'dep-var',
            default: 'initial',
            nested: [],
        };

        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-suspend-deps',
            variables: [dependencyVar],
            key_accessor: null,
            nested: [],
        };

        // Handler that returns different data based on dependency value
        server.use(
            http.post('/api/core/stream/test-suspend-deps', async ({ request }) => {
                // Request body is in normalized format: { values: { data: [...], lookup: {...} } }
                const body = (await request.json()) as { values: { data: unknown[]; lookup: Record<string, unknown> } };
                const denormalizedValues = denormalize(body.values.data, body.values.lookup) as unknown[];
                const depValue = denormalizedValues[0];

                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        const data = `data: ${JSON.stringify({
                            type: 'json_snapshot',
                            data: { dep: depValue, message: `data for ${String(depValue)}` },
                        })}\n\n`;
                        controller.enqueue(encoder.encode(data));
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        Connection: 'keep-alive',
                    },
                });
            })
        );

        // Component that allows changing the dependency
        function TestComponent(): JSX.Element {
            const [, setDepValue] = useVariable(dependencyVar);
            const [streamData] = useVariable(streamVar);

            return (
                <div>
                    <div data-testid="stream-data">{JSON.stringify(streamData)}</div>
                    <button type="button" data-testid="change-dep" onClick={() => setDepValue('changed')}>
                        Change
                    </button>
                </div>
            );
        }

        wrappedRender(
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                <TestComponent />
            </Suspense>
        );

        // Initially shows loading (first suspension)
        expect(screen.getByTestId('loading')).toBeInTheDocument();

        // Wait for initial data
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Change the dependency - this should trigger re-suspension
        screen.getByTestId('change-dep').click();

        // Should show loading again while fetching new data
        await waitFor(
            () => {
                expect(screen.getByTestId('loading')).toBeInTheDocument();
            },
            { timeout: 1000 }
        );

        // Wait for new data to arrive
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toBeInTheDocument();
                expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"changed"');
            },
            { timeout: 3000 }
        );
    });

    it('shows stale value instead of suspending when suspend=false', async () => {
        // Create a plain variable that the stream depends on
        const dependencyVar = {
            __typename: 'Variable' as const,
            uid: 'dep-var-nosuspend',
            default: 'initial',
            nested: [],
        };

        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-nosuspend',
            variables: [dependencyVar],
            key_accessor: null,
            nested: [],
        };

        // Handler that returns different data based on dependency value with a delay
        server.use(
            http.post('/api/core/stream/test-nosuspend', async ({ request }) => {
                const body = (await request.json()) as { values: { data: unknown[]; lookup: Record<string, unknown> } };
                const denormalizedValues = denormalize(body.values.data, body.values.lookup) as unknown[];
                const depValue = denormalizedValues[0];

                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        // Longer delay to give time to verify stale value is shown
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        const data = `data: ${JSON.stringify({
                            type: 'json_snapshot',
                            data: { dep: depValue, message: `data for ${String(depValue)}` },
                        })}\n\n`;
                        controller.enqueue(encoder.encode(data));
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        Connection: 'keep-alive',
                    },
                });
            })
        );

        // Component that allows changing the dependency, with suspend=false passed directly
        function TestComponent(): JSX.Element {
            const [, setDepValue] = useVariable(dependencyVar);
            const [streamData] = useVariable(streamVar, { suspend: false });

            return (
                <div>
                    <div data-testid="stream-data">{JSON.stringify(streamData)}</div>
                    <button type="button" data-testid="change-dep" onClick={() => setDepValue('changed')}>
                        Change
                    </button>
                </div>
            );
        }

        wrappedRender(
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                <TestComponent />
            </Suspense>
        );

        // Initially shows loading (first render always suspends)
        expect(screen.getByTestId('loading')).toBeInTheDocument();

        // Wait for initial data
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toBeInTheDocument();
            },
            { timeout: 3000 }
        );

        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Change the dependency - wrap in act to ensure state updates complete
        await act(async () => {
            screen.getByTestId('change-dep').click();
            // Wait a tick to let the state update propagate
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        // With suspend=false, should NOT show loading - should keep showing stale value
        // Stale value should still be visible (not loading)
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Eventually new data arrives and updates
        await waitFor(
            () => {
                expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"changed"');
            },
            { timeout: 3000 }
        );

        // Still no loading shown
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });

    /**
     * Creates an SSE handler that stays open (doesn't close).
     * Returns a function to get the number of times the endpoint was called.
     */
    function createPersistentSSEHandler(uid: string): {
        handler: ReturnType<typeof http.post>;
        getConnectionCount: () => number;
    } {
        let connectionCount = 0;

        const handler = http.post(`/api/core/stream/${uid}`, () => {
            connectionCount++;
            const encoder = new TextEncoder();

            const stream = new ReadableStream({
                async start(controller) {
                    // Send initial data
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    const data = `data: ${JSON.stringify({ type: 'json_snapshot', data: { count: connectionCount } })}\n\n`;
                    controller.enqueue(encoder.encode(data));
                    // Keep stream open - don't close controller
                },
            });

            return new HttpResponse(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            });
        });

        return { handler, getConnectionCount: () => connectionCount };
    }

    describe('connection sharing and cleanup', () => {
        it('shares connection while subscribed, closes when all unmount, reopens on remount', async () => {
            const streamUid = 'test-shared-conn-1';
            const streamVar: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUid,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            const { handler, getConnectionCount } = createPersistentSSEHandler(streamUid);
            server.use(handler);

            function Subscriber({ id }: { id: string }): JSX.Element {
                const [data] = useVariable(streamVar);
                return <div data-testid={`subscriber-${id}`}>{JSON.stringify(data)}</div>;
            }

            let setVisibleSubscribers: (ids: string[]) => void;
            function Harness(): JSX.Element {
                const [visibleIds, setVisibleIds] = useState<string[]>(['A', 'B', 'C']);
                setVisibleSubscribers = setVisibleIds;

                return (
                    <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                        {visibleIds.map((id) => (
                            <Subscriber key={id} id={id} />
                        ))}
                        {visibleIds.length === 0 && <div data-testid="empty">No subscribers</div>}
                    </Suspense>
                );
            }

            const { unmount } = wrappedRender(<Harness />);

            // Wait for all subscribers to render with data
            await waitFor(
                () => {
                    expect(screen.getByTestId('subscriber-A')).toBeInTheDocument();
                    expect(screen.getByTestId('subscriber-B')).toBeInTheDocument();
                    expect(screen.getByTestId('subscriber-C')).toBeInTheDocument();
                },
                { timeout: 3000 }
            );

            // Only 1 connection created (shared atom)
            expect(getActiveConnectionCount()).toBe(1);
            expect(getConnectionCount()).toBe(1);

            // Remove A - connection should remain (shared with B and C)
            act(() => setVisibleSubscribers(['B', 'C']));
            await waitFor(() => {
                expect(screen.queryByTestId('subscriber-A')).not.toBeInTheDocument();
            });
            expect(getActiveConnectionCount()).toBe(1);

            // Remove B - connection should remain (shared with C)
            act(() => setVisibleSubscribers(['C']));
            await waitFor(() => {
                expect(screen.queryByTestId('subscriber-B')).not.toBeInTheDocument();
            });
            expect(getActiveConnectionCount()).toBe(1);

            // No new connections were made - same connection throughout
            expect(getConnectionCount()).toBe(1);

            // Remove C (last subscriber) - connection should be closed
            act(() => setVisibleSubscribers([]));
            await waitFor(() => {
                expect(screen.getByTestId('empty')).toBeInTheDocument();
            });

            // Connection should be cleaned up after debounce period (1500ms)
            // Wait for debounce timer to fire
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 1600));
            });
            expect(getActiveConnectionCount()).toBe(0);

            // Still only 1 connection was ever made
            expect(getConnectionCount()).toBe(1);

            // Re-mount subscribers - should create a NEW connection
            act(() => setVisibleSubscribers(['D']));
            await waitFor(
                () => {
                    expect(screen.getByTestId('subscriber-D')).toBeInTheDocument();
                },
                { timeout: 3000 }
            );

            // New connection created
            expect(getActiveConnectionCount()).toBe(1);
            expect(getConnectionCount()).toBe(2); // Second connection

            // Clean up: unmount subscriber D and wait for debounced cleanup
            act(() => setVisibleSubscribers([]));
            await waitFor(() => {
                expect(screen.getByTestId('empty')).toBeInTheDocument();
            });
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 1600));
            });
            expect(getActiveConnectionCount()).toBe(0);

            // Explicit teardown inside the test to avoid cross-test stream races.
            unmount();
            await flushPendingRecoilUpdates();
            clearStreamUsage_TEST();
            expect(getActiveConnectionCount()).toBe(0);
        });

        it('cleanup callback aborts SSE connection when called', async () => {
            const streamUid = 'test-cleanup-cb-2';
            const streamVar: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUid,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            const { handler } = createPersistentSSEHandler(streamUid);
            server.use(handler);

            function Subscriber(): JSX.Element {
                const [data] = useVariable(streamVar);
                return <div data-testid="subscriber">{JSON.stringify(data)}</div>;
            }

            const { unmount } = wrappedRender(
                <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                    <Subscriber />
                </Suspense>
            );

            // Wait for subscriber to render with data
            await waitFor(
                () => {
                    expect(screen.getByTestId('subscriber')).toBeInTheDocument();
                },
                { timeout: 3000 }
            );

            // Should have exactly 1 active connection
            expect(getActiveConnectionCount()).toBe(1);

            // Get the connection key and abort controller
            const connectionKeys = getActiveConnectionKeys();
            expect(connectionKeys.length).toBe(1);
            const connectionKey = connectionKeys[0];

            const controller = getConnectionController(connectionKey);
            expect(controller).toBeDefined();

            // Manually abort the connection via the controller
            // (simulating what happens during cleanup)
            controller!.abort();

            // Unmount first so we don't clear stream tracker while Recoil tree is live.
            unmount();
            await flushPendingRecoilUpdates();

            // Use cleanupAllStreams to properly clear tracker state
            clearStreamUsage_TEST();

            // Connection should be removed
            expect(getActiveConnectionCount()).toBe(0);
        });

        it('creates new connection for different stream variable params', async () => {
            const streamUidA = 'test-sep-A-3';
            const streamUidB = 'test-sep-B-3';
            // Create two stream variables with different uids
            const streamVarA: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUidA,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            const streamVarB: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUidB,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            const { handler: handlerA, getConnectionCount: getCountA } = createPersistentSSEHandler(streamUidA);
            const { handler: handlerB, getConnectionCount: getCountB } = createPersistentSSEHandler(streamUidB);
            server.use(handlerA, handlerB);

            function SubscriberA(): JSX.Element {
                const [data] = useVariable(streamVarA);
                return <div data-testid="subscriber-A">{JSON.stringify(data)}</div>;
            }

            function SubscriberB(): JSX.Element {
                const [data] = useVariable(streamVarB);
                return <div data-testid="subscriber-B">{JSON.stringify(data)}</div>;
            }

            const { unmount } = wrappedRender(
                <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                    <SubscriberA />
                    <SubscriberB />
                </Suspense>
            );

            // Wait for both subscribers to render
            await waitFor(
                () => {
                    expect(screen.getByTestId('subscriber-A')).toBeInTheDocument();
                    expect(screen.getByTestId('subscriber-B')).toBeInTheDocument();
                },
                { timeout: 3000 }
            );

            // Should have 2 separate connections (different stream variables)
            expect(getActiveConnectionCount()).toBe(2);
            expect(getCountA()).toBe(1);
            expect(getCountB()).toBe(1);

            // Explicit teardown inside the test to avoid stream tracker races.
            unmount();
            await flushPendingRecoilUpdates();
            clearStreamUsage_TEST();
            expect(getActiveConnectionCount()).toBe(0);
        });
    });

    describe('edge cases', () => {
        it('handles multiple unsubscribes gracefully (count never goes negative)', async () => {
            const streamUid = 'test-multi-unsub';
            const streamVar: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUid,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            const { handler } = createPersistentSSEHandler(streamUid);
            server.use(handler);

            function Subscriber(): JSX.Element {
                const [data] = useVariable(streamVar);
                return <div data-testid="subscriber">{JSON.stringify(data)}</div>;
            }

            const { unmount } = wrappedRender(
                <Suspense fallback={<div>Loading...</div>}>
                    <Subscriber />
                </Suspense>
            );

            await waitFor(
                () => {
                    expect(screen.getByTestId('subscriber')).toBeInTheDocument();
                },
                { timeout: 3000 }
            );

            expect(getActiveConnectionCount()).toBe(1);

            // Unmount triggers unsubscribe
            unmount();
            await flushPendingRecoilUpdates();

            // Multiple cleanups should not cause issues
            clearStreamUsage_TEST();
            clearStreamUsage_TEST(); // Call twice - should be idempotent

            expect(getActiveConnectionCount()).toBe(0);
        });

        it('cleans up orphaned connections after timeout', async () => {
            // Use fake timers for this test
            vi.useFakeTimers();

            const ORPHAN_TIMEOUT = streamTrackerInternal.ORPHAN_TIMEOUT_MS;

            const mockController = new AbortController();
            const mockStart = vi.fn().mockReturnValue({
                cleanup: vi.fn(),
                controller: mockController,
            });

            registerStreamConnection('test-orphan-timeout', {}, 'test-atom-key', mockStart);

            // Connection should be active
            expect(getActiveConnectionCount()).toBe(1);

            // Advance time past orphan timeout
            await vi.advanceTimersByTimeAsync(ORPHAN_TIMEOUT + 100);

            // Connection should be cleaned up (orphaned)
            expect(getActiveConnectionCount()).toBe(0);

            // Restore real timers
            vi.useRealTimers();
        });

        it('does NOT kill connection when first SSE message is delayed (regression test)', async () => {
            // REGRESSION TEST for orphan timer race condition with React Suspense.
            // Bug: With a short orphan timeout (e.g., 5s), the timer fires before useEffect
            // can call subscribeStream() because component is suspended waiting for first SSE data.
            // Fix: Orphan timeout is now long enough (2 minutes) to act as a safety net,
            // allowing slow streams to deliver their first message before cleanup.
            vi.useFakeTimers();

            // Simulate a "slow" stream - first message takes 30 seconds.
            // This would have failed with the old 5-second orphan timeout.
            const SLOW_FIRST_MESSAGE_DELAY_MS = 30000;

            const streamUid = 'test-delayed-first-message';
            const streamVar: StreamVariable = {
                __typename: 'StreamVariable',
                uid: streamUid,
                variables: [],
                key_accessor: null,
                nested: [],
            };

            // Track if connection was aborted
            let connectionAborted = false;
            let sendFirstMessage: (() => void) | null = null;

            // SSE handler that opens immediately but delays first message
            server.use(
                http.post(`/api/core/stream/${streamUid}`, () => {
                    const encoder = new TextEncoder();

                    const stream = new ReadableStream({
                        start(controller) {
                            // Store function to send message later
                            sendFirstMessage = () => {
                                if (!connectionAborted) {
                                    const data = `data: ${JSON.stringify({ type: 'json_snapshot', data: { delayed: true } })}\n\n`;
                                    controller.enqueue(encoder.encode(data));
                                    controller.close();
                                }
                            };
                        },
                        cancel() {
                            connectionAborted = true;
                        },
                    });

                    return new HttpResponse(stream, {
                        headers: {
                            'Content-Type': 'text/event-stream',
                            'Cache-Control': 'no-cache',
                            Connection: 'keep-alive',
                        },
                    });
                })
            );

            function Subscriber(): JSX.Element {
                const [data] = useVariable(streamVar);
                return <div data-testid="subscriber">{JSON.stringify(data)}</div>;
            }

            const { unmount } = wrappedRender(
                <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                    <Subscriber />
                </Suspense>
            );

            // Let React render and SSE connection start
            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            // Should show loading (suspended waiting for first SSE data)
            expect(screen.getByTestId('loading')).toBeInTheDocument();

            // Connection should be active
            expect(getActiveConnectionCount()).toBe(1);
            expect(connectionAborted).toBe(false);

            // Advance time to simulate slow first message (30 seconds)
            // With old 5s timeout, this would have killed the connection
            await act(async () => {
                await vi.advanceTimersByTimeAsync(SLOW_FIRST_MESSAGE_DELAY_MS);
            });

            // Connection should still be active (orphan timeout is now 2 minutes)
            expect(connectionAborted).toBe(false);
            expect(getActiveConnectionCount()).toBe(1);

            // Now send the first message
            await act(async () => {
                sendFirstMessage?.();
                await vi.advanceTimersByTimeAsync(100);
            });

            // Component should unsuspend and show data
            await waitFor(() => {
                expect(screen.getByTestId('subscriber')).toBeInTheDocument();
            });
            expect(screen.getByTestId('subscriber')).toHaveTextContent('{"delayed":true}');

            unmount();
            await flushPendingRecoilUpdates();
            clearStreamUsage_TEST();
            expect(getActiveConnectionCount()).toBe(0);

            vi.useRealTimers();
        });
    });
});
