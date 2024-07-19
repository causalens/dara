import * as React from 'react';
import globalStore from '@/shared/global-state-store';

function tokenSubscribe(cb: () => void): () => void {
    return globalStore.subscribe('sessionToken', cb);
}

export function getSessionToken(): string {
    return globalStore.getValueSync('sessionToken');
}

export function setSessionToken(token: string): void {
    globalStore.setValue('sessionToken', token);
}

/**
 * Helper hook that pulls the session token from context and returns it's value
 */
export function useSessionToken(): string {
    return React.useSyncExternalStore(tokenSubscribe, getSessionToken);
}

