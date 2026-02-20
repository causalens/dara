import { getSessionToken, setSessionToken } from './use-session-token';

export type SessionEvent = { type: 'session_refreshed'; token: string } | { type: 'session_logged_out' };

const SESSION_CHANNEL_NAME = 'dara-auth-session-events';
const SESSION_REFRESH_LOCK_NAME = 'dara-auth-refresh-lock';

const listeners = new Set<(event: SessionEvent) => void>();
const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
let activeRefreshPromise: Promise<string | null> | null = null;

function isSessionEvent(value: unknown): value is SessionEvent {
    if (value === null || typeof value !== 'object' || !('type' in value)) {
        return false;
    }

    if (value.type === 'session_logged_out') {
        return true;
    }

    return value.type === 'session_refreshed' && 'token' in value && typeof value.token === 'string';
}

function applySessionEvent(event: SessionEvent): void {
    if (event.type === 'session_refreshed') {
        // keep local token cache in sync with refreshes originating from other tabs
        setSessionToken(event.token);
    } else {
        setSessionToken(null);
    }
}

function notifyListeners(event: SessionEvent): void {
    listeners.forEach((listener) => listener(event));
}

channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isSessionEvent(event.data)) {
        return;
    }

    applySessionEvent(event.data);
    notifyListeners(event.data);
});

/**
 * Notify all tabs that the session token has been refreshed.
 *
 * @param token refreshed session token
 */
export function notifySessionRefreshed(token: string): void {
    const event: SessionEvent = { type: 'session_refreshed', token };
    applySessionEvent(event);
    notifyListeners(event);
    channel.postMessage(event);
}

/**
 * Notify all tabs that the session has been logged out/invalidated.
 */
export function notifySessionLoggedOut(): void {
    const event: SessionEvent = { type: 'session_logged_out' };
    applySessionEvent(event);
    notifyListeners(event);
    channel.postMessage(event);
}

/**
 * Subscribe to cross-tab session events.
 *
 * @param callback callback invoked when session state changes
 */
export function onSessionEvent(callback: (event: SessionEvent) => void): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
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
 * Cross-tab mutual exclusion is still guaranteed via Web Locks.
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

/**
 * Read the latest known in-memory session token.
 */
export function getLatestSessionToken(): string | null {
    return getSessionToken();
}
