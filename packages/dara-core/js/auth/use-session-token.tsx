import * as React from 'react';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

function tokenSubscribe(cb: () => void): () => void {
    return globalStore.subscribe(getTokenKey(), cb);
}

export function getSessionToken(): string {
    return globalStore.getValueSync(getTokenKey());
}

export function setSessionToken(token: string): void {
    globalStore.setValue(getTokenKey(), token);
}

/**
 * Helper hook that pulls the session token from store and returns it's value
 */
export function useSessionToken(): string {
    return React.useSyncExternalStore(tokenSubscribe, getSessionToken);
}
