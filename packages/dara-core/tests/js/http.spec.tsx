import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { request } from '@/api';

const requested401 = vi.fn();
const requested403 = vi.fn();

const server = setupServer(
    http.get('/error-401', () => {
        requested401();
        return HttpResponse.json({ detail: 'Authentication error' }, { status: 401 });
    }),
    http.get('/error-403', () => {
        requested403();
        return HttpResponse.json({ detail: 'Authorization error' }, { status: 403 });
    }),
    http.post('/inspect-headers', ({ request: req }) => {
        return HttpResponse.json({
            accept: req.headers.get('Accept'),
            contentType: req.headers.get('Content-Type'),
        });
    })
);

describe('HTTP Utils', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
        server.resetHandlers();
    });

    afterAll(() => server.close());

    it('returns 401 responses without attempting client-side refresh', async () => {
        const res = await request('/error-401', { method: 'GET' });

        expect(res.status).toBe(401);
        expect(requested401).toHaveBeenCalledTimes(1);
    });

    it('returns 403 responses unchanged', async () => {
        const res = await request('/error-403', { method: 'GET' });

        expect(res.status).toBe(403);
        expect(requested403).toHaveBeenCalledTimes(1);
    });

    it('sets default json headers for request bodies', async () => {
        const res = await request('/inspect-headers', {
            body: JSON.stringify({ ok: true }),
            method: 'POST',
        });

        expect(await res.json()).toEqual({
            accept: 'application/json',
            contentType: 'application/json',
        });
    });
});
