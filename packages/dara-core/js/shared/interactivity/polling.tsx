import { useEffect, useRef } from 'react';

const DEFAULT_JITTER_RATIO = 0.1;
const MAX_BACKOFF_MS = 60_000;
const POLL_FORCE_KEY_PREFIX = '__dara_poll__:';

type TimerHandle = ReturnType<typeof setTimeout>;
type RequestSource = 'dependency' | 'poll';

interface PollingSubscriber {
    intervalMs: number;
    refresh: () => void;
}

interface ActiveRequest {
    completion: Promise<void>;
    consumers: number;
    controller: AbortController;
    detachExternalSignal?: () => void;
    fingerprint?: string;
    generation: number;
    resolveCompletion: () => void;
    source: RequestSource;
}

interface PollingEntry {
    activeRequest?: ActiveRequest;
    awaitingRequest: boolean;
    disposeTimer?: TimerHandle;
    failureCount: number;
    generation: number;
    resumePending: boolean;
    subscribers: Map<symbol, PollingSubscriber>;
    timer?: TimerHandle;
    trailingRefresh: boolean;
}

interface PollingCoordinatorOptions {
    clearTimeout?: (timer: TimerHandle) => void;
    getVisibilityState?: () => DocumentVisibilityState;
    jitterRatio?: number;
    now?: () => number;
    random?: () => number;
    setTimeout?: (callback: () => void, delay: number) => TimerHandle;
    visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
}

export type PollingRequestOutcome =
    | {
          status: 'aborted';
      }
    | {
          status: 'success';
      }
    | {
          retryAfterMs?: number;
          status: 'error';
      };

export interface PollingRequestHandle {
    /** AbortSignal owned by the polling coordinator for this request generation. */
    signal: AbortSignal;
    /** Complete this request and update polling cadence if it is still current. */
    finish: (outcome: PollingRequestOutcome) => void;
    /** Whether this request is still the newest request for its polling identity. */
    isCurrent: () => boolean;
    /** Wait for a newer request, if any, to finish publishing its result. */
    waitForSupersedingRequest: () => Promise<void>;
}

/**
 * Coordinates non-overlapping, fixed-delay polling for request identities.
 *
 * A request identity includes the rendered variable/component identity and its
 * serialized request extras. Multiple React consumers of the same identity
 * share one timer and one active request generation.
 */
export class PollingCoordinator {
    readonly #clearTimeout: (timer: TimerHandle) => void;
    readonly #entries = new Map<string, PollingEntry>();
    readonly #getVisibilityState: () => DocumentVisibilityState;
    readonly #jitterRatio: number;
    readonly #now: () => number;
    readonly #random: () => number;
    readonly #setTimeout: (callback: () => void, delay: number) => TimerHandle;
    readonly #visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>;

    #listeningForVisibility = false;

    constructor(options: PollingCoordinatorOptions = {}) {
        this.#clearTimeout = options.clearTimeout ?? ((timer) => clearTimeout(timer));
        this.#getVisibilityState =
            options.getVisibilityState ??
            (() => (typeof document === 'undefined' ? 'visible' : document.visibilityState));
        this.#jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
        this.#now = options.now ?? (() => Date.now());
        this.#random = options.random ?? (() => Math.random());
        this.#setTimeout = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
        this.#visibilityTarget = options.visibilityTarget ?? (typeof document === 'undefined' ? undefined : document);
    }

    /**
     * Register one rendered polling consumer.
     *
     * The returned cleanup releases the consumer. The final cleanup aborts the
     * owned request on the next macrotask so React StrictMode can immediately
     * reacquire the same identity without cancelling useful work.
     */
    subscribe(key: string, intervalSeconds: number | undefined, refresh: () => void): () => void {
        const intervalMs = (intervalSeconds ?? 0) * 1000;
        if (!Number.isFinite(intervalMs) || !(intervalMs > 0)) {
            return () => {};
        }

        const entry = this.#getOrCreateEntry(key);
        if (entry.disposeTimer !== undefined) {
            this.#clearTimeout(entry.disposeTimer);
            entry.disposeTimer = undefined;
        }

        const subscriberId = Symbol(key);
        entry.subscribers.set(subscriberId, { intervalMs, refresh });
        this.#startVisibilityListener();

        if (
            entry.subscribers.size === 1 &&
            !entry.activeRequest &&
            !entry.awaitingRequest &&
            entry.timer === undefined
        ) {
            this.#scheduleOrdinaryPoll(key, entry);
        }

        return () => {
            entry.subscribers.delete(subscriberId);
            if (entry.subscribers.size > 0) {
                return;
            }

            this.#clearTimer(entry);
            entry.disposeTimer = this.#setTimeout(() => {
                entry.disposeTimer = undefined;
                if (entry.subscribers.size > 0) {
                    return;
                }

                entry.activeRequest?.controller.abort();
                entry.activeRequest?.detachExternalSignal?.();
                entry.activeRequest?.resolveCompletion();
                this.#entries.delete(key);
                this.#stopVisibilityListenerIfIdle();
            }, 0);
        };
    }

    /**
     * Start a request associated with a polling identity.
     *
     * Dependency requests supersede and abort older work. Poll requests are
     * expected to originate from the coordinator; if a racing poll arrives
     * while another request is active, it is born aborted and cannot overwrite
     * the current generation.
     */
    startRequest(
        key: string,
        source: RequestSource,
        externalSignal?: AbortSignal,
        fingerprint?: string
    ): PollingRequestHandle {
        const entry = this.#getOrCreateEntry(key);

        if (entry.activeRequest) {
            if (
                fingerprint !== undefined &&
                entry.activeRequest.fingerprint === fingerprint &&
                entry.activeRequest.source === source
            ) {
                entry.activeRequest.consumers++;
                return this.#createRequestHandle(key, entry.activeRequest);
            }

            if (source === 'poll') {
                entry.trailingRefresh = true;
                const abortedController = new AbortController();
                abortedController.abort();
                return {
                    signal: abortedController.signal,
                    finish: () => {},
                    isCurrent: () => false,
                    waitForSupersedingRequest: () => this.#waitForSupersedingRequest(key, entry.generation),
                };
            }
            entry.activeRequest.controller.abort();
            entry.activeRequest.detachExternalSignal?.();
            entry.activeRequest.resolveCompletion();
        }

        this.#clearTimer(entry);
        entry.awaitingRequest = false;
        const generation = ++entry.generation;
        const controller = new AbortController();
        let resolveCompletion = (): void => {};
        const completion = new Promise<void>((resolve) => {
            resolveCompletion = resolve;
        });
        const activeRequest: ActiveRequest = {
            completion,
            consumers: 1,
            controller,
            fingerprint,
            generation,
            resolveCompletion,
            source,
        };
        entry.activeRequest = activeRequest;

        if (externalSignal && typeof externalSignal.addEventListener === 'function') {
            if (externalSignal.aborted) {
                controller.abort(externalSignal.reason);
            } else {
                const abortFromExternalSignal = (): void => controller.abort(externalSignal.reason);
                externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
                activeRequest.detachExternalSignal = () =>
                    externalSignal.removeEventListener('abort', abortFromExternalSignal);
            }
        }

        return this.#createRequestHandle(key, activeRequest);
    }

    #createRequestHandle(key: string, activeRequest: ActiveRequest): PollingRequestHandle {
        let finished = false;
        return {
            signal: activeRequest.controller.signal,
            finish: (outcome) => {
                if (finished) {
                    return;
                }
                finished = true;
                this.#finishRequest(key, activeRequest.generation, outcome);
            },
            isCurrent: () => this.#entries.get(key)?.activeRequest?.generation === activeRequest.generation,
            waitForSupersedingRequest: () => this.#waitForSupersedingRequest(key, activeRequest.generation),
        };
    }

    /** Request an immediate refresh, coalescing it while the identity is busy. */
    requestRefresh(key: string): void {
        const entry = this.#entries.get(key);
        if (!entry || entry.subscribers.size === 0) {
            return;
        }

        if (this.#getVisibilityState() === 'hidden') {
            entry.resumePending = true;
            return;
        }

        if (entry.activeRequest || entry.awaitingRequest) {
            entry.trailingRefresh = true;
            return;
        }

        this.#clearTimer(entry);
        entry.awaitingRequest = true;
        this.#getSubscriber(entry)?.refresh();
    }

    /** Abort and remove every polling identity. Intended for test isolation. */
    clear(): void {
        for (const entry of this.#entries.values()) {
            this.#clearTimer(entry);
            if (entry.disposeTimer !== undefined) {
                this.#clearTimeout(entry.disposeTimer);
            }
            entry.activeRequest?.controller.abort();
            entry.activeRequest?.detachExternalSignal?.();
            entry.activeRequest?.resolveCompletion();
        }
        this.#entries.clear();
        this.#stopVisibilityListenerIfIdle();
    }

    /** Current time according to the injected clock. */
    now(): number {
        return this.#now();
    }

    #finishRequest(key: string, generation: number, outcome: PollingRequestOutcome): void {
        const entry = this.#entries.get(key);
        if (!entry || entry.activeRequest?.generation !== generation) {
            return;
        }

        entry.activeRequest.consumers--;
        if (entry.activeRequest.consumers > 0) {
            return;
        }

        entry.activeRequest.detachExternalSignal?.();
        entry.activeRequest.resolveCompletion();
        entry.activeRequest = undefined;
        if (entry.subscribers.size === 0) {
            this.#entries.delete(key);
            this.#stopVisibilityListenerIfIdle();
            return;
        }

        if (outcome.status === 'aborted') {
            return;
        }

        if (this.#getVisibilityState() === 'hidden') {
            entry.resumePending = true;
            return;
        }

        if (outcome.status === 'success') {
            entry.failureCount = 0;
            if (entry.trailingRefresh || entry.resumePending) {
                entry.trailingRefresh = false;
                entry.resumePending = false;
                this.requestRefresh(key);
                return;
            }
            this.#scheduleOrdinaryPoll(key, entry);
            return;
        }

        entry.failureCount += 1;
        entry.trailingRefresh = false;
        const baseDelay = this.#getIntervalMs(entry);
        const exponentialDelay = Math.min(baseDelay * 2 ** (entry.failureCount - 1), MAX_BACKOFF_MS);
        const backoffDelay = Math.max(this.#withJitter(exponentialDelay), outcome.retryAfterMs ?? 0);
        this.#schedule(key, entry, backoffDelay);
    }

    async #waitForSupersedingRequest(key: string, generation: number): Promise<void> {
        const activeRequest = this.#entries.get(key)?.activeRequest;
        if (!activeRequest || activeRequest.generation === generation) {
            return;
        }
        await activeRequest.completion;
    }

    #getIntervalMs(entry: PollingEntry): number {
        return Math.min(...Array.from(entry.subscribers.values(), (subscriber) => subscriber.intervalMs));
    }

    #getOrCreateEntry(key: string): PollingEntry {
        let entry = this.#entries.get(key);
        if (!entry) {
            entry = {
                awaitingRequest: false,
                failureCount: 0,
                generation: 0,
                resumePending: false,
                subscribers: new Map(),
                trailingRefresh: false,
            };
            this.#entries.set(key, entry);
        }
        return entry;
    }

    #getSubscriber(entry: PollingEntry): PollingSubscriber | undefined {
        return Array.from(entry.subscribers.values()).sort((a, b) => a.intervalMs - b.intervalMs)[0];
    }

    #scheduleOrdinaryPoll(key: string, entry: PollingEntry): void {
        this.#schedule(key, entry, this.#withJitter(this.#getIntervalMs(entry)));
    }

    #schedule(key: string, entry: PollingEntry, delay: number): void {
        this.#clearTimer(entry);
        if (this.#getVisibilityState() === 'hidden') {
            entry.resumePending = true;
            return;
        }
        entry.timer = this.#setTimeout(() => {
            entry.timer = undefined;
            this.requestRefresh(key);
        }, delay);
    }

    #clearTimer(entry: PollingEntry): void {
        if (entry.timer !== undefined) {
            this.#clearTimeout(entry.timer);
            entry.timer = undefined;
        }
    }

    #withJitter(delay: number): number {
        const multiplier = 1 - this.#jitterRatio + this.#random() * this.#jitterRatio * 2;
        return Math.max(0, delay * multiplier);
    }

    readonly #handleVisibilityChange = (): void => {
        const hidden = this.#getVisibilityState() === 'hidden';
        for (const [key, entry] of this.#entries) {
            if (hidden) {
                entry.resumePending = entry.subscribers.size > 0;
                if (entry.timer !== undefined) {
                    this.#clearTimer(entry);
                }
                continue;
            }

            if (!entry.resumePending || entry.subscribers.size === 0) {
                continue;
            }
            entry.resumePending = false;
            this.requestRefresh(key);
        }
    };

    #startVisibilityListener(): void {
        if (this.#listeningForVisibility || !this.#visibilityTarget) {
            return;
        }
        this.#visibilityTarget.addEventListener('visibilitychange', this.#handleVisibilityChange);
        this.#listeningForVisibility = true;
    }

    #stopVisibilityListenerIfIdle(): void {
        if (!this.#listeningForVisibility || this.#entries.size > 0 || !this.#visibilityTarget) {
            return;
        }
        this.#visibilityTarget.removeEventListener('visibilitychange', this.#handleVisibilityChange);
        this.#listeningForVisibility = false;
    }
}

const pollingCoordinator = new PollingCoordinator();

/**
 * Register fixed-delay polling for a request identity.
 *
 * `refresh` only invalidates the corresponding selector. Request lifecycle,
 * backpressure, retries, and cancellation remain owned by the coordinator.
 */
export function usePolling(key: string, intervalSeconds: number | undefined, refresh: () => void): void {
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

    useEffect(
        () => pollingCoordinator.subscribe(key, intervalSeconds, () => refreshRef.current()),
        [key, intervalSeconds]
    );
}

/** Start a request using the production polling coordinator. */
export function startPollingRequest(
    key: string,
    source: RequestSource,
    externalSignal?: AbortSignal,
    fingerprint?: string
): PollingRequestHandle {
    return pollingCoordinator.startRequest(key, source, externalSignal, fingerprint);
}

/** Create a force key that identifies a coordinator-owned poll refresh. */
export function createPollForceKey(): string {
    return `${POLL_FORCE_KEY_PREFIX}${globalThis.crypto?.randomUUID?.() ?? String(Math.random())}`;
}

/** Check whether a selector force key originated from the polling coordinator. */
export function isPollForceKey(forceKey: string | null | undefined): boolean {
    return forceKey?.startsWith(POLL_FORCE_KEY_PREFIX) ?? false;
}

/** Extract Retry-After as a non-negative delay in milliseconds. */
export function parseRetryAfter(response: Response, now = pollingCoordinator.now()): number | undefined {
    const value = response.headers.get('Retry-After');
    if (!value) {
        return undefined;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }

    const retryAt = Date.parse(value);
    if (Number.isNaN(retryAt)) {
        return undefined;
    }
    return Math.max(0, retryAt - now);
}

/** Read Retry-After metadata attached at the HTTP response seam. */
export function getRetryAfterMs(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null && 'retryAfterMs' in error
        ? (error as { retryAfterMs?: number }).retryAfterMs
        : undefined;
}

/** Throw an AbortError when a superseded request attempts to publish a result. */
export function assertCurrentRequest(handle: PollingRequestHandle): void {
    if (!handle.isCurrent() || handle.signal.aborted) {
        throw new DOMException('The request was superseded', 'AbortError');
    }
}

/** Check whether an error represents intentional request cancellation. */
export function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
    );
}

/** Await a promise while preserving ownership of request cancellation. */
export async function waitForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        throw new DOMException('The request was aborted', 'AbortError');
    }

    return new Promise<T>((resolve, reject) => {
        const abort = (): void => {
            signal.removeEventListener('abort', abort);
            reject(new DOMException('The request was aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', abort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', abort);
                reject(error);
            }
        );
    });
}

/** Clear production polling state. Intended for test isolation. */
export function clearPolling_TEST(): void {
    pollingCoordinator.clear();
}
