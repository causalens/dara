import { waitFor } from '@testing-library/dom';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

import { request } from '@/api';
import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

const VALID_TOKEN = 'VALID';
const REFRESH_TOKEN_NAME = 'dara_refresh_token';
const REFRESH_TOKEN = 'REFRESH';

const refreshAttempted = jest.fn();
const requested401 = jest.fn();
const requested403 = jest.fn();

let delay: Promise<void> | null = null;

const server = setupServer(
    // example authenticated endpoints
    rest.get('/error-401', (req, res, ctx) => {
        requested401();
        if (req.headers.get('Authorization') === `Bearer ${VALID_TOKEN}`) {
            return res(ctx.json({ success: true }));
        }

        return res(ctx.status(401), ctx.json({ detail: 'Authentication error' }));
    }),
    rest.get('/error-403', (req, res, ctx) => {
        requested403();
        if (req.headers.get('Authorization') === `Bearer ${VALID_TOKEN}`) {
            return res(ctx.json({ success: true }));
        }

        return res(ctx.status(403), ctx.json({ detail: 'Authorization error' }));
    }),

    // mock refresh token endpoint
    rest.post('/api/auth/refresh-token', async (req, res, ctx) => {
        refreshAttempted();

        if (req.cookies.dara_refresh_token === REFRESH_TOKEN) {
            if (delay) {
                // simulate a delay in refreshing the token
                await delay;
            }
            return res(ctx.json({ token: VALID_TOKEN }));
        }

        return res(ctx.status(400));
    })
);

describe('HTTP Utils', () => {
    beforeEach(() => {
        delay = null;
        server.listen();
    });

    afterEach(() => {
        // force delete the cookie by making it expire
        document.cookie = `${REFRESH_TOKEN_NAME}=; Expires=1 Jan 1970 00:00:00 GMT`;
        globalStore.clear();
        globalStore.setValue(getTokenKey(), null);
        jest.clearAllTimers();
        jest.useRealTimers();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    it('attempts to refresh the token if 401 or 403 occurs, failing if no refresh token is present', async () => {
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

        // in reality requests are same-origin so credentials are passed automatically
        const res = await request('/error-401', { method: 'GET', credentials: 'include' });
        expect(res.status).toBe(200);
        expect(refreshAttempted).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({ success: true });
    });

    it('concurrent requests only refresh the token once', async () => {
        // set a cookie, in reality it would be http-only etc
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

        const requestCount = 30;

        const responses = await Promise.all(
            Array.from({ length: requestCount }, () => request('/error-401', { method: 'GET', credentials: 'include' }))
        );

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

    it('request made while refresh is occuring waits for the refresh to complete', async () => {
        // set a cookie, in reality it would be http-only etc
        document.cookie = `${REFRESH_TOKEN_NAME}=${REFRESH_TOKEN}; `;

        // set a delay on the refresh to simulate a slow response
        let resolve;
        delay = new Promise((r) => {
            resolve = r;
        });

        // make one request to trigger the refresh
        const resPromise = request('/error-401', { method: 'GET', credentials: 'include' });

        // wait for first request to start refreshing
        await waitFor(() => expect(refreshAttempted).toHaveBeenCalledTimes(1));
        expect(requested401).toHaveBeenCalledTimes(1);

        // make another request while the refresh is still in progress
        const res2Promise = request('/error-403', { method: 'GET', credentials: 'include' });

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
