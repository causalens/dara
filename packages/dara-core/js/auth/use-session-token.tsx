import * as React from 'react';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

/**
 * Subscribe to token changes
 *
 * @param cb callback to call when the token changes
 */
export function onTokenChange(cb: (val: string) => void): () => void {
    return globalStore.subscribe(getTokenKey(), cb);
}

/**
 * Retrieve the current session token
 */
export function getSessionToken(): string {
    return globalStore.getValueSync(getTokenKey());
}

/**
 * Set the session token
 */
export function setSessionToken(token: string): void {
    globalStore.setValue(getTokenKey(), token);
}

/**
 * Helper hook that synchronizes with the current session token from store
 */
export function useSessionToken(): string {
    return React.useSyncExternalStore(onTokenChange, getSessionToken);
}
