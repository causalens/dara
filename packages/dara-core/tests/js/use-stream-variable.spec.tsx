/**
 * Integration tests for StreamVariable via useVariable hook.
 * Tests user-observable behavior by rendering components and asserting on the DOM.
 */
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Suspense, useContext } from 'react';
import { useRecoilValue } from 'recoil';

import { setSessionToken } from '@/auth/use-session-token';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import { _internal, getOrRegisterStreamVariable } from '@/shared/interactivity/stream-variable';
import { denormalize } from '@/shared/utils/normalization';
import type { StreamVariable } from '@/types/core';

import { useVariable } from '../../js/shared';
import { WebSocketCtx, useRequestExtras, useTaskContext } from '../../js/shared/context';
import { server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

const SESSION_TOKEN = 'TEST_TOKEN';

mockLocalStorage();

/**
 * Create an SSE handler using MSW.
 * Returns SSE-formatted stream with the given events.
 */
function createSSEHandler(uid: string, events: Array<{ type: string; data: unknown }>, delayMs = 10) {
    return http.post(`/api/core/stream/${uid}`, () => {
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                for (const event of events) {
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
 * Component that displays stream data using useRecoilValue directly
 */
function StreamDisplayDirect({ variable }: { variable: StreamVariable }): JSX.Element {
    const { client: wsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const extras = useRequestExtras();
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
        setSessionToken(SESSION_TOKEN);
        clearRegistries_TEST();
        _internal.activeConnections.clear();
    });

    afterEach(() => {
        setSessionToken(null);
        server.resetHandlers();
        for (const controller of _internal.activeConnections.values()) {
            controller.abort();
        }
        _internal.activeConnections.clear();
    });

    afterAll(() => server.close());

    it('suspends and shows loading until first snapshot arrives (useRecoilValue)', async () => {
        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-stream-direct',
            variables: [],
            key_accessor: null,
            nested: [],
        };

        server.use(createSSEHandler('test-stream-direct', [{ type: 'snapshot', data: { message: 'hello' } }]));

        wrappedRender(<StreamWithSuspenseDirect variable={streamVar} />);

        // Initially shows loading (suspension)
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        expect(screen.queryByTestId('stream-data')).not.toBeInTheDocument();

        // After snapshot arrives, shows data
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('stream-data')).toHaveTextContent('{"message":"hello"}');
    });

    it('suspends and shows loading until first snapshot arrives (useVariable)', async () => {
        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'test-stream',
            variables: [],
            key_accessor: null,
            nested: [],
        };

        server.use(createSSEHandler('test-stream', [{ type: 'snapshot', data: { message: 'hello' } }]));

        wrappedRender(<StreamWithSuspense variable={streamVar} />);

        // Initially shows loading (suspension)
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        expect(screen.queryByTestId('stream-data')).not.toBeInTheDocument();

        // After snapshot arrives, shows data
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toBeInTheDocument();
        }, { timeout: 3000 });

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
                const body = await request.json() as { values: { data: unknown[]; lookup: Record<string, unknown> } };
                const denormalizedValues = denormalize(body.values.data, body.values.lookup) as unknown[];
                const depValue = denormalizedValues[0];
                
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        const data = `data: ${JSON.stringify({ 
                            type: 'snapshot', 
                            data: { dep: depValue, message: `data for ${depValue}` }
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
            const [depValue, setDepValue] = useVariable(dependencyVar);
            const [streamData] = useVariable(streamVar);
            
            return (
                <div>
                    <div data-testid="stream-data">{JSON.stringify(streamData)}</div>
                    <button data-testid="change-dep" onClick={() => setDepValue('changed')}>
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
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Change the dependency - this should trigger re-suspension
        screen.getByTestId('change-dep').click();

        // Should show loading again while fetching new data
        await waitFor(() => {
            expect(screen.getByTestId('loading')).toBeInTheDocument();
        }, { timeout: 1000 });

        // Wait for new data to arrive
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toBeInTheDocument();
            expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"changed"');
        }, { timeout: 3000 });
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
                const body = await request.json() as { values: { data: unknown[]; lookup: Record<string, unknown> } };
                const denormalizedValues = denormalize(body.values.data, body.values.lookup) as unknown[];
                const depValue = denormalizedValues[0];

                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        // Longer delay to give time to verify stale value is shown
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        const data = `data: ${JSON.stringify({
                            type: 'snapshot',
                            data: { dep: depValue, message: `data for ${depValue}` }
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
            const [depValue, setDepValue] = useVariable(dependencyVar);
            const [streamData] = useVariable(streamVar, { suspend: false });

            return (
                <div>
                    <div data-testid="stream-data">{JSON.stringify(streamData)}</div>
                    <button data-testid="change-dep" onClick={() => setDepValue('changed')}>
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
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Change the dependency
        screen.getByTestId('change-dep').click();

        // With suspend=false, should NOT show loading - should keep showing stale value
        // Wait a tick to let the state update propagate
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Stale value should still be visible (not loading)
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"initial"');

        // Eventually new data arrives and updates
        await waitFor(() => {
            expect(screen.getByTestId('stream-data')).toHaveTextContent('"dep":"changed"');
        }, { timeout: 3000 });

        // Still no loading shown
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
});
