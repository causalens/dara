import * as React from 'react';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

const SESSION_ID_STORAGE_SUFFIX = '-session-id';

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
    return globalStore.subscribe(getTokenKey(), cb);
}

/**
 * Retrieve the current session token
 */
export function getSessionToken(): string | null {
    return globalStore.getValueSync(getTokenKey());
}

/**
 * Set the session token
 */
export function setSessionToken(token: string | null): void {
    const tokenKey = getTokenKey();
    const previousToken = globalStore.getValueSync(tokenKey);
    const currentSessionId = globalStore.getValueSync(getSessionIdKey());

    globalStore.setValue(tokenKey, token);

    if (token === null) {
        // Keep session-id state aligned with auth token lifecycle.
        globalStore.setValue(getSessionIdKey(), null);
    } else if (currentSessionId === null || currentSessionId === previousToken) {
        // Fallback for flows where we have a token before we have resolved session ID from /verify-session.
        // This preserves pre-migration session scoping behavior while allowing /verify-session
        // to replace the token-derived identifier with a stable session ID later.
        globalStore.setValue(getSessionIdKey(), token);
    }
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
    return globalStore.subscribe(getSessionIdKey(), cb);
}

/**
 * Retrieve the current Dara session ID.
 */
export function getSessionIdentifier(): string | null {
    return globalStore.getValueSync(getSessionIdKey());
}

/**
 * Set the current Dara session ID.
 */
export function setSessionIdentifier(sessionId: string | null): void {
    globalStore.setValue(getSessionIdKey(), sessionId);
}

/**
 * Helper hook that synchronizes with the current Dara session ID from store.
 */
export function useSessionIdentifier(): string | null {
    return React.useSyncExternalStore(onSessionIdChange, getSessionIdentifier);
}
