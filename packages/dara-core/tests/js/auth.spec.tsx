import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import {
    getSessionIdentifier,
    handleAuthErrors,
    parseLoginReferrer,
    resolveReferrer,
    resolveLoginReferrer,
    setSessionIdentifier,
    verifySessionToken,
} from '@/auth';
import { getAuthOriginRecommendation, shouldWarnAboutInsecureAuthContext } from '@/auth/origin-security';

const server = setupServer();

async function handleAuthError(
    reason: string,
    status: number,
    options: Parameters<typeof handleAuthErrors>[1] = {}
): Promise<boolean> {
    return handleAuthErrors(
        Response.json(
            {
                detail: {
                    message: 'Auth failed',
                    reason,
                },
            },
            { status }
        ),
        options
    );
}

beforeAll(() => server.listen());

afterEach(() => server.resetHandlers());

afterAll(() => server.close());

describe('resolve_referrer', () => {
    const originalWindowLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/test/route'),
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        });
    });

    it('should resolve the full path when no base_url is set', () => {
        window.dara = {
            base_url: 'https://test.com/',
        };

        expect(resolveReferrer()).toBe('%2Ftest%2Froute');
    });

    it("should remove the path part of the base_url when it's set", () => {
        window.dara = {
            base_url: 'https://test.com/test',
        };

        expect(resolveReferrer()).toBe('%2Froute');
    });
});

describe('parseLoginReferrer', () => {
    it('parses the referrer query param once', () => {
        const search = '?referrer=%2Ffiles%2Ffoo%252Fbar%3Fx%3Da%252Fb';

        expect(parseLoginReferrer(search, '/default')).toBe('/files/foo%2Fbar?x=a%2Fb');
    });

    it('falls back to the default path when no referrer is present', () => {
        expect(parseLoginReferrer('?other=value', '/default')).toBe('/default');
    });
});

describe('resolveLoginReferrer', () => {
    const originalWindowLocation = window.location;

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        });
    });

    it('preserves an existing referrer in encoded form', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/login?referrer=%2Ffiles%2Ffoo%252Fbar%3Fx%3Da%252Fb'),
        });

        expect(resolveLoginReferrer()).toBe('%2Ffiles%2Ffoo%252Fbar%3Fx%3Da%252Fb');
    });
});

describe('verifySessionToken', () => {
    const originalWindowLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/test/route'),
        });

        window.dara = {
            base_url: 'https://test.com',
        };
        setSessionIdentifier('existing-session');
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        });
        setSessionIdentifier(null);
    });

    it('returns verified and stores the latest session id when verification succeeds', async () => {
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json('verified-session');
            })
        );

        await expect(verifySessionToken()).resolves.toBe('verified');
        expect(getSessionIdentifier()).toBe('verified-session');
    });

    it('returns login required for expired sessions without handling the redirect itself', async () => {
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(
                    {
                        detail: {
                            message: 'Session expired',
                            reason: 'expired',
                        },
                    },
                    { status: 401 }
                );
            })
        );

        await expect(verifySessionToken()).resolves.toBe('login_required');
        expect(window.location.pathname).toBe('/test/route');
        expect(getSessionIdentifier()).toBe(null);
    });

    it('handles authorization failures as errors instead of reporting login required', async () => {
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(
                    {
                        detail: {
                            message: 'Unauthorized',
                            reason: 'unauthorized',
                        },
                    },
                    { status: 403 }
                );
            })
        );

        await expect(verifySessionToken()).resolves.toBe('handled_auth_error');
        expect(window.location.pathname).toBe('/error');
        expect(window.location.search).toBe('?code=403');
        expect(getSessionIdentifier()).toBe('existing-session');
    });

    it('handles provider failures as errors instead of reporting login required', async () => {
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(
                    {
                        detail: {
                            message: 'Identity provider authorization failed',
                            reason: 'other',
                        },
                    },
                    { status: 401 }
                );
            })
        );

        await expect(verifySessionToken()).resolves.toBe('handled_auth_error');
        expect(window.location.pathname).toBe('/error');
        expect(window.location.search).toBe('?code=401');
        expect(getSessionIdentifier()).toBe('existing-session');
    });
});

describe('handleAuthErrors', () => {
    const originalWindowLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/test/route'),
        });

        window.dara = {
            base_url: 'https://test.com',
        };
        setSessionIdentifier('session-id');
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        });
        setSessionIdentifier(null);
    });

    it('redirects authentication failures to login by default', async () => {
        const handled = await handleAuthError('expired', 401);

        expect(handled).toBe(true);
        expect(window.location.pathname).toBe('/login');
        expect(window.location.search).toContain('referrer=%2Ftest%2Froute');
        expect(getSessionIdentifier()).toBe(null);
    });

    it('preserves an existing encoded login referrer when redirecting back to login', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/login?referrer=%2Ffiles%2Ffoo%252Fbar%3Fx%3Da%252Fb'),
        });

        const handled = await handleAuthError('expired', 401);

        expect(handled).toBe(true);
        expect(window.location.pathname).toBe('/login');
        expect(window.location.search).toBe('?referrer=%2Ffiles%2Ffoo%252Fbar%3Fx%3Da%252Fb');
        expect(getSessionIdentifier()).toBe(null);
    });

    it('redirects authorization failures to the error page even when login is requested', async () => {
        const handled = await handleAuthError('unauthorized', 403, { authenticationFailureRedirect: 'login' });

        expect(handled).toBe(true);
        expect(window.location.pathname).toBe('/error');
        expect(window.location.search).toBe('?code=403');
        expect(getSessionIdentifier()).toBe('session-id');
    });

    it('redirects provider failures to the error page even when login is requested', async () => {
        const handled = await handleAuthError('other', 401, { authenticationFailureRedirect: 'login' });

        expect(handled).toBe(true);
        expect(window.location.pathname).toBe('/error');
        expect(window.location.search).toBe('?code=401');
        expect(getSessionIdentifier()).toBe('session-id');
    });

    it('can redirect authentication failures to the error page', async () => {
        const handled = await handleAuthError('invalid_token', 401, { authenticationFailureRedirect: 'error' });

        expect(handled).toBe(true);
        expect(window.location.pathname).toBe('/error');
        expect(window.location.search).toBe('?code=401');
        expect(getSessionIdentifier()).toBe('session-id');
    });
});

describe('shouldWarnAboutInsecureAuthContext', () => {
    it('returns false for secure contexts', () => {
        expect(
            shouldWarnAboutInsecureAuthContext({
                isSecureContext: true,
            })
        ).toBe(false);
    });

    it('returns true for insecure contexts', () => {
        expect(
            shouldWarnAboutInsecureAuthContext({
                isSecureContext: false,
            })
        ).toBe(true);
    });
});

describe('getAuthOriginRecommendation', () => {
    it('recommends localhost when served from 0.0.0.0', () => {
        expect(
            getAuthOriginRecommendation({
                host: '0.0.0.0:8001',
                hostname: '0.0.0.0',
                pathname: '/app',
            })
        ).toBe('http://localhost:8001/app');
    });

    it('recommends https for non-localhost origins', () => {
        expect(
            getAuthOriginRecommendation({
                host: 'example.com:8080',
                hostname: 'example.com',
                pathname: '/auth',
            })
        ).toBe('https://example.com:8080/auth');
    });

    it('does not append query params or hash fragments', () => {
        expect(
            getAuthOriginRecommendation({
                host: '0.0.0.0:8001',
                hostname: '0.0.0.0',
                pathname: '/login',
            })
        ).toBe('http://localhost:8001/login');
    });
});
