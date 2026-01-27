/**
 * StreamVariable implementation.
 *
 * StreamVariable receives events via Server-Sent Events (SSE) and accumulates
 * them on the client side. The accumulated state is exposed via Recoil atoms.
 *
 * Architecture:
 * 1. Params selector - resolves dependencies, returns serialized atom key
 * 2. Value selector - reads params, gets atom via getOrCreateStreamVariableAtom, reads value
 * 3. Atom with effects - SSE lifecycle managed by atom effects
 *
 * Event types (keyed mode - requires key_accessor):
 * - replace: Atomically replace all items (recommended for initial state)
 * - add: Add/update items by key
 * - remove: Remove items by key
 * - clear: Clear all items
 *
 * Event types (custom state mode):
 * - json_snapshot: Replace entire state with arbitrary JSON
 * - json_patch: Apply JSON Patch operations (RFC 6902)
 *
 * Control events:
 * - reconnect: Signal to reconnect
 * - error: Signal stream error
 */
import { type EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { type Operation, applyPatch } from 'fast-json-patch';
import getPath from 'lodash/get';
import { nanoid } from 'nanoid';
import { type AtomEffect, DefaultValue, type RecoilState, type RecoilValue, atomFamily, selectorFamily } from 'recoil';

import { HTTP_METHOD } from '@darajs/ui-utils';

import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras, RequestExtrasSerializable, request } from '@/api/http';
import { type GlobalTaskContext, type StreamVariable, isVariable } from '@/types';

import { getUniqueIdentifier } from '../utils/hashing';
import { normalizeRequest } from '../utils/normalization';
// eslint-disable-next-line import/no-cycle
import { resolveNested, resolveValue, resolveVariable } from './internal';
import { selectorFamilyMembersRegistry, selectorFamilyRegistry, streamAtomRegistry } from './store';
import { buildTriggerList, registerChildTriggers } from './triggers';

/**
 * Stream event types as sent from the server
 */
export type StreamEventType =
    // Keyed mode events
    | 'add'
    | 'remove'
    | 'clear'
    | 'replace'
    // Custom state mode events
    | 'json_snapshot'
    | 'json_patch'
    // Control events
    | 'reconnect'
    | 'error';

/**
 * Stream event as received from SSE
 */
export interface StreamEvent {
    type: StreamEventType;
    data: unknown;
}

/**
 * State of a stream connection.
 * 'loading' is the initial state before first data arrives.
 */
export type StreamStatus = 'loading' | 'connected' | 'reconnecting' | 'error' | 'closed';

/**
 * Internal state for a stream variable atom
 */
export interface StreamState {
    /**
     * The accumulated data from stream events.
     * For keyed mode (key_accessor set): Record<key, item>
     * For custom mode: any shape set by snapshot/patch
     */
    data: unknown;
    /** Current connection status */
    status: StreamStatus;
    /** Error message if status is 'error' */
    error?: string;
}

/**
 * Extract a key from an item using the key_accessor path.
 *
 * @param item Item to extract key from
 * @param keyAccessor Dot-separated path to the key property (e.g., 'id' or 'data.id')
 * @returns The key value, or undefined if not found
 */
export function extractKey(item: unknown, keyAccessor: string): string | number | undefined {
    if (item === null || item === undefined) {
        return undefined;
    }
    const key = getPath(item, keyAccessor);
    if (typeof key === 'string' || typeof key === 'number') {
        return key;
    }
    return undefined;
}

/**
 * Apply a stream event to the current state.
 *
 * @param currentState Current accumulated state
 * @param event Stream event to apply
 * @param keyAccessor Key accessor path for keyed mode (null for custom mode)
 * @returns New state after applying the event
 */
export function applyStreamEvent(
    currentState: StreamState,
    event: StreamEvent,
    keyAccessor: string | null
): StreamState {
    switch (event.type) {
        // === Keyed mode events ===

        case 'add': {
            if (keyAccessor === null) {
                // eslint-disable-next-line no-console
                console.warn(
                    'StreamVariable: add() event received but no key_accessor is set. Use json_snapshot/json_patch instead.'
                );
                return currentState;
            }

            const items = Array.isArray(event.data) ? event.data : [event.data];
            let newData = (currentState.data ?? {}) as Record<string | number, unknown>;

            for (const item of items) {
                const key = extractKey(item, keyAccessor);
                if (key === undefined) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `StreamVariable: Could not extract key using accessor '${keyAccessor}' from item:`,
                        item
                    );
                    continue;
                }
                newData = { ...newData, [key]: item };
            }

            return {
                ...currentState,
                data: newData,
                status: 'connected',
                error: undefined,
            };
        }

        case 'remove': {
            if (keyAccessor === null) {
                // eslint-disable-next-line no-console
                console.warn(
                    'StreamVariable: remove() event received but no key_accessor is set. Use json_snapshot/json_patch instead.'
                );
                return currentState;
            }

            const keys = Array.isArray(event.data) ? event.data : [event.data];
            const currentData = (currentState.data ?? {}) as Record<string | number, unknown>;
            const newData = { ...currentData };

            for (const key of keys) {
                if (typeof key === 'string' || typeof key === 'number') {
                    delete newData[key];
                }
            }

            return {
                ...currentState,
                data: newData,
                status: 'connected',
                error: undefined,
            };
        }

        case 'clear': {
            return {
                ...currentState,
                data: {},
                status: 'connected',
                error: undefined,
            };
        }

        case 'replace': {
            if (keyAccessor === null) {
                // eslint-disable-next-line no-console
                console.warn(
                    'StreamVariable: replace() event received but no key_accessor is set. Use json_snapshot instead.'
                );
                return currentState;
            }

            const items = Array.isArray(event.data) ? event.data : [];
            const newData: Record<string | number, unknown> = {};

            for (const item of items) {
                const key = extractKey(item, keyAccessor);
                if (key === undefined) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `StreamVariable: Could not extract key using accessor '${keyAccessor}' from item:`,
                        item
                    );
                    continue;
                }
                newData[key] = item;
            }

            return {
                ...currentState,
                data: newData,
                status: 'connected',
                error: undefined,
            };
        }

        // === Custom state mode events ===

        case 'json_snapshot':
            return {
                ...currentState,
                data: event.data,
                status: 'connected',
                error: undefined,
            };

        case 'json_patch': {
            if (currentState.data === undefined || currentState.data === null) {
                // eslint-disable-next-line no-console
                console.warn(
                    'StreamVariable: json_patch event received but no state exists. Send a json_snapshot first.'
                );
                return currentState;
            }

            try {
                const operations = event.data as Operation[];
                const { newDocument } = applyPatch(currentState.data, operations, true, false);
                return {
                    ...currentState,
                    data: newDocument,
                    status: 'connected',
                    error: undefined,
                };
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('StreamVariable: Failed to apply json_patch:', e);
                return {
                    ...currentState,
                    status: 'error',
                    error: `Patch failed: ${String(e)}`,
                };
            }
        }

        // === Control events ===

        case 'reconnect':
            return {
                ...currentState,
                status: 'reconnecting',
            };

        case 'error':
            return {
                ...currentState,
                status: 'error',
                error: typeof event.data === 'string' ? event.data : 'Unknown error',
            };

        default:
            // eslint-disable-next-line no-console
            console.warn(`StreamVariable: Unknown event type: ${event.type as string}`);
            return currentState;
    }
}

/**
 * Get the exposed value from stream state.
 * For keyed mode, converts the internal Record to an array (values in insertion order).
 *
 * @param state Stream state
 * @param keyAccessor Key accessor (null for custom mode)
 * @returns The value to expose to components
 */
export function getStreamValue(state: StreamState, keyAccessor: string | null): unknown {
    if (keyAccessor !== null && state.data !== null && typeof state.data === 'object' && !Array.isArray(state.data)) {
        // Keyed mode: expose as array
        return Object.values(state.data as Record<string, unknown>);
    }
    return state.data;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/**
 * Calculate exponential backoff delay.
 */
export function getBackoffDelay(retryCount: number): number {
    return Math.min(BASE_DELAY_MS * 2 ** retryCount, MAX_DELAY_MS);
}

/**
 * Parameters for stream atom, serialized as JSON string for atom key.
 * Contains everything needed to start the SSE connection.
 */
export interface StreamAtomParams {
    /** StreamVariable uid */
    uid: string;
    /** Resolved dependency values to send to server */
    resolvedValues: unknown[];
    /** Original variables array (for normalization) */
    variables: unknown[];
    /** Key accessor for keyed mode */
    keyAccessor: string | null;
    /** Request extras (headers, etc.) */
    extras: RequestExtras;
}

export function serializeAtomParams(params: StreamAtomParams): string {
    return JSON.stringify(params);
}

export function deserializeAtomParams(key: string): StreamAtomParams {
    return JSON.parse(key) as StreamAtomParams;
}

/**
 * Map to store active AbortControllers for SSE connections.
 * Key: serialized atom params
 */
const activeConnections = new Map<string, AbortController>();


/** Stream state after first data arrives */
const INITIAL_CONNECTED_STATE: StreamState = {
    data: undefined,
    status: 'connected',
};

/**
 * Callback interface for stream connection events.
 */
interface StreamConnectionCallbacks {
    /** Called when first data arrives - resolves the initial Promise */
    onFirstData: (state: StreamState) => void;
    /** Called for subsequent data updates */
    onUpdate: (state: StreamState) => void;
    /** Called on error after max retries */
    onError: (error: string) => void;
}

/**
 * Start an SSE connection for a stream variable.
 *
 * @param params Stream atom params (contains uid, resolved values, etc.)
 * @param callbacks Callbacks for stream events
 * @returns Cleanup function to abort the connection
 */
function startStreamConnection(params: StreamAtomParams, callbacks: StreamConnectionCallbacks): () => void {
    const connectionKey = serializeAtomParams(params);

    // Abort any existing connection for this key
    const existingController = activeConnections.get(connectionKey);
    if (existingController) {
        existingController.abort();
    }

    const controller = new AbortController();
    activeConnections.set(connectionKey, controller);

    let retryCount = 0;
    let isFirstMessage = true;
    let currentState: StreamState = INITIAL_CONNECTED_STATE;

    // Normalize values for the request
    const normalizedValues = normalizeRequest(params.resolvedValues, params.variables as any[]);

    fetchEventSource(`/api/core/stream/${params.uid}`, {
        method: HTTP_METHOD.POST,
        body: JSON.stringify({ values: normalizedValues }),
        signal: controller.signal,

        // eslint-disable-next-line @typescript-eslint/require-await
        onopen: async (response) => {
            if (response.ok) {
                retryCount = 0; // Reset retry count on successful connection
                return;
            }

            const error = new Error(`Stream request failed: ${response.status} ${response.statusText}`);
            throw error;
        },

        onmessage: (msg: EventSourceMessage) => {
            let event: StreamEvent;
            try {
                event = JSON.parse(msg.data) as StreamEvent;
            } catch (parseError) {
                // eslint-disable-next-line no-console
                console.error('Failed to parse SSE event:', parseError, msg.data);
                return;
            }

            // Handle reconnect event - throw to trigger retry logic
            if (event.type === 'reconnect') {
                // eslint-disable-next-line no-console
                console.info('StreamVariable: Server requested reconnect, reconnecting...');
                throw new Error('Server requested reconnect');
            }

            // Apply event to current state (accumulate)
            currentState = applyStreamEvent(currentState, event, params.keyAccessor);

            if (isFirstMessage) {
                isFirstMessage = false;
                callbacks.onFirstData(currentState);
            } else {
                callbacks.onUpdate(currentState);
            }
        },

        onerror: (err) => {
            if (controller.signal.aborted) {
                // Connection was intentionally aborted, don't retry
                return;
            }

            retryCount++;
            if (retryCount > MAX_RETRIES) {
                callbacks.onError(err instanceof Error ? err.message : String(err));
                // Return undefined to stop retrying
                return;
            }

            // Return delay to retry
            const delay = getBackoffDelay(retryCount - 1);
            // eslint-disable-next-line no-console
            console.warn(`Stream connection failed, retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})...`);
            return delay;
        },

        onclose: () => {
            // Stream closed normally - could be server shutting down
            // The library will attempt to reconnect
        },

        // Use our request wrapper for auth headers
        // @ts-expect-error - fetch signature differs slightly but works
        fetch: request,

        // Pass through extras (headers, etc.)
        ...params.extras,
        // @ts-expect-error - Headers type doesn't match exactly
        headers: params.extras.headers,
    });

    // Return cleanup function
    return () => {
        controller.abort();
        activeConnections.delete(connectionKey);
    };
}

/**
 * Atom effect that manages SSE connection lifecycle.
 * Uses recoil-sync pattern: setSelf(promise) to enable native Recoil Suspense.
 * Starts connection on mount, cleans up on unmount.
 */
function streamConnectionEffect(atomKey: string): AtomEffect<StreamState> {
    return ({ setSelf }) => {
        // Deserialize params from atom key
        const params = deserializeAtomParams(atomKey);

        // Create a Promise that resolves when first data arrives.
        // Following recoil-sync pattern: setSelf(promise) enables native Suspense.
        let resolveInitialData: ((state: StreamState) => void) | null = null;
        let rejectInitialData: ((error: Error) => void) | null = null;

        const initialDataPromise = new Promise<StreamState>((resolve, reject) => {
            resolveInitialData = resolve;
            rejectInitialData = reject;
        });

        // Set atom to the Promise - Recoil will handle Suspense natively
        setSelf(initialDataPromise);

        // Start SSE connection with callbacks
        const cleanup = startStreamConnection(params, {
            onFirstData: (state) => {
                // Resolve the initial Promise - this wakes up suspended components
                if (resolveInitialData) {
                    resolveInitialData(state);
                    resolveInitialData = null;
                    rejectInitialData = null;
                }
                // Also explicitly set the atom value to ensure Recoil sees the update
                setSelf(state);
            },
            onUpdate: (state) => {
                // Subsequent updates use setSelf directly
                setSelf(state);
            },
            onError: (error) => {
                if (rejectInitialData) {
                    // If we haven't received first data yet, reject the Promise
                    rejectInitialData(new Error(error));
                    resolveInitialData = null;
                    rejectInitialData = null;
                } else {
                    // Otherwise update the state with error
                    setSelf({
                        data: undefined,
                        status: 'error',
                        error,
                    });
                }
            },
        });

        // Cleanup on unmount
        return cleanup;
    };
}

/**
 * Stream atom family - holds the accumulated state for each unique params combination.
 * Key is JSON-serialized StreamAtomParams containing everything needed for SSE.
 * No default value - atom starts in "pending" state. The effect sets it to a Promise
 * that resolves when first data arrives (recoil-sync pattern for native Suspense).
 */
const streamAtomFamily = atomFamily<StreamState, string>({
    key: 'StreamVariable/state',
    effects: (atomKey) => [streamConnectionEffect(atomKey)],
});

/**
 * Get or create a stream variable atom for the given params.
 * The atom has effects that manage the SSE connection lifecycle.
 * Registers the atom in streamAtomRegistry for tracking.
 *
 * @param atomKey Serialized StreamAtomParams
 * @returns Recoil atom for stream state
 */
export function getOrCreateStreamVariableAtom(atomKey: string): RecoilState<StreamState> {
    // Just use atomFamily directly - it already caches atoms by key
    const atom = streamAtomFamily(atomKey);
    // Still register for tracking purposes
    if (!streamAtomRegistry.has(atomKey)) {
        streamAtomRegistry.set(atomKey, atom);
    }
    return atom;
}

/**
 * Registry key for stream variable selectors.
 */
function getStreamRegistryKey(variable: StreamVariable, suffix: string): string {
    return `StreamVariable:${getUniqueIdentifier(variable, { useNested: false })}:${suffix}`;
}

/**
 * Get or register the params selector for a StreamVariable.
 * Resolves dependencies and returns serialized atom params.
 *
 * @param variable StreamVariable definition
 * @param client WebSocket client (for resolving dependencies)
 * @param taskContext Global task context
 * @param extras Request extras
 * @returns Recoil selector that resolves to serialized atom params (string)
 */
function getOrRegisterStreamVariableParams(
    variable: StreamVariable,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilValue<string> {
    const key = getStreamRegistryKey(variable, 'params-selector');

    if (!selectorFamilyRegistry.has(key)) {
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                key: nanoid(),
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    async ({ get }) => {
                        // Resolve all dependency variables to Recoil atoms/ResolvedDerivedVariable/etc
                        const resolvedVariables = await Promise.all(
                            variable.variables.map(async (v) => {
                                if (!isVariable(v)) {
                                    return v;
                                }
                                return resolveVariable(v, client, taskContext, extrasSerializable.extras);
                            })
                        );

                        // Build trigger list and register child triggers as dependencies
                        // This ensures we re-run when any nested DerivedVariable is triggered
                        const triggerList = buildTriggerList(variable.variables);
                        registerChildTriggers(triggerList, get);

                        // Get primitive values from resolved variables
                        const resolvedValues = resolvedVariables.map((v) => resolveValue(v, get));

                        // Create and serialize atom params
                        const params: StreamAtomParams = {
                            uid: variable.uid,
                            resolvedValues,
                            variables: variable.variables,
                            keyAccessor: variable.key_accessor,
                            extras: extrasSerializable.extras,
                        };

                        return serializeAtomParams(params);
                    },
            })
        );
    }

    const family = selectorFamilyRegistry.get(key)!;
    const serializableExtras = new RequestExtrasSerializable(extras);
    const selectorInstance = family(serializableExtras);

    // Register selector instance
    if (!selectorFamilyMembersRegistry.has(family)) {
        selectorFamilyMembersRegistry.set(family, new Map());
    }
    selectorFamilyMembersRegistry.get(family)!.set(serializableExtras.toJSON(), selectorInstance);

    return selectorInstance;
}

/**
 * Get or register the value selector for a StreamVariable.
 * Reads params from params selector, gets atom, returns raw stream value.
 * Does NOT handle nested resolution - that's done by the outer selector.
 *
 * Layer 2 of 3.
 */
function getOrRegisterStreamVariableValue(
    variable: StreamVariable,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilValue<unknown> {
    // NO nested in key - share across different nested paths
    const key = getStreamRegistryKey(variable, 'value-selector');

    if (!selectorFamilyRegistry.has(key)) {
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                key: nanoid(),
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    ({ get }) => {
                        // Get params from params selector
                        const paramsSelector = getOrRegisterStreamVariableParams(
                            variable,
                            client,
                            taskContext,
                            extrasSerializable.extras
                        );
                        const atomKey = get(paramsSelector);

                        // Get atom from atomFamily
                        const atom = streamAtomFamily(atomKey);
                        // Track in registry
                        if (!streamAtomRegistry.has(atomKey)) {
                            streamAtomRegistry.set(atomKey, atom);
                        }
                        const streamState = get(atom);

                        // Get the exposed value (array for keyed mode)
                        return getStreamValue(streamState, variable.key_accessor);
                    },
            })
        );
    }

    const family = selectorFamilyRegistry.get(key)!;
    const serializableExtras = new RequestExtrasSerializable(extras);
    const selectorInstance = family(serializableExtras);

    // Register selector instance
    if (!selectorFamilyMembersRegistry.has(family)) {
        selectorFamilyMembersRegistry.set(family, new Map());
    }
    selectorFamilyMembersRegistry.get(family)!.set(serializableExtras.toJSON(), selectorInstance);

    return selectorInstance;
}

/**
 * Get or register selector for a StreamVariable.
 * Handles nested resolution if 'nested' is set.
 *
 * Layer 3 of 3.
 *
 * @param variable StreamVariable definition
 * @param client WebSocket client (for resolving dependencies)
 * @param taskContext Global task context
 * @param extras Request extras
 * @returns Recoil selector that resolves to the stream value
 */
export function getOrRegisterStreamVariable(
    variable: StreamVariable,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilValue<unknown> {
    // Key USES nested - different selector per nested path
    const key = `StreamVariable:${getUniqueIdentifier(variable, { useNested: true })}:nested-selector`;

    if (!selectorFamilyRegistry.has(key)) {
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                key: nanoid(),
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    ({ get }) => {
                        // Get value from layer 2
                        const valueSelector = getOrRegisterStreamVariableValue(
                            variable,
                            client,
                            taskContext,
                            extrasSerializable.extras
                        );
                        const value = get(valueSelector);

                        // Unwrap nested if needed
                        return 'nested' in variable ?
                            resolveNested(value as Record<string, unknown>, variable.nested)
                        :   value;
                    },
            })
        );
    }

    const family = selectorFamilyRegistry.get(key)!;
    const serializableExtras = new RequestExtrasSerializable(extras);
    const selectorInstance = family(serializableExtras);

    // Register selector instance
    if (!selectorFamilyMembersRegistry.has(family)) {
        selectorFamilyMembersRegistry.set(family, new Map());
    }
    selectorFamilyMembersRegistry.get(family)!.set(serializableExtras.toJSON(), selectorInstance);

    return selectorInstance;
}

/**
 * Internal exports for testing
 */
export const _internal = {
    streamAtomFamily,
    activeConnections,
    getBackoffDelay,
    serializeAtomParams,
    deserializeAtomParams,
    startStreamConnection,
};
