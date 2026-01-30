/**
 * Stream Usage Tracker
 *
 * Tracks which stream variables are actively used by components via useEffect.
 * This is the ONLY reliable signal for component lifecycle (not render-time).
 *
 * Architecture:
 * 1. Atom effect starts SSE immediately and registers a cleanup callback
 * 2. Components register via useEffect (increment count)
 * 3. Components unregister via useEffect cleanup (decrement count)
 * 4. When count hits 0 → debounce → call cleanup callbacks → SSE stops
 *
 * The atom effect cleanup is NOT reliable (Recoil caching), so we actively
 * manage cleanup from here when components unregister.
 *
 * Subscriptions are keyed by uid+extras to handle different auth contexts
 * using the same variable independently.
 */

import { type RequestExtras } from '@/api/http';

/** Debounce period before pausing an unused stream (ms) */
const PAUSE_DEBOUNCE_MS = 1500;

/** Timeout for orphaned connections - if no subscription arrives within this period, cleanup (ms) */
const ORPHAN_TIMEOUT_MS = 5000;

/**
 * Create a stable subscription key from uid and extras.
 * Different extras (auth contexts) get independent subscription tracking.
 */
function createSubscriptionKey(uid: string, extras: RequestExtras): string {
    return `${uid}::${JSON.stringify(extras)}`;
}

interface StreamConnection {
    /** Function to start/restart the SSE connection, returns cleanup and controller */
    start: () => { cleanup: () => void; controller: AbortController };
    /** Cleanup function to abort SSE connection (set when start() is called) */
    cleanup?: () => void;
    /** AbortController for this connection (for direct abort access) */
    controller?: AbortController;
    /** Whether connection is currently active */
    active: boolean;
}

interface StreamUsage {
    /** Number of components actively subscribed (via useEffect) */
    count: number;
    /** Timer for debounced cleanup when count reaches 0 */
    cleanupTimer?: ReturnType<typeof setTimeout>;
    /** Timer for orphan cleanup when connection registers but no subscription arrives */
    orphanTimer?: ReturnType<typeof setTimeout>;
    /** Registered connections for this uid (atomKey -> connection) */
    connections: Map<string, StreamConnection>;
}

/** Map of subscription key (uid+extras) -> usage state */
const streamUsage = new Map<string, StreamUsage>();

/**
 * Get or create usage entry for a subscription key
 */
function getOrCreateUsage(key: string): StreamUsage {
    let usage = streamUsage.get(key);
    if (!usage) {
        usage = { count: 0, connections: new Map() };
        streamUsage.set(key, usage);
    }
    return usage;
}

/**
 * Try to cleanup all connections for a subscription key.
 * Called after debounce when count reaches 0.
 */
function cleanupConnections(key: string): void {
    const usage = streamUsage.get(key);
    if (!usage) {
        return;
    }

    // Only cleanup if count is still 0
    if (usage.count > 0) {
        return;
    }

    // Abort all active connections
    for (const [, conn] of usage.connections) {
        if (conn.active) {
            if (conn.controller) {
                conn.controller.abort();
            }
            conn.cleanup = undefined;
            conn.controller = undefined;
            conn.active = false;
        }
    }
}

/**
 * Restart inactive connections for a subscription key.
 * Called when a new subscription comes in after cleanup.
 */
function restartConnections(key: string): void {
    const usage = streamUsage.get(key);
    if (!usage) {
        return;
    }

    // Restart any inactive connections
    for (const [atomKey, conn] of usage.connections) {
        if (!conn.active) {
            try {
                const { cleanup, controller } = conn.start();
                conn.cleanup = cleanup;
                conn.controller = controller;
                conn.active = true;
            } catch (err) {
                // Log but don't throw - allow other connections to restart
                console.error(`Failed to restart stream connection ${atomKey}:`, err);
            }
        }
    }
}

/**
 * Abort an existing connection for the given atomKey, if one exists.
 * Called before starting a new connection to ensure no duplicates.
 *
 * @param atomKey Unique key for the connection (serialized params)
 * @returns true if a connection was aborted, false otherwise
 */
export function abortExistingConnection(atomKey: string): boolean {
    // Search all usage entries for this atomKey
    for (const usage of streamUsage.values()) {
        const conn = usage.connections.get(atomKey);
        if (conn?.active && conn.controller) {
            conn.controller.abort();
            conn.active = false;
            conn.cleanup = undefined;
            conn.controller = undefined;
            return true;
        }
    }
    return false;
}

/**
 * Register a stream connection from atom effect.
 * The start function is called immediately, and will be called again
 * if the connection needs to restart after cleanup.
 *
 * @param uid Stream variable uid
 * @param extras Request extras (auth headers, etc.)
 * @param atomKey Unique key for this connection (serialized params)
 * @param start Function to start the SSE connection, returns { cleanup, controller }
 * @returns Unregister function (backup cleanup, not relied upon)
 */
export function registerStreamConnection(
    uid: string,
    extras: RequestExtras,
    atomKey: string,
    start: () => { cleanup: () => void; controller: AbortController }
): () => void {
    const key = createSubscriptionKey(uid, extras);
    const usage = getOrCreateUsage(key);

    // Abort any existing connection for this atomKey (defensive)
    abortExistingConnection(atomKey);

    // Start the connection immediately
    const { cleanup, controller } = start();

    // Register the connection with the start function for potential restart
    usage.connections.set(atomKey, { start, cleanup, controller, active: true });

    // If no subscribers yet, start orphan timer - cleanup if no subscription arrives
    if (usage.count === 0 && !usage.orphanTimer) {
        usage.orphanTimer = setTimeout(() => {
            usage.orphanTimer = undefined;
            // If still no subscribers, this connection is orphaned
            if (usage.count === 0) {
                cleanupConnections(key);
            }
        }, ORPHAN_TIMEOUT_MS);
    }

    // Return unregister function (backup, called if atom effect cleanup actually runs)
    return () => {
        const currentUsage = streamUsage.get(key);
        if (!currentUsage) {
            return;
        }

        const conn = currentUsage.connections.get(atomKey);
        if (conn?.active) {
            if (conn.controller) {
                conn.controller.abort();
            }
            conn.cleanup = undefined;
            conn.controller = undefined;
            conn.active = false;
        }
        currentUsage.connections.delete(atomKey);

        // Clean up usage entry if no connections remain
        if (currentUsage.connections.size === 0 && currentUsage.count === 0) {
            if (currentUsage.cleanupTimer) {
                clearTimeout(currentUsage.cleanupTimer);
            }
            streamUsage.delete(key);
        }
    };
}

/**
 * Subscribe to a stream. Call this from component useEffect.
 *
 * @param uid Stream variable uid
 * @param extras Request extras (auth headers, etc.)
 * @returns Unsubscribe function to call in useEffect cleanup
 */
export function subscribeStream(uid: string, extras: RequestExtras): () => void {
    const key = createSubscriptionKey(uid, extras);
    const usage = getOrCreateUsage(key);

    // Cancel any pending cleanup or orphan timers
    if (usage.cleanupTimer) {
        clearTimeout(usage.cleanupTimer);
        usage.cleanupTimer = undefined;
    }
    if (usage.orphanTimer) {
        clearTimeout(usage.orphanTimer);
        usage.orphanTimer = undefined;
    }

    const wasEmpty = usage.count === 0;
    usage.count++;

    // If count was 0, restart any inactive connections
    if (wasEmpty) {
        restartConnections(key);
    }

    // Return unsubscribe function
    return () => {
        const currentUsage = streamUsage.get(key);
        if (!currentUsage) {
            return;
        }

        currentUsage.count = Math.max(0, currentUsage.count - 1);

        if (currentUsage.count === 0) {
            // Schedule cleanup after debounce
            currentUsage.cleanupTimer = setTimeout(() => {
                currentUsage.cleanupTimer = undefined;
                cleanupConnections(key);
            }, PAUSE_DEBOUNCE_MS);
        }
    };
}

/**
 * Check if a stream has active subscribers.
 */
export function isStreamActive(uid: string, extras: RequestExtras): boolean {
    const key = createSubscriptionKey(uid, extras);
    const usage = streamUsage.get(key);
    return usage !== undefined && usage.count > 0;
}

/**
 * Get subscriber count for a stream.
 */
export function getStreamSubscriberCount(uid: string, extras: RequestExtras): number {
    const key = createSubscriptionKey(uid, extras);
    return streamUsage.get(key)?.count ?? 0;
}

/**
 * Force cleanup all streams. Useful for testing or app shutdown.
 */
export function cleanupAllStreams(): void {
    for (const [, usage] of streamUsage) {
        if (usage.cleanupTimer) {
            clearTimeout(usage.cleanupTimer);
        }
        if (usage.orphanTimer) {
            clearTimeout(usage.orphanTimer);
        }
        for (const conn of usage.connections.values()) {
            if (conn.active && conn.controller) {
                conn.controller.abort();
            }
        }
    }
    streamUsage.clear();
}

/**
 * Clear all stream usage tracking. Used for testing.
 */
export function clearStreamUsage_TEST(): void {
    cleanupAllStreams();
}

/**
 * Get total count of active connections across all subscription keys.
 * Useful for testing.
 */
export function getActiveConnectionCount(): number {
    let count = 0;
    for (const usage of streamUsage.values()) {
        for (const conn of usage.connections.values()) {
            if (conn.active) {
                count++;
            }
        }
    }
    return count;
}

/**
 * Get all active connection keys (atomKeys).
 * Useful for testing.
 */
export function getActiveConnectionKeys(): string[] {
    const keys: string[] = [];
    for (const usage of streamUsage.values()) {
        for (const [atomKey, conn] of usage.connections) {
            if (conn.active) {
                keys.push(atomKey);
            }
        }
    }
    return keys;
}

/**
 * Get the AbortController for a specific atomKey, if active.
 * Useful for testing.
 */
export function getConnectionController(atomKey: string): AbortController | undefined {
    for (const usage of streamUsage.values()) {
        const conn = usage.connections.get(atomKey);
        if (conn?.active && conn.controller) {
            return conn.controller;
        }
    }
    return undefined;
}

/**
 * Internal exports for testing
 */
export const _internal = {
    streamUsage,
    PAUSE_DEBOUNCE_MS,
    ORPHAN_TIMEOUT_MS,
};
