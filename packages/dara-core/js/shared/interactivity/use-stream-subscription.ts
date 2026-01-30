/**
 * Hook for subscribing to stream variables via useEffect.
 *
 * This is the reliable signal for component lifecycle - useEffect runs
 * after commit, and cleanup runs on unmount.
 *
 * SSE starts immediately in the atom effect (before this hook runs).
 * This hook just tracks that components are actively using the stream,
 * so the tracker knows when to cleanup.
 */

import { useEffect } from 'react';

import { type RequestExtras } from '@/api/http';

import { subscribeStream } from './stream-usage-tracker';

/**
 * Subscribe to stream variables for SSE lifecycle management.
 *
 * Call this from components that use StreamVariables. The subscription
 * is registered in useEffect and unregistered in cleanup.
 *
 * @param streamUids Array of stream variable UIDs to subscribe to
 * @param extras Request extras (auth headers, etc.) - subscriptions are keyed by uid+extras
 */
export function useStreamSubscription(streamUids: string[], extras: RequestExtras): void {
    useEffect(() => {
        if (streamUids.length === 0) {
            return;
        }

        // Subscribe to each stream uid with the current extras context
        const unsubscribes = streamUids.map((uid) => subscribeStream(uid, extras));

        // Cleanup on unmount
        return () => {
            unsubscribes.forEach((unsub) => unsub());
        };
    }, [streamUids, extras]);
}
