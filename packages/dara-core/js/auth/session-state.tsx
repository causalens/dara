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

const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SESSION_STATE_CHANNEL_NAME) : null;

const inTabLockTails = new Map<string, Promise<void>>();

/**
 * Notify local subscribers about an updated session identifier.
 *
 * @param value current session identifier
 */
function notifySessionIdSubscribers(value: string | null): void {
    sessionIdSubscribers.forEach((cb) => cb(value));
}

/**
 * Parse a cross-tab session state message.
 *
 * @param value unknown message payload
 */
function parseSessionStateMessage(value: unknown): SessionStateMessage | null {
    const parsed = SessionStateMessageSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }
    return parsed.data;
}

/**
 * Update the in-memory session identifier and optionally broadcast it to other tabs.
 *
 * @param value current session identifier
 * @param broadcast whether to emit cross-tab events
 */
function setSessionIdentifierInternal(value: string | null, broadcast: boolean): void {
    if (sessionIdentifier === value) {
        return;
    }

    sessionIdentifier = value;
    notifySessionIdSubscribers(value);

    if (broadcast && channel) {
        channel.postMessage({ type: 'session_id', value } satisfies SessionStateMessage);
    }
}

if (channel) {
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
}

/**
 * Run a callback under an in-tab lock used when Web Locks are unavailable.
 *
 * @param callback callback to execute once this tab acquires the lock
 */
function withInTabRefreshLock<T>(callback: () => Promise<T> | T): Promise<T> {
    const previousTail = inTabLockTails.get(SESSION_REFRESH_LOCK_NAME) ?? Promise.resolve();

    let releaseTail: () => void = () => undefined;
    const nextTail = new Promise<void>((resolve) => {
        releaseTail = resolve;
    });

    inTabLockTails.set(
        SESSION_REFRESH_LOCK_NAME,
        previousTail.then(() => nextTail)
    );

    return previousTail.then(() => {
        try {
            return Promise.resolve(callback());
        } finally {
            releaseTail();
            if (inTabLockTails.get(SESSION_REFRESH_LOCK_NAME) === nextTail) {
                inTabLockTails.delete(SESSION_REFRESH_LOCK_NAME);
            }
        }
    });
}

/**
 * Acquire the refresh lock using Web Locks when available, otherwise use the in-tab fallback.
 *
 * @param callback callback to execute under the lock
 */
function requestRefreshLock<T>(callback: () => Promise<T> | T): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks
            .request(SESSION_REFRESH_LOCK_NAME, () => callback())
            .then((result) => Promise.resolve(result));
    }

    return withInTabRefreshLock(callback);
}

/**
 * Notify all tabs that the session has been logged out/invalidated.
 */
export function notifySessionLoggedOut(): void {
    setSessionIdentifierInternal(null, true);
    if (channel) {
        channel.postMessage({ type: 'session_logged_out' } satisfies SessionStateMessage);
    }
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
 *
 * @param sessionId session identifier
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
 *
 * @param callback callback to execute under lock
 */
export async function withSessionRefreshLock<T>(callback: () => Promise<T> | T): Promise<T> {
    return requestRefreshLock(callback);
}

/**
 * Wait for any currently active refresh lock to complete.
 */
export async function waitForOngoingSessionRefresh(): Promise<void> {
    await requestRefreshLock(() => undefined);
}

/**
 * Run the given refresh function once per tab and share the in-flight result.
 *
 * Cross-tab mutual exclusion is guaranteed via Web Locks when available, with
 * an in-tab lock fallback otherwise.
 *
 * @param refreshFn refresh callback
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
