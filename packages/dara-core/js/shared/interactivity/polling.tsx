import { useEffect, useId, useLayoutEffect } from 'react';

import { useLatestRef } from '@darajs/ui-utils';

const DEFAULT_JITTER_RATIO = 0.1;
const MAX_BACKOFF_MS = 60_000;
const POLL_FORCE_KEY_PREFIX = '__dara_poll__:';
const retryAfterByError = new WeakMap<object, number>();

type TimerHandle = ReturnType<typeof setTimeout>;
type RunCause = 'dependency' | 'poll';

interface PollingSubscriber {
    intervalMs: number;
    refresh: () => void;
}

interface ActiveRun {
    done: Promise<void>;
    controller: AbortController;
    detachExternalSignal?: () => void;
    inputKey?: string;
    generation: number;
    end: () => void;
    result?: Promise<unknown>;
    cause: RunCause;
}

type RunState = { kind: 'idle' } | { kind: 'running'; run: ActiveRun } | { kind: 'starting' };

interface PollingEntry {
    disposeTimer?: TimerHandle;
    failureCount: number;
    generation: number;
    nextRunAt?: number;
    owners: Set<string>;
    runAgain: boolean;
    runOnShow: boolean;
    state: RunState;
    subscribers: Map<symbol, PollingSubscriber>;
    timer?: TimerHandle;
}

interface PollerOptions {
    clearTimeout?: (timer: TimerHandle) => void;
    getVisibilityState?: () => DocumentVisibilityState;
    jitterRatio?: number;
    now?: () => number;
    random?: () => number;
    setTimeout?: (callback: () => void, delay: number) => TimerHandle;
    visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
}

interface PollOwner {
    disposeTimer?: TimerHandle;
    hooks: Map<string, string>;
    renderKeys: Set<string>;
    timers: Map<string, TimerHandle>;
}

export interface PollScope {
    id: string;
    keys: Set<string>;
}

type RunOutcome =
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

interface RunHandle {
    /** AbortSignal owned by the poller for this request generation. */
    signal: AbortSignal;
    /** Complete this request and update polling cadence if it is still current. */
    finish: (outcome: RunOutcome) => void;
    /** Whether this request is still the newest request for its polling identity. */
    isCurrent: () => boolean;
    /** Wait for a newer request, if any, to finish publishing its result. */
    waitForNewer: () => Promise<void>;
}

export type SavedValue<T> = { found: false } | { found: true; value: T };

export interface PollRun<T> {
    cause: RunCause;
    inputKey?: string;
    key: string;
    read?: () => SavedValue<T>;
    signal?: AbortSignal;
    work: (signal: AbortSignal) => Promise<T>;
    write: (value: T) => void;
}

/** Throw an AbortError when an old run attempts to publish a result. */
function assertCurrentRun(handle: RunHandle): void {
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

/** Read Retry-After saved at the HTTP response seam. */
function getRetryAfterMs(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null ? retryAfterByError.get(error) : undefined;
}

/**
 * Coordinates non-overlapping, fixed-delay polling for request identities.
 *
 * A request identity includes the rendered variable/component identity and its
 * serialized request extras. Multiple React consumers of the same identity
 * share one timer and one active request generation.
 */
export class Poller {
    readonly #clearTimeout: (timer: TimerHandle) => void;
    readonly #entries = new Map<string, PollingEntry>();
    readonly #getVisibilityState: () => DocumentVisibilityState;
    readonly #jitterRatio: number;
    readonly #now: () => number;
    readonly #random: () => number;
    readonly #setTimeout: (callback: () => void, delay: number) => TimerHandle;
    readonly #visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
    readonly #owners = new Map<string, PollOwner>();

    #listeningForVisibility = false;

    constructor(options: PollerOptions = {}) {
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
        const oldIntervalMs = entry.subscribers.size > 0 ? this.#getIntervalMs(entry) : undefined;
        if (entry.disposeTimer !== undefined) {
            this.#clearTimeout(entry.disposeTimer);
            entry.disposeTimer = undefined;
        }

        const subscriberId = Symbol(key);
        entry.subscribers.set(subscriberId, { intervalMs, refresh });
        this.#startVisibilityListener();

        if (entry.subscribers.size === 1 && entry.state.kind === 'idle' && entry.timer === undefined) {
            this.#scheduleOrdinaryPoll(key, entry);
        } else if (
            entry.timer !== undefined &&
            entry.failureCount === 0 &&
            oldIntervalMs !== undefined &&
            intervalMs < oldIntervalMs
        ) {
            const remaining = Math.max(0, (entry.nextRunAt ?? this.#now()) - this.#now());
            this.#schedule(key, entry, Math.min(remaining, this.#withJitter(intervalMs)));
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
                if (entry.owners.size > 0) {
                    return;
                }
                if (this.#entries.get(key) !== entry) {
                    return;
                }

                if (entry.state.kind === 'running') {
                    entry.state.run.controller.abort();
                    entry.state.run.detachExternalSignal?.();
                    entry.state.run.end();
                }
                this.#entries.delete(key);
                this.#stopVisibilityListenerIfIdle();
            }, 0);
        };
    }

    /** Apply the polling keys collected by one committed owner render. */
    commitOwner(ownerId: string, keys: ReadonlySet<string>): void {
        const owner = this.#getOrCreateOwner(ownerId);
        if (owner.disposeTimer !== undefined) {
            this.#clearTimeout(owner.disposeTimer);
            owner.disposeTimer = undefined;
        }

        // Add the new render before dropping the old one. A rerender must not
        // leave a live request without an owner between layout effects.
        const nextRenderKeys = new Set<string>();
        for (const key of keys) {
            this.#getOrCreateEntry(key).owners.add(ownerId);
            if (!this.#hasHookForKey(owner, key)) {
                nextRenderKeys.add(key);
            }
        }

        const oldRenderKeys = owner.renderKeys;
        owner.renderKeys = nextRenderKeys;
        for (const key of oldRenderKeys) {
            if (!nextRenderKeys.has(key) && !this.#hasHookForKey(owner, key)) {
                this.#dropOwnedKey(ownerId, key);
            }
        }
    }

    /** Keep one key after its hook commits. */
    mountKey(ownerId: string, hookId: string, key: string): void {
        const owner = this.#getOrCreateOwner(ownerId);
        if (owner.disposeTimer !== undefined) {
            this.#clearTimeout(owner.disposeTimer);
            owner.disposeTimer = undefined;
        }
        const timer = owner.timers.get(hookId);
        if (timer !== undefined) {
            this.#clearTimeout(timer);
            owner.timers.delete(hookId);
        }

        const oldKey = owner.hooks.get(hookId);
        owner.hooks.set(hookId, key);
        owner.renderKeys.delete(key);
        this.#getOrCreateEntry(key).owners.add(ownerId);
        if (oldKey !== undefined && oldKey !== key && !this.#ownerHasKey(owner, oldKey)) {
            this.#dropOwnedKey(ownerId, oldKey);
        }
    }

    /** Drop a committed hook key after the StrictMode remount window. */
    unmountKey(ownerId: string, hookId: string, key: string): void {
        const owner = this.#owners.get(ownerId);
        if (!owner || owner.timers.has(hookId)) {
            return;
        }
        const timer = this.#setTimeout(() => {
            owner.timers.delete(hookId);
            if (owner.hooks.get(hookId) !== key) {
                return;
            }
            owner.hooks.delete(hookId);
            if (!this.#ownerHasKey(owner, key)) {
                this.#dropOwnedKey(ownerId, key);
            }
            this.#stopVisibilityListenerIfIdle();
        }, 0);
        owner.timers.set(hookId, timer);
    }

    /** Release a rendered owner after the StrictMode remount window. */
    releaseOwner(ownerId: string): void {
        const owner = this.#owners.get(ownerId);
        if (!owner || owner.disposeTimer !== undefined) {
            return;
        }
        owner.disposeTimer = this.#setTimeout(() => this.#dropOwner(ownerId, owner), 0);
    }

    /**
     * Run one request for a polling identity.
     *
     * Matching callers share one promise. Dependency runs replace older work,
     * while a poll that arrives during a run leaves one follow-up refresh.
     */
    run<T>({ cause, inputKey, key, read, signal, work, write }: PollRun<T>): Promise<T> {
        const entry = this.#entries.get(key);
        const running = entry?.state.kind === 'running' ? entry.state.run : undefined;
        if (running?.cause === cause && running.inputKey === inputKey && running.result) {
            return running.result as Promise<T>;
        }

        const handle = this.#start(key, cause, signal, inputKey);
        const result = this.#runWork({ cause, handle, read, work, write });
        const state = this.#entries.get(key)?.state;
        if (state?.kind === 'running' && handle.isCurrent()) {
            state.run.result = result;
        }
        return result;
    }

    #start(key: string, cause: RunCause, externalSignal?: AbortSignal, inputKey?: string): RunHandle {
        const entry = this.#getOrCreateEntry(key);

        if (entry.state.kind === 'running') {
            const running = entry.state.run;
            if (cause === 'poll') {
                // A slow poll must finish. Keep one later run instead of
                // stopping work on every tick.
                entry.runAgain = true;
                const abortedController = new AbortController();
                abortedController.abort();
                return {
                    signal: abortedController.signal,
                    finish: () => {},
                    isCurrent: () => false,
                    waitForNewer: () => this.#waitForNewer(key, entry.generation),
                };
            }
            running.controller.abort();
            running.detachExternalSignal?.();
            running.end();
        }

        this.#clearTimer(entry);
        const generation = ++entry.generation;
        const controller = new AbortController();
        let end = (): void => {};
        const done = new Promise<void>((resolve) => {
            end = resolve;
        });
        const activeRun: ActiveRun = {
            cause,
            controller,
            done,
            end,
            generation,
            inputKey,
        };
        entry.state = { kind: 'running', run: activeRun };

        if (externalSignal && typeof externalSignal.addEventListener === 'function') {
            if (externalSignal.aborted) {
                controller.abort(externalSignal.reason);
            } else {
                const abortFromExternalSignal = (): void => controller.abort(externalSignal.reason);
                externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
                activeRun.detachExternalSignal = () =>
                    externalSignal.removeEventListener('abort', abortFromExternalSignal);
            }
        }

        return this.#createRunHandle(key, activeRun);
    }

    #createRunHandle(key: string, activeRun: ActiveRun): RunHandle {
        let finished = false;
        return {
            signal: activeRun.controller.signal,
            finish: (outcome) => {
                if (finished) {
                    return;
                }
                finished = true;
                this.#finishRequest(key, activeRun.generation, outcome);
            },
            isCurrent: () => {
                const state = this.#entries.get(key)?.state;
                return state?.kind === 'running' && state.run.generation === activeRun.generation;
            },
            waitForNewer: () => this.#waitForNewer(key, activeRun.generation),
        };
    }

    async #runWork<T>({
        cause,
        handle,
        read,
        work,
        write,
    }: {
        cause: RunCause;
        handle: RunHandle;
        read?: () => SavedValue<T>;
        work: (signal: AbortSignal) => Promise<T>;
        write: (value: T) => void;
    }): Promise<T> {
        let outcome: RunOutcome = { status: 'success' };
        try {
            assertCurrentRun(handle);
            const value = await work(handle.signal);
            assertCurrentRun(handle);
            write(value);
            return value;
        } catch (error) {
            outcome = isAbortError(error)
                ? { status: 'aborted' }
                : { status: 'error', retryAfterMs: getRetryAfterMs(error) };

            const previous = read?.();
            if (isAbortError(error) && previous?.found) {
                // A replaced selector still owns a Recoil promise. Wait until
                // every newer run publishes before returning its value.
                await handle.waitForNewer();
                const latest = read?.();
                return latest?.found ? latest.value : previous.value;
            }
            if (cause === 'poll' && previous?.found) {
                return previous.value;
            }
            throw error;
        } finally {
            handle.finish(outcome);
        }
    }

    /** Refresh now, or keep one refresh while busy. */
    runNow(key: string): void {
        const entry = this.#entries.get(key);
        if (!entry || entry.subscribers.size === 0) {
            return;
        }

        if (this.#getVisibilityState() === 'hidden') {
            entry.runOnShow = true;
            return;
        }

        if (entry.state.kind !== 'idle') {
            entry.runAgain = true;
            return;
        }

        this.#clearTimer(entry);
        entry.state = { kind: 'starting' };
        this.#getSubscriber(entry)?.refresh();
    }

    /** Abort and remove every polling identity. Intended for test isolation. */
    clear(): void {
        for (const entry of this.#entries.values()) {
            this.#clearTimer(entry);
            if (entry.disposeTimer !== undefined) {
                this.#clearTimeout(entry.disposeTimer);
            }
            if (entry.state.kind === 'running') {
                entry.state.run.controller.abort();
                entry.state.run.detachExternalSignal?.();
                entry.state.run.end();
            }
        }
        for (const owner of this.#owners.values()) {
            if (owner.disposeTimer !== undefined) {
                this.#clearTimeout(owner.disposeTimer);
            }
            for (const timer of owner.timers.values()) {
                this.#clearTimeout(timer);
            }
        }
        this.#owners.clear();
        this.#entries.clear();
        this.#stopVisibilityListenerIfIdle();
    }

    /** Current time according to the injected clock. */
    now(): number {
        return this.#now();
    }

    #finishRequest(key: string, generation: number, outcome: RunOutcome): void {
        const entry = this.#entries.get(key);
        if (!entry || entry.state.kind !== 'running' || entry.state.run.generation !== generation) {
            return;
        }

        entry.state.run.detachExternalSignal?.();
        entry.state.run.end();
        entry.state = { kind: 'idle' };
        if (entry.subscribers.size === 0) {
            if (entry.owners.size === 0) {
                this.#entries.delete(key);
                this.#stopVisibilityListenerIfIdle();
            }
            return;
        }

        if (outcome.status === 'success') {
            entry.failureCount = 0;
            entry.nextRunAt = undefined;
        } else if (outcome.status === 'error') {
            entry.failureCount += 1;
            entry.runAgain = false;
            const baseDelay = this.#getIntervalMs(entry);
            const exponentialDelay = Math.min(baseDelay * 2 ** (entry.failureCount - 1), MAX_BACKOFF_MS);
            const jitteredDelay = Math.min(this.#withJitter(exponentialDelay), MAX_BACKOFF_MS);
            const backoffDelay = Math.max(jitteredDelay, outcome.retryAfterMs ?? 0);
            this.#schedule(key, entry, backoffDelay);
        }

        if (this.#getVisibilityState() === 'hidden') {
            // Keep the due time so Retry-After and backoff still hold when the
            // tab becomes visible.
            entry.runOnShow = true;
            return;
        }

        if (outcome.status === 'success') {
            if (entry.runAgain || entry.runOnShow) {
                entry.runAgain = false;
                entry.runOnShow = false;
                this.runNow(key);
                return;
            }
            this.#scheduleOrdinaryPoll(key, entry);
            return;
        }

        if (outcome.status === 'aborted') {
            if (entry.runAgain) {
                entry.runAgain = false;
                this.runNow(key);
            } else {
                this.#scheduleOrdinaryPoll(key, entry);
            }
        }
    }

    async #waitForNewer(key: string, generation: number): Promise<void> {
        let seenGeneration = generation;
        while (true) {
            const state = this.#entries.get(key)?.state;
            const activeRun = state?.kind === 'running' ? state.run : undefined;
            if (!activeRun || activeRun.generation <= seenGeneration) {
                return;
            }
            seenGeneration = activeRun.generation;
            await activeRun.done;
        }
    }

    #getIntervalMs(entry: PollingEntry): number {
        return Math.min(...Array.from(entry.subscribers.values(), (subscriber) => subscriber.intervalMs));
    }

    #getOrCreateEntry(key: string): PollingEntry {
        let entry = this.#entries.get(key);
        if (!entry) {
            entry = {
                failureCount: 0,
                generation: 0,
                owners: new Set(),
                runAgain: false,
                runOnShow: false,
                state: { kind: 'idle' },
                subscribers: new Map(),
            };
            this.#entries.set(key, entry);
        }
        return entry;
    }

    #getSubscriber(entry: PollingEntry): PollingSubscriber | undefined {
        return Array.from(entry.subscribers.values()).sort((a, b) => a.intervalMs - b.intervalMs)[0];
    }

    #getOrCreateOwner(ownerId: string): PollOwner {
        let owner = this.#owners.get(ownerId);
        if (!owner) {
            const newOwner: PollOwner = {
                hooks: new Map(),
                renderKeys: new Set(),
                timers: new Map(),
            };
            owner = newOwner;
            this.#owners.set(ownerId, newOwner);
        }
        return owner;
    }

    #dropOwnedKey(ownerId: string, key: string): void {
        const entry = this.#entries.get(key);
        if (!entry) {
            return;
        }
        entry.owners.delete(ownerId);
        if (entry.owners.size > 0 || entry.subscribers.size > 0) {
            return;
        }
        this.#clearTimer(entry);
        if (entry.state.kind === 'running') {
            entry.state.run.controller.abort();
            entry.state.run.detachExternalSignal?.();
            entry.state.run.end();
        }
        this.#entries.delete(key);
    }

    #dropOwner(ownerId: string, owner: PollOwner): void {
        if (this.#owners.get(ownerId) !== owner) {
            return;
        }
        this.#owners.delete(ownerId);
        for (const timer of owner.timers.values()) {
            this.#clearTimeout(timer);
        }
        const keys = new Set([...owner.renderKeys, ...owner.hooks.values()]);
        for (const key of keys) {
            this.#dropOwnedKey(ownerId, key);
        }
        this.#stopVisibilityListenerIfIdle();
    }

    #hasHookForKey(owner: PollOwner, key: string): boolean {
        return Array.from(owner.hooks.values()).some((hookKey) => hookKey === key);
    }

    #ownerHasKey(owner: PollOwner, key: string): boolean {
        return owner.renderKeys.has(key) || this.#hasHookForKey(owner, key);
    }

    #scheduleOrdinaryPoll(key: string, entry: PollingEntry): void {
        this.#schedule(key, entry, this.#withJitter(this.#getIntervalMs(entry)));
    }

    #schedule(key: string, entry: PollingEntry, delay: number): void {
        this.#clearTimer(entry);
        entry.nextRunAt = this.#now() + delay;
        if (this.#getVisibilityState() === 'hidden') {
            entry.runOnShow = true;
            return;
        }
        entry.timer = this.#setTimeout(() => {
            entry.timer = undefined;
            entry.nextRunAt = undefined;
            this.runNow(key);
        }, delay);
    }

    #clearTimer(entry: PollingEntry, clearNextRun = true): void {
        if (entry.timer !== undefined) {
            this.#clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        if (clearNextRun) {
            entry.nextRunAt = undefined;
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
                entry.runOnShow = entry.subscribers.size > 0;
                if (entry.timer !== undefined) {
                    this.#clearTimer(entry, entry.failureCount === 0);
                }
                continue;
            }

            if (!entry.runOnShow || entry.subscribers.size === 0) {
                continue;
            }
            entry.runOnShow = false;
            const delay = Math.max(0, (entry.nextRunAt ?? this.#now()) - this.#now());
            if (delay > 0) {
                this.#schedule(key, entry, delay);
            } else {
                this.runNow(key);
            }
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

const poller = new Poller();

/**
 * Register fixed-delay polling for a request identity.
 *
 * `refresh` only invalidates the corresponding selector. Request lifecycle,
 * backpressure, retries, and cancellation remain owned by the poller.
 */
export function usePolling(key: string, intervalSeconds: number | undefined, refresh: () => void): void {
    const refreshRef = useLatestRef(refresh);

    useEffect(
        () => poller.subscribe(key, intervalSeconds, () => refreshRef.current()),
        [intervalSeconds, key, refreshRef]
    );
}

/**
 * Create a render-local list of polling keys and apply it after commit.
 *
 * Descendants may suspend before their own effects run. They add keys to this
 * detached set during render; only the owner's layout effect changes Poller.
 */
export function usePollScope(): PollScope {
    const id = useId();
    const keys = new Set<string>();

    useLayoutEffect(() => {
        poller.commitOwner(id, keys);
    });
    useLayoutEffect(() => () => poller.releaseOwner(id), [id]);

    return { id, keys };
}

/**
 * Keep one request key for a rendered hook.
 *
 * The render-local key lets a committed parent own work while this hook is
 * suspended. Its passive effect stays mounted when Suspense hides an existing
 * tree, so a dependency refresh does not lose ownership of the active request.
 */
export function usePollKey(scope: PollScope | undefined, key: string): void {
    const hookId = useId();
    scope?.keys.add(key);
    const ownerId = scope?.id;

    useEffect(() => {
        if (!ownerId) {
            return;
        }
        poller.mountKey(ownerId, hookId, key);
        return () => poller.unmountKey(ownerId, hookId, key);
    }, [hookId, key, ownerId]);
}

/** Run one request using the production poller. */
export function runPoll<T>(run: PollRun<T>): Promise<T> {
    return poller.run(run);
}

/** Create a force key that identifies a poller-owned refresh. */
export function createPollForceKey(): string {
    return `${POLL_FORCE_KEY_PREFIX}${globalThis.crypto?.randomUUID?.() ?? String(Math.random())}`;
}

/** Check whether a selector force key originated from the poller. */
export function isPollForceKey(forceKey: string | null | undefined): boolean {
    return forceKey?.startsWith(POLL_FORCE_KEY_PREFIX) ?? false;
}

/** Extract Retry-After as a non-negative delay in milliseconds. */
export function parseRetryAfter(response: Response, now = poller.now()): number | undefined {
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

/** Keep Retry-After beside an error without changing the error object. */
export function markRetryAfter(error: unknown, response: Response): unknown {
    const delay = parseRetryAfter(response);
    if (delay !== undefined && typeof error === 'object' && error !== null) {
        retryAfterByError.set(error, delay);
    }
    return error;
}

/** Await a promise while preserving ownership of request cancellation. */
export async function waitOrAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
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
    poller.clear();
}
