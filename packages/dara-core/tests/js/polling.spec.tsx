import {
    PollingCoordinator,
    assertCurrentRequest,
    parseRetryAfter,
} from '@/shared/interactivity/polling';

class VisibilityTarget extends EventTarget {
    state: DocumentVisibilityState = 'visible';

    setState(state: DocumentVisibilityState): void {
        this.state = state;
        this.dispatchEvent(new Event('visibilitychange'));
    }
}

describe('PollingCoordinator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    function createCoordinator(
        visibility = new VisibilityTarget(),
        options: { jitterRatio?: number; random?: () => number } = {}
    ): { coordinator: PollingCoordinator; visibility: VisibilityTarget } {
        return {
            coordinator: new PollingCoordinator({
                getVisibilityState: () => visibility.state,
                jitterRatio: options.jitterRatio ?? 0,
                random: options.random,
                visibilityTarget: visibility,
            }),
            visibility,
        };
    }

    it('allows one active poll and coalesces busy refreshes into one trailing request', () => {
        const { coordinator } = createCoordinator();
        const handles: ReturnType<PollingCoordinator['startRequest']>[] = [];
        let active = 0;
        let peak = 0;

        coordinator.subscribe('derived:one', 1, () => {
            const handle = coordinator.startRequest('derived:one', 'poll');
            handles.push(handle);
            active++;
            peak = Math.max(peak, active);
        });

        vi.advanceTimersByTime(1000);
        expect(handles).toHaveLength(1);

        coordinator.requestRefresh('derived:one');
        coordinator.requestRefresh('derived:one');
        coordinator.requestRefresh('derived:one');
        expect(handles).toHaveLength(1);

        active--;
        handles[0]!.finish({ status: 'success' });
        expect(handles).toHaveLength(2);

        active--;
        handles[1]!.finish({ status: 'success' });
        expect(peak).toBe(1);
    });

    it('uses fixed delay measured from request completion', () => {
        const { coordinator } = createCoordinator();
        const handles: ReturnType<PollingCoordinator['startRequest']>[] = [];

        coordinator.subscribe('derived:fixed-delay', 1, () => {
            handles.push(coordinator.startRequest('derived:fixed-delay', 'poll'));
        });

        vi.advanceTimersByTime(1000);
        expect(handles).toHaveLength(1);

        vi.advanceTimersByTime(5000);
        expect(handles).toHaveLength(1);

        handles[0]!.finish({ status: 'success' });
        vi.advanceTimersByTime(999);
        expect(handles).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(handles).toHaveLength(2);
    });

    it('pauses while hidden and performs exactly one prompt refresh on resume', () => {
        const { coordinator, visibility } = createCoordinator();
        const refresh = vi.fn(() => coordinator.startRequest('component:hidden', 'poll'));

        coordinator.subscribe('component:hidden', 1, refresh);
        visibility.setState('hidden');
        vi.advanceTimersByTime(10_000);
        expect(refresh).not.toHaveBeenCalled();

        visibility.setState('visible');
        expect(refresh).toHaveBeenCalledTimes(1);
        visibility.setState('visible');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('coalesces a visibility resume that occurs while a request is active', () => {
        const { coordinator, visibility } = createCoordinator();
        const handles: ReturnType<PollingCoordinator['startRequest']>[] = [];
        coordinator.subscribe('component:resume-busy', 1, () => {
            handles.push(coordinator.startRequest('component:resume-busy', 'poll'));
        });

        vi.advanceTimersByTime(1000);
        visibility.setState('hidden');
        visibility.setState('visible');
        visibility.setState('hidden');
        visibility.setState('visible');
        expect(handles).toHaveLength(1);

        handles[0]!.finish({ status: 'success' });
        expect(handles).toHaveLength(2);
    });

    it('backs off exponentially after errors and resets after success', () => {
        const { coordinator } = createCoordinator();
        const handles: ReturnType<PollingCoordinator['startRequest']>[] = [];
        coordinator.subscribe('derived:backoff', 1, () => {
            handles.push(coordinator.startRequest('derived:backoff', 'poll'));
        });

        vi.advanceTimersByTime(1000);
        handles[0]!.finish({ status: 'error' });
        vi.advanceTimersByTime(999);
        expect(handles).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(handles).toHaveLength(2);

        handles[1]!.finish({ status: 'error' });
        vi.advanceTimersByTime(1999);
        expect(handles).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(handles).toHaveLength(3);

        handles[2]!.finish({ status: 'success' });
        vi.advanceTimersByTime(999);
        expect(handles).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(handles).toHaveLength(4);
    });

    it('respects Retry-After when it exceeds exponential backoff', () => {
        const { coordinator } = createCoordinator();
        const handles: ReturnType<PollingCoordinator['startRequest']>[] = [];
        coordinator.subscribe('derived:retry-after', 1, () => {
            handles.push(coordinator.startRequest('derived:retry-after', 'poll'));
        });

        vi.advanceTimersByTime(1000);
        handles[0]!.finish({ status: 'error', retryAfterMs: 5000 });
        vi.advanceTimersByTime(4999);
        expect(handles).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(handles).toHaveLength(2);
    });

    it('keeps ordinary jitter inside the configured bound', () => {
        const early = createCoordinator(undefined, { jitterRatio: 0.1, random: () => 0 }).coordinator;
        const late = createCoordinator(undefined, { jitterRatio: 0.1, random: () => 1 }).coordinator;
        const earlyRefresh = vi.fn();
        const lateRefresh = vi.fn();

        early.subscribe('early', 1, earlyRefresh);
        late.subscribe('late', 1, lateRefresh);

        vi.advanceTimersByTime(899);
        expect(earlyRefresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(earlyRefresh).toHaveBeenCalledTimes(1);
        expect(lateRefresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(199);
        expect(lateRefresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(lateRefresh).toHaveBeenCalledTimes(1);
    });

    it('aborts the owned request when its final rendered consumer unmounts', () => {
        const { coordinator } = createCoordinator();
        let request: ReturnType<PollingCoordinator['startRequest']> | undefined;
        const unsubscribe = coordinator.subscribe('component:unmount', 1, () => {
            request = coordinator.startRequest('component:unmount', 'poll');
        });

        vi.advanceTimersByTime(1000);
        unsubscribe();
        vi.advanceTimersByTime(0);

        expect(request?.signal.aborted).toBe(true);
    });

    it('does not abort an immediately reacquired StrictMode subscription', () => {
        const { coordinator } = createCoordinator();
        let request: ReturnType<PollingCoordinator['startRequest']> | undefined;
        const subscribe = (): (() => void) =>
            coordinator.subscribe('component:strict-mode', 1, () => {
                request = coordinator.startRequest('component:strict-mode', 'poll');
            });

        const firstCleanup = subscribe();
        vi.advanceTimersByTime(1000);
        firstCleanup();
        const secondCleanup = subscribe();
        vi.advanceTimersByTime(0);
        expect(request?.signal.aborted).toBe(false);

        secondCleanup();
        vi.advanceTimersByTime(0);
        expect(request?.signal.aborted).toBe(true);
    });

    it('aborts and makes a slow poll stale when a dependency request supersedes it', () => {
        const { coordinator } = createCoordinator();
        coordinator.subscribe('derived:freshness', 1, () => {});

        const poll = coordinator.startRequest('derived:freshness', 'poll');
        const dependency = coordinator.startRequest('derived:freshness', 'dependency');

        expect(poll.signal.aborted).toBe(true);
        expect(() => assertCurrentRequest(poll)).toThrowError(/superseded/);
        expect(dependency.signal.aborted).toBe(false);

        poll.finish({ status: 'aborted' });
        dependency.finish({ status: 'success' });
    });

    it('deduplicates shared consumers while keeping request-extras identities independent', () => {
        const { coordinator } = createCoordinator();
        const sharedRefresh = vi.fn(() => coordinator.startRequest('dv:headers-a', 'poll'));
        const otherExtrasRefresh = vi.fn(() => coordinator.startRequest('dv:headers-b', 'poll'));

        coordinator.subscribe('dv:headers-a', 1, sharedRefresh);
        coordinator.subscribe('dv:headers-a', 1, sharedRefresh);
        coordinator.subscribe('dv:headers-b', 1, otherExtrasRefresh);
        vi.advanceTimersByTime(1000);

        expect(sharedRefresh).toHaveBeenCalledTimes(1);
        expect(otherExtrasRefresh).toHaveBeenCalledTimes(1);
    });

    it('propagates external cancellation into the coordinator-owned signal', () => {
        const { coordinator } = createCoordinator();
        const navigation = new AbortController();
        const request = coordinator.startRequest('derived:navigation', 'dependency', navigation.signal);

        navigation.abort();

        expect(request.signal.aborted).toBe(true);
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
