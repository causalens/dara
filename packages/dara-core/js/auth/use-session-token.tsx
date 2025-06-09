import * as React from 'react';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

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
    globalStore.setValue(getTokenKey(), token);
}

/**
 * Helper hook that synchronizes with the current session token from store
 */
export function useSessionToken(): string | null {
    return React.useSyncExternalStore(onTokenChange, getSessionToken);
}
