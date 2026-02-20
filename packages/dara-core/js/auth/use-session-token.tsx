import * as React from 'react';

import { getTokenKey } from '@/shared/utils/embed';

const SESSION_ID_STORAGE_SUFFIX = '-session-id';
const SESSION_STATE_CHANNEL_NAME = 'dara-session-state';

type SessionStateMessage =
    | {
          type: 'session_token';
          value: string | null;
      }
    | {
          type: 'session_id';
          value: string | null;
      };

const tokenSubscribers = new Set<(val: string | null) => void>();
const sessionIdSubscribers = new Set<(val: string | null) => void>();

let sessionToken: string | null = null;
let sessionIdentifier: string | null = null;

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
    return `${getTokenKey()}${SESSION_ID_STORAGE_SUFFIX}`;
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
 * Helper hook that synchronizes with the current session token from store
 */
export function useSessionToken(): string | null {
    return React.useSyncExternalStore(onTokenChange, getSessionToken);
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
