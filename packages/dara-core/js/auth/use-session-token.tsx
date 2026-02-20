import * as React from 'react';

const SESSION_ID_STORAGE_SUFFIX = '-session-id';
const SESSION_STATE_TOKEN_KEY = 'dara-jwt-token';
const SESSION_STATE_CHANNEL_NAME = 'dara-session-state';
const SESSION_REFRESH_LOCK_NAME = 'dara-auth-refresh-lock';

type SessionStateMessage =
    | {
          type: 'session_token';
          value: string | null;
      }
    | {
          type: 'session_id';
          value: string | null;
      };

export type SessionEvent = { type: 'session_refreshed'; token: string } | { type: 'session_logged_out' };

const tokenSubscribers = new Set<(val: string | null) => void>();
const sessionIdSubscribers = new Set<(val: string | null) => void>();
const sessionEventSubscribers = new Set<(event: SessionEvent) => void>();

let sessionToken: string | null = null;
let sessionIdentifier: string | null = null;
let activeRefreshPromise: Promise<string | null> | null = null;

const channel = new BroadcastChannel(SESSION_STATE_CHANNEL_NAME);

function isSessionStateMessage(value: unknown): value is SessionStateMessage {
    if (value === null || typeof value !== 'object' || !('type' in value) || !('value' in value)) {
        return false;
    }

    return (
        (value.type === 'session_token' || value.type === 'session_id') &&
        (typeof value.value === 'string' || value.value === null)
    );
}

function notifyTokenSubscribers(value: string | null): void {
    tokenSubscribers.forEach((cb) => cb(value));
}

function notifySessionIdSubscribers(value: string | null): void {
    sessionIdSubscribers.forEach((cb) => cb(value));
}

function notifySessionEventSubscribers(event: SessionEvent): void {
    sessionEventSubscribers.forEach((cb) => cb(event));
}

function getSessionEvent(previousToken: string | null, nextToken: string | null): SessionEvent | null {
    if (previousToken === nextToken) {
        return null;
    }

    if (nextToken === null) {
        return { type: 'session_logged_out' };
    }

    return { type: 'session_refreshed', token: nextToken };
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

function setSessionTokenInternal(value: string | null, broadcast: boolean): void {
    const previousToken = sessionToken;
    const currentSessionId = sessionIdentifier;

    if (previousToken !== value) {
        sessionToken = value;
        notifyTokenSubscribers(value);
        const sessionEvent = getSessionEvent(previousToken, value);
        if (sessionEvent) {
            notifySessionEventSubscribers(sessionEvent);
        }

        if (broadcast) {
            channel.postMessage({ type: 'session_token', value } satisfies SessionStateMessage);
        }
    }

    if (value === null) {
        setSessionIdentifierInternal(null, broadcast);
    } else if (currentSessionId === null || currentSessionId === previousToken) {
        setSessionIdentifierInternal(value, broadcast);
    }
}

channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isSessionStateMessage(event.data)) {
        return;
    }

    if (event.data.type === 'session_token') {
        setSessionTokenInternal(event.data.value, false);
        return;
    }

    setSessionIdentifierInternal(event.data.value, false);
});

/**
 * Retrieve the key under which the current Dara session ID is stored.
 */
export function getSessionIdKey(): string {
    return `${SESSION_STATE_TOKEN_KEY}${SESSION_ID_STORAGE_SUFFIX}`;
}

/**
 * Subscribe to token changes
 *
 * @param cb callback to call when the token changes
 */
export function onTokenChange(cb: (val: string | null) => void): () => void {
    tokenSubscribers.add(cb);
    return () => {
        tokenSubscribers.delete(cb);
    };
}

/**
 * Subscribe to cross-tab session events.
 *
 * @param cb callback invoked when session state changes
 */
export function onSessionEvent(cb: (event: SessionEvent) => void): () => void {
    sessionEventSubscribers.add(cb);
    return () => {
        sessionEventSubscribers.delete(cb);
    };
}

/**
 * Retrieve the current session token
 */
export function getSessionToken(): string | null {
    return sessionToken;
}

/**
 * Set the session token
 */
export function setSessionToken(token: string | null): void {
    setSessionTokenInternal(token, true);
}

/**
 * Notify all tabs that the session token has been refreshed.
 *
 * @param token refreshed session token
 */
export function notifySessionRefreshed(token: string): void {
    setSessionToken(token);
}

/**
 * Notify all tabs that the session has been logged out/invalidated.
 */
export function notifySessionLoggedOut(): void {
    setSessionToken(null);
}

/**
 * Helper hook that synchronizes with the current session token from store
 */
export function useSessionToken(): string | null {
    return React.useSyncExternalStore(onTokenChange, getSessionToken);
}

/**
 * Read the latest known in-memory session token.
 */
export function getLatestSessionToken(): string | null {
    return getSessionToken();
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
export async function withSessionRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
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
export function runSessionRefresh(refreshFn: () => Promise<string | null>): Promise<string | null> {
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
