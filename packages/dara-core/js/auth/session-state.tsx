import * as React from 'react';
import { z } from 'zod/v4';

const SESSION_STATE_CHANNEL_NAME = 'dara-session-state';

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

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SESSION_STATE_CHANNEL_NAME) : null;

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
