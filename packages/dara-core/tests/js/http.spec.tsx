import { waitFor } from '@testing-library/dom';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { request } from '@/api';
import { SESSION_REFRESHED_EVENT } from '@/api/events';
import { setSessionIdentifier, waitForOngoingSessionRefresh, withSessionRefreshLock } from '@/auth/session-state';

const refreshAttempted = vi.fn();
const requested401 = vi.fn();
const requested403 = vi.fn();

let delay: Promise<void> | null = null;
let canRefreshSession = false;
let hasValidSession = false;

interface LockManagerMock {
    request: <T>(name: string, callback: () => Promise<T> | T) => Promise<T>;
}

interface NavigatorWithOptionalLocks extends Navigator {
    locks?: LockManagerMock;
}

const server = setupServer(
    // example authenticated endpoints
    http.get('/error-401', () => {
        requested401();
        if (hasValidSession) {
            return HttpResponse.json({ success: true });
        }

        return HttpResponse.json({ detail: 'Authentication error' }, { status: 401 });
    }),
    http.get('/error-403', () => {
        requested403();
        if (hasValidSession) {
            return HttpResponse.json({ success: true });
        }

        return HttpResponse.json({ detail: 'Authorization error' }, { status: 403 });
    }),
    http.post('/api/auth/verify-session', () => {
        return HttpResponse.json({ detail: { message: 'Session has expired', reason: 'expired' } }, { status: 401 });
    }),

    // mock refresh token endpoint
    http.post('/api/auth/refresh-token', async () => {
        refreshAttempted();

        if (canRefreshSession) {
            if (delay) {
                // simulate a delay in refreshing the token
                await delay;
            }
            hasValidSession = true;
            return HttpResponse.json({ success: true });
        }

        return HttpResponse.json({}, { status: 400 });
    })
);

describe('HTTP Utils', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        delay = null;
        canRefreshSession = false;
        hasValidSession = false;
    });

    afterEach(() => {
        setSessionIdentifier(null);
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    it('attempts to refresh the token on 401, failing if the session cannot be refreshed', async () => {
        const res = await request('/error-401', { method: 'GET' });
        expect(res.status).toBe(401);
        expect(refreshAttempted).toHaveBeenCalledTimes(1);
    });

    it('does not attempt to refresh the token on 403', async () => {
        canRefreshSession = true;

        const res = await request('/error-403', { method: 'GET' });
        expect(res.status).toBe(403);
        expect(refreshAttempted).not.toHaveBeenCalled();
    });

    it('does not attempt to refresh when refreshOnUnauthorized is false', async () => {
        canRefreshSession = true;

        const res = await request('/api/auth/verify-session', { method: 'POST', refreshOnUnauthorized: false });
        expect(res.status).toBe(401);
        expect(refreshAttempted).not.toHaveBeenCalled();
    });

    it('refreshes the token and retries the request', async () => {
        canRefreshSession = true;

        const res = await request('/error-401');
        expect(res.status).toBe(200);
        expect(refreshAttempted).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({ success: true });
    });

    it('emits a refresh success event when the token refresh succeeds', async () => {
        canRefreshSession = true;

        const refreshEventSpy = vi.fn();
        window.addEventListener(SESSION_REFRESHED_EVENT, refreshEventSpy);

        try {
            const res = await request('/error-401');
            expect(res.status).toBe(200);
            expect(refreshEventSpy).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener(SESSION_REFRESHED_EVENT, refreshEventSpy);
        }
    });

    it('concurrent requests only refresh the token once', async () => {
        canRefreshSession = true;

        const requestCount = 30;

        const responses = await Promise.all(Array.from({ length: requestCount }, () => request('/error-401')));

        for (const res of responses) {
            expect(res.status).toBe(200);
            // eslint-disable-next-line no-await-in-loop
            expect(await res.json()).toEqual({ success: true });
        }

        // token was only refreshed once, the other requests were waiting for the refresh to complete
        expect(refreshAttempted).toHaveBeenCalledTimes(1);
    });

    it("concurrent requests don't attempt refresh twice even if refresh fails", async () => {
        const requestCount = 30;

        const responses = await Promise.all(
            Array.from({ length: requestCount }, () => request('/error-401', { method: 'GET' }))
        );

        responses.forEach((res) => {
            expect(res.status).toBe(401);
        });

        expect(refreshAttempted).toHaveBeenCalledTimes(1);
        expect(requested401).toHaveBeenCalledTimes(requestCount);
    });

    it('uses the web locks api for refresh coordination when available', async () => {
        canRefreshSession = true;

        const nav = navigator as NavigatorWithOptionalLocks;
        const originalLocks = nav.locks;
        const lockRequestSpy = vi.fn();
        const lockManager: LockManagerMock = {
            request: (name, callback) => {
                lockRequestSpy(name);
                return Promise.resolve(callback());
            },
        };

        Object.defineProperty(nav, 'locks', {
            configurable: true,
            value: lockManager,
        });

        try {
            const res = await request('/error-401');
            expect(res.status).toBe(200);
            expect(lockRequestSpy).toHaveBeenCalled();
        } finally {
            Object.defineProperty(nav, 'locks', {
                configurable: true,
                value: originalLocks,
            });
        }
    });

    it('falls back to in-tab refresh coordination when web locks api is unavailable', async () => {
        canRefreshSession = true;

        const nav = navigator as NavigatorWithOptionalLocks;
        const originalLocks = nav.locks;

        Object.defineProperty(nav, 'locks', {
            configurable: true,
            value: undefined,
        });

        try {
            const responses = await Promise.all([request('/error-401'), request('/error-401')]);
            expect(responses.map((res) => res.status)).toEqual([200, 200]);
            expect(refreshAttempted).toHaveBeenCalledTimes(1);
        } finally {
            Object.defineProperty(nav, 'locks', {
                configurable: true,
                value: originalLocks,
            });
        }
    });

    it('waitForOngoingSessionRefresh waits for async lock callbacks when web locks api is unavailable', async () => {
        const nav = navigator as NavigatorWithOptionalLocks;
        const originalLocks = nav.locks;
        let refreshCompleted = false;

        Object.defineProperty(nav, 'locks', {
            configurable: true,
            value: undefined,
        });

        try {
            const lockPromise = withSessionRefreshLock(async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                refreshCompleted = true;
            });

            await waitForOngoingSessionRefresh();
            expect(refreshCompleted).toBe(true);
            await lockPromise;
        } finally {
            Object.defineProperty(nav, 'locks', {
                configurable: true,
                value: originalLocks,
            });
        }
    });

    it('request made while refresh is occuring waits for the refresh to complete', async () => {
        canRefreshSession = true;

        // set a delay on the refresh to simulate a slow response
        let resolve;
        delay = new Promise((r) => {
            resolve = r;
        });

        // make one request to trigger the refresh
        const resPromise = request('/error-401');

        // wait for first request to start refreshing
        await waitFor(() => expect(refreshAttempted).toHaveBeenCalledTimes(1));
        expect(requested401).toHaveBeenCalledTimes(1);

        // make another request while the refresh is still in progress
        const res2Promise = request('/error-401');

        resolve();
        delay = null;

        // both requests should resolve successfully
        const res = await resPromise;
        const res2 = await res2Promise;

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });

        expect(res2.status).toBe(200);
        expect(await res2.json()).toEqual({ success: true });

        expect(refreshAttempted).toHaveBeenCalledTimes(1);
        // first request was made twice; the second request waited and only sent after refresh completed
        expect(requested401).toHaveBeenCalledTimes(3);
    });
});
