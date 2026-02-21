import * as React from 'react';
import { z } from 'zod/v4';

const SESSION_STATE_CHANNEL_NAME = 'dara-session-state';
const SESSION_REFRESH_LOCK_NAME = 'dara-auth-refresh-lock';

const SessionStateMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('session_id'),
        value: z.string().nullable(),
    }),
    z.object({
        type: z.literal('session_logged_out'),
    }),
]);

type SessionStateMessage = z.infer<typeof SessionStateMessageSchema>;

const sessionIdSubscribers = new Set<(val: string | null) => void>();
let sessionIdentifier: string | null = null;
let activeRefreshPromise: Promise<void> | null = null;

const channel = new BroadcastChannel(SESSION_STATE_CHANNEL_NAME);

function notifySessionIdSubscribers(value: string | null): void {
    sessionIdSubscribers.forEach((cb) => cb(value));
}

function parseSessionStateMessage(value: unknown): SessionStateMessage | null {
    const parsed = SessionStateMessageSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }
    return parsed.data;
}

function setSessionIdentifierInternal(value: string | null, broadcast: boolean): void {
    if (sessionIdentifier === value) {
        return;
    }

    sessionIdentifier = value;
    notifySessionIdSubscribers(value);

    if (broadcast) {
        channel.postMessage({ type: 'session_id', value } satisfies SessionStateMessage);
    }
}

channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = parseSessionStateMessage(event.data);
    if (!message) {
        return;
    }

    if (message.type === 'session_logged_out') {
        setSessionIdentifierInternal(null, false);
        return;
    }

    setSessionIdentifierInternal(message.value, false);
});

/**
 * Notify all tabs that the session has been logged out/invalidated.
 */
export function notifySessionLoggedOut(): void {
    setSessionIdentifierInternal(null, true);
    channel.postMessage({ type: 'session_logged_out' } satisfies SessionStateMessage);
}

/**
 * Subscribe to session ID changes.
 *
 * @param cb callback to call when the session ID changes
 */
export function onSessionIdChange(cb: (val: string | null) => void): () => void {
    sessionIdSubscribers.add(cb);
    return () => {
        sessionIdSubscribers.delete(cb);
    };
}

/**
 * Retrieve the current Dara session ID.
 */
export function getSessionIdentifier(): string | null {
    return sessionIdentifier;
}

/**
 * Set the current Dara session ID.
 */
export function setSessionIdentifier(sessionId: string | null): void {
    setSessionIdentifierInternal(sessionId, true);
}

/**
 * Helper hook that synchronizes with the current Dara session ID from store.
 */
export function useSessionIdentifier(): string | null {
    return React.useSyncExternalStore(onSessionIdChange, getSessionIdentifier);
}

/**
 * Run a callback under the cross-tab refresh lock.
 */
export async function withSessionRefreshLock<T>(callback: () => Promise<T> | T): Promise<T> {
    return navigator.locks.request(SESSION_REFRESH_LOCK_NAME, callback);
}

/**
 * Wait for any currently active refresh lock to complete.
 */
export async function waitForOngoingSessionRefresh(): Promise<void> {
    await navigator.locks.request(SESSION_REFRESH_LOCK_NAME, () => undefined);
}

/**
 * Run the given refresh function once per tab and share the in-flight result.
 *
 * Cross-tab mutual exclusion is guaranteed via Web Locks.
 */
export function runSessionRefresh(refreshFn: () => Promise<void>): Promise<void> {
    if (activeRefreshPromise) {
        return activeRefreshPromise;
    }

    const refreshPromise = withSessionRefreshLock(refreshFn).finally(() => {
        if (activeRefreshPromise === refreshPromise) {
            activeRefreshPromise = null;
        }
    });

    activeRefreshPromise = refreshPromise;
    return refreshPromise;
}
