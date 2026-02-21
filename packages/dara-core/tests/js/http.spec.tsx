import { waitFor } from '@testing-library/dom';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { request } from '@/api';
import { setSessionIdentifier, setSessionToken } from '@/auth/use-session-token';

const REFRESH_TOKEN_NAME = 'dara_refresh_token';
const REFRESH_TOKEN = 'REFRESH';

const refreshAttempted = vi.fn();
const requested401 = vi.fn();
const requested403 = vi.fn();

let delay: Promise<void> | null = null;
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

    // mock refresh token endpoint
    http.post('/api/auth/refresh-token', async (info) => {
        refreshAttempted();

        if (info.cookies.dara_refresh_token === REFRESH_TOKEN) {
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
        hasValidSession = false;
    });

    afterEach(() => {
        // force delete the cookie by making it expire
        document.cookie = `${REFRESH_TOKEN_NAME}=; Expires=1 Jan 1970 00:00:00 GMT`;
        setSessionToken(null);
        setSessionIdentifier(null);
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    it('attempts to refresh the token if 402 or 403 occurs, failing if no refresh token is present', async () => {
        const res = await request('/error-401', { method: 'GET' });
        expect(res.status).toBe(401);
        expect(refreshAttempted).toHaveBeenCalledTimes(1);

        const res2 = await request('/error-403', { method: 'GET' });
        expect(res2.status).toBe(403);
        expect(refreshAttempted).toHaveBeenCalledTimes(2);
    });

    it('refreshes the token and retries the request', async () => {
        // set a cookie, in reality it would be http-only etc
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

        const res = await request('/error-401');
        expect(res.status).toBe(200);
        expect(refreshAttempted).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({ success: true });
    });

    it('concurrent requests only refresh the token once', async () => {
        // set a cookie, in reality it would be http-only etc
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

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
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

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

    it('request made while refresh is occuring waits for the refresh to complete', async () => {
        // set a cookie, in reality it would be http-only etc
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

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
        const res2Promise = request('/error-403');

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
        // first request was made twice
        expect(requested401).toHaveBeenCalledTimes(2);
        // the second request should not have made a request until it got the new token
        expect(requested403).toHaveBeenCalledTimes(1);
    });
});
