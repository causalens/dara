import { act, renderHook } from '@testing-library/react';

import {
    Poller,
    clearPolling_TEST,
    markRetryAfter,
    parseRetryAfter,
    usePolling,
    waitOrAbort,
} from '@/shared/interactivity/polling';

class VisibilityTarget extends EventTarget {
    state: DocumentVisibilityState = 'visible';

    setState(state: DocumentVisibilityState): void {
        this.state = state;
        this.dispatchEvent(new Event('visibilitychange'));
    }
}

interface Deferred<T> {
    promise: Promise<T>;
    reject: (error: unknown) => void;
    resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
    let reject!: (error: unknown) => void;
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });
    return { promise, reject, resolve };
}

describe('Poller', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        clearPolling_TEST();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    function createPoller(
        visibility = new VisibilityTarget(),
        options: { jitterRatio?: number; random?: () => number } = {}
    ): { poller: Poller; visibility: VisibilityTarget } {
        return {
            poller: new Poller({
                getVisibilityState: () => visibility.state,
                jitterRatio: options.jitterRatio ?? 0,
                random: options.random,
                visibilityTarget: visibility,
            }),
            visibility,
        };
    }

    function watchPolls(
        poller: Poller,
        key: string,
        interval = 1
    ): Array<Deferred<number> & { result?: Promise<number>; signal?: AbortSignal }> {
        const runs: Array<Deferred<number> & { result?: Promise<number>; signal?: AbortSignal }> = [];
        let saved = 0;
        poller.subscribe(key, interval, () => {
            const next: Deferred<number> & { result?: Promise<number>; signal?: AbortSignal } = defer<number>();
            runs.push(next);
            next.result = poller.run({
                cause: 'poll',
                key,
                read: () => ({ found: true, value: saved }),
                work: (signal) => {
                    next.signal = signal;
                    return waitOrAbort(next.promise, signal);
                },
                write: (value) => {
                    saved = value;
                },
            });
        });
        return runs;
    }

    it('runs one poll at a time and keeps one refresh while busy', async () => {
        const { poller } = createPoller();
        const runs = watchPolls(poller, 'derived:one');

        vi.advanceTimersByTime(1000);
        poller.runNow('derived:one');
        poller.runNow('derived:one');
        poller.runNow('derived:one');
        expect(runs).toHaveLength(1);

        runs[0]!.resolve(1);
        await vi.waitFor(() => expect(runs).toHaveLength(2));
        runs[1]!.resolve(2);
        await expect(runs[1]!.result).resolves.toBe(2);
        expect(runs).toHaveLength(2);
    });

    it('uses fixed delay measured from request completion', async () => {
        const { poller } = createPoller();
        const runs = watchPolls(poller, 'derived:fixed-delay');

        vi.advanceTimersByTime(1000);
        vi.advanceTimersByTime(5000);
        expect(runs).toHaveLength(1);

        runs[0]!.resolve(1);
        await vi.advanceTimersByTimeAsync(999);
        expect(runs).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(2);
    });

    it('pauses while hidden and refreshes once when shown', () => {
        const { poller, visibility } = createPoller();
        const refresh = vi.fn();
        poller.subscribe('component:hidden', 1, refresh);

        visibility.setState('hidden');
        vi.advanceTimersByTime(10_000);
        expect(refresh).not.toHaveBeenCalled();

        visibility.setState('visible');
        visibility.setState('visible');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('keeps one refresh when the tab becomes visible during a request', async () => {
        const { poller, visibility } = createPoller();
        const runs = watchPolls(poller, 'component:resume-busy');

        vi.advanceTimersByTime(1000);
        visibility.setState('hidden');
        visibility.setState('visible');
        visibility.setState('hidden');
        visibility.setState('visible');
        expect(runs).toHaveLength(1);

        runs[0]!.resolve(1);
        await vi.waitFor(() => expect(runs).toHaveLength(2));
    });

    it('backs off after errors and resets after success', async () => {
        const { poller } = createPoller();
        const runs = watchPolls(poller, 'derived:backoff');

        vi.advanceTimersByTime(1000);
        runs[0]!.reject(new Error('first'));
        await vi.advanceTimersByTimeAsync(999);
        expect(runs).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(2);

        runs[1]!.reject(new Error('second'));
        await vi.advanceTimersByTimeAsync(1999);
        expect(runs).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(3);

        runs[2]!.resolve(3);
        await vi.advanceTimersByTimeAsync(999);
        expect(runs).toHaveLength(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(4);
    });

    it('resets errors when a run succeeds while hidden', async () => {
        const { poller, visibility } = createPoller();
        const runs = watchPolls(poller, 'derived:hidden-success');

        vi.advanceTimersByTime(1000);
        runs[0]!.reject(new Error('first'));
        await vi.advanceTimersByTimeAsync(1000);
        visibility.setState('hidden');
        runs[1]!.resolve(2);
        await expect(runs[1]!.result).resolves.toBe(2);
        visibility.setState('visible');
        await vi.waitFor(() => expect(runs).toHaveLength(3));

        runs[2]!.reject(new Error('after success'));
        await vi.advanceTimersByTimeAsync(999);
        expect(runs).toHaveLength(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(4);
    });

    it('keeps Retry-After when an error finishes while hidden', async () => {
        const { poller, visibility } = createPoller();
        const runs = watchPolls(poller, 'derived:hidden-retry-after');

        vi.advanceTimersByTime(1000);
        visibility.setState('hidden');
        runs[0]!.reject(
            markRetryAfter(
                new Error('busy'),
                new Response(null, {
                    headers: { 'Retry-After': '5' },
                })
            )
        );
        await Promise.resolve();
        visibility.setState('visible');
        await vi.advanceTimersByTimeAsync(4999);
        expect(runs).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(2);
    });

    it('keeps jitter inside the configured bound', () => {
        const early = createPoller(undefined, { jitterRatio: 0.1, random: () => 0 }).poller;
        const late = createPoller(undefined, { jitterRatio: 0.1, random: () => 1 }).poller;
        const earlyRefresh = vi.fn();
        const lateRefresh = vi.fn();

        early.subscribe('early', 1, earlyRefresh);
        late.subscribe('late', 1, lateRefresh);

        vi.advanceTimersByTime(899);
        expect(earlyRefresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(earlyRefresh).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(199);
        expect(lateRefresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(lateRefresh).toHaveBeenCalledTimes(1);
    });

    it('caps jittered error backoff at one minute', async () => {
        const { poller } = createPoller(undefined, { jitterRatio: 0.1, random: () => 1 });
        const runs = watchPolls(poller, 'derived:max-backoff', 60);

        vi.advanceTimersByTime(66_000);
        runs[0]!.reject(new Error('failed'));
        await vi.advanceTimersByTimeAsync(59_999);
        expect(runs).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(runs).toHaveLength(2);
    });

    it('shortens the timer when a faster consumer starts watching', () => {
        const { poller } = createPoller();
        const slow = vi.fn();
        const fast = vi.fn();

        poller.subscribe('shared', 60, slow);
        vi.advanceTimersByTime(100);
        poller.subscribe('shared', 1, fast);
        vi.advanceTimersByTime(999);
        expect(fast).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(fast).toHaveBeenCalledTimes(1);
        expect(slow).not.toHaveBeenCalled();
    });

    it('uses the latest refresh callback without restarting its timer', () => {
        const firstRefresh = vi.fn();
        const latestRefresh = vi.fn();
        const rendered = renderHook(
            ({ refresh }) => {
                usePolling('derived:latest-refresh', 1, refresh);
            },
            { initialProps: { refresh: firstRefresh } }
        );

        rendered.rerender({ refresh: latestRefresh });
        act(() => vi.advanceTimersByTime(1200));

        expect(firstRefresh).not.toHaveBeenCalled();
        expect(latestRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not let an old cleanup delete a new entry', async () => {
        const { poller } = createPoller();
        const firstCleanup = poller.subscribe('component:owned', 1, () => {});

        vi.advanceTimersByTime(1000);
        const old = defer<number>();
        const oldRun = poller.run({
            cause: 'poll',
            key: 'component:owned',
            read: () => ({ found: true, value: 0 }),
            work: (signal) => waitOrAbort(old.promise, signal),
            write: () => {},
        });
        firstCleanup();
        old.resolve(1);
        await oldRun;

        const refresh = vi.fn();
        poller.subscribe('component:owned', 1, refresh);
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(1000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('aborts the run when its final consumer unmounts', () => {
        const { poller } = createPoller();
        let signal: AbortSignal | undefined;
        const never = defer<number>();
        const unsubscribe = poller.subscribe('component:unmount', 1, () => {
            void poller.run({
                cause: 'poll',
                key: 'component:unmount',
                read: () => ({ found: true, value: 0 }),
                work: (runSignal) => {
                    signal = runSignal;
                    return never.promise;
                },
                write: () => {},
            });
        });

        vi.advanceTimersByTime(1000);
        unsubscribe();
        vi.advanceTimersByTime(0);
        expect(signal?.aborted).toBe(true);
    });

    it('keeps a run through an immediate StrictMode resubscribe', () => {
        const { poller } = createPoller();
        let signal: AbortSignal | undefined;
        const never = defer<number>();
        const subscribe = (): (() => void) =>
            poller.subscribe('component:strict-mode', 1, () => {
                void poller.run({
                    cause: 'poll',
                    key: 'component:strict-mode',
                    read: () => ({ found: true, value: 0 }),
                    work: (runSignal) => {
                        signal = runSignal;
                        return never.promise;
                    },
                    write: () => {},
                });
            });

        const firstCleanup = subscribe();
        vi.advanceTimersByTime(1000);
        firstCleanup();
        const secondCleanup = subscribe();
        vi.advanceTimersByTime(0);
        expect(signal?.aborted).toBe(false);

        secondCleanup();
        vi.advanceTimersByTime(0);
        expect(signal?.aborted).toBe(true);
    });

    it('aborts an initial suspended run when its rendered owner unmounts', () => {
        const { poller } = createPoller();
        const owner = 'component';
        let signal: AbortSignal | undefined;

        poller.commitOwner(owner, new Set(['derived:first-load']));
        void poller.run({
            cause: 'dependency',
            key: 'derived:first-load',
            work: (runSignal) => {
                signal = runSignal;
                return new Promise(() => {});
            },
            write: () => {},
        });
        poller.releaseOwner(owner);
        vi.advanceTimersByTime(0);

        expect(signal?.aborted).toBe(true);
    });

    it('keeps an initial run through a StrictMode owner remount', () => {
        const { poller } = createPoller();
        const owner = 'component';
        let signal: AbortSignal | undefined;

        poller.commitOwner(owner, new Set(['derived:first-load']));
        void poller.run({
            cause: 'dependency',
            key: 'derived:first-load',
            work: (runSignal) => {
                signal = runSignal;
                return new Promise(() => {});
            },
            write: () => {},
        });
        poller.releaseOwner(owner);
        poller.commitOwner(owner, new Set(['derived:first-load']));
        vi.advanceTimersByTime(0);

        expect(signal?.aborted).toBe(false);
    });

    it('aborts work dropped by the next committed owner render', () => {
        const { poller } = createPoller();
        const owner = 'component';
        let oldSignal: AbortSignal | undefined;

        poller.commitOwner(owner, new Set(['derived:old']));
        void poller.run({
            cause: 'dependency',
            key: 'derived:old',
            work: (signal) => {
                oldSignal = signal;
                return new Promise(() => {});
            },
            write: () => {},
        });

        poller.commitOwner(owner, new Set(['derived:new']));

        expect(oldSignal?.aborted).toBe(true);
    });

    it('keeps a shared key until its last committed hook unmounts', () => {
        const { poller } = createPoller();
        const owner = 'component';
        const firstHook = 'first';
        const secondHook = 'second';
        let signal: AbortSignal | undefined;

        poller.mountKey(owner, firstHook, 'derived:shared');
        poller.mountKey(owner, secondHook, 'derived:shared');
        void poller.run({
            cause: 'dependency',
            key: 'derived:shared',
            work: (runSignal) => {
                signal = runSignal;
                return new Promise(() => {});
            },
            write: () => {},
        });

        poller.unmountKey(owner, firstHook, 'derived:shared');
        vi.advanceTimersByTime(0);
        expect(signal?.aborted).toBe(false);

        poller.unmountKey(owner, secondHook, 'derived:shared');
        vi.advanceTimersByTime(0);
        expect(signal?.aborted).toBe(true);
    });

    it('waits through every newer dependency run before returning', async () => {
        const { poller } = createPoller();
        let saved = 'old';
        const a = defer<string>();
        const b = defer<string>();
        const c = defer<string>();
        const start = (inputKey: string, work: Deferred<string>): Promise<string> =>
            poller.run({
                cause: 'dependency',
                inputKey,
                key: 'derived:freshness',
                read: () => ({ found: true, value: saved }),
                work: (signal) => waitOrAbort(work.promise, signal),
                write: (value) => {
                    saved = value;
                },
            });

        const runA = start('a', a);
        const runB = start('b', b);
        const runC = start('c', c);
        c.resolve('new');

        await expect(runC).resolves.toBe('new');
        await expect(runB).resolves.toBe('new');
        await expect(runA).resolves.toBe('new');
        expect(saved).toBe('new');
    });

    it('shares one promise and one fetch for matching input', async () => {
        const { poller } = createPoller();
        const result = defer<number>();
        const work = vi.fn(() => result.promise);
        const write = vi.fn();
        const options = {
            cause: 'dependency' as const,
            inputKey: 'same',
            key: 'derived:shared',
            work,
            write,
        };

        const first = poller.run(options);
        const second = poller.run(options);
        expect(second).toBe(first);
        expect(work).toHaveBeenCalledTimes(1);

        result.resolve(42);
        await expect(first).resolves.toBe(42);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('shares matching extras and keeps different extras apart', () => {
        const { poller } = createPoller();
        const sharedRefresh = vi.fn();
        const otherExtrasRefresh = vi.fn();

        poller.subscribe('dv:headers-a', 1, sharedRefresh);
        poller.subscribe('dv:headers-a', 1, sharedRefresh);
        poller.subscribe('dv:headers-b', 1, otherExtrasRefresh);
        vi.advanceTimersByTime(1000);

        expect(sharedRefresh).toHaveBeenCalledTimes(1);
        expect(otherExtrasRefresh).toHaveBeenCalledTimes(1);
    });

    it('passes an outer abort to the run', () => {
        const { poller } = createPoller();
        const navigation = new AbortController();
        let signal: AbortSignal | undefined;

        void poller.run({
            cause: 'dependency',
            key: 'derived:navigation',
            signal: navigation.signal,
            work: (runSignal) => {
                signal = runSignal;
                return new Promise(() => {});
            },
            write: () => {},
        });
        navigation.abort();

        expect(signal?.aborted).toBe(true);
    });
});

describe('parseRetryAfter', () => {
    it('parses delay seconds and HTTP dates', () => {
        expect(
            parseRetryAfter(
                new Response(null, {
                    headers: { 'Retry-After': '3' },
                })
            )
        ).toBe(3000);

        expect(
            parseRetryAfter(
                new Response(null, {
                    headers: { 'Retry-After': 'Mon, 03 Aug 2026 12:00:05 GMT' },
                }),
                Date.parse('Mon, 03 Aug 2026 12:00:00 GMT')
            )
        ).toBe(5000);
    });
});
