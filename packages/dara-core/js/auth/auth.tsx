import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { z } from 'zod/v4';

import { HTTP_METHOD, RequestError, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { useRequestExtras } from '@/shared/context/request-extras-context';
import { type User, type UserData } from '@/types';

import { notifySessionLoggedOut, setSessionIdentifier } from './session-state';

export enum AuthenticationErrorReason {
    BAD_REQUEST = 'bad_request',
    EXPIRED_TOKEN = 'expired',
    INVALID_CREDENTIALS = 'invalid_credentials',
    INVALID_TOKEN = 'invalid_token',
    OTHER = 'other',
    UNAUTHORIZED = 'unauthorized',
}

interface AuthenticationError {
    message: string;
    reason: AuthenticationErrorReason;
}

export type AuthenticationFailureRedirect = 'login' | 'error';

export interface HandleAuthErrorsOptions {
    /**
     * Where to route authentication failures such as expired or invalid tokens.
     * Authorization, bad request, and provider failures always route to the error page.
     */
    authenticationFailureRedirect?: AuthenticationFailureRedirect;
    ignoreErrors?: Array<AuthenticationErrorReason>;
}

export type VerifySessionTokenResult = 'handled_auth_error' | 'login_required' | 'verified';

const AuthenticationErrorSchema = z.object({
    message: z.string(),
    reason: z.enum([
        AuthenticationErrorReason.BAD_REQUEST,
        AuthenticationErrorReason.EXPIRED_TOKEN,
        AuthenticationErrorReason.INVALID_CREDENTIALS,
        AuthenticationErrorReason.INVALID_TOKEN,
        AuthenticationErrorReason.OTHER,
        AuthenticationErrorReason.UNAUTHORIZED,
    ]),
});

/**
 * Whether a message is an authentication error
 *
 * @param message message
 */
function parseAuthenticationError(message: unknown): AuthenticationError | null {
    const parsed = AuthenticationErrorSchema.safeParse(message);
    if (!parsed.success) {
        return null;
    }
    return parsed.data;
}

/**
 * Whether the error should be ignored
 *
 * @param message error message
 * @param ignoreErrors error types to ignore
 */
function shouldIgnoreError(message: AuthenticationError, ignoreErrors: Array<AuthenticationError['reason']>): boolean {
    return ignoreErrors.includes(message.reason);
}

/**
 * Returns true if an auth error means the user does not have a usable app session.
 *
 * @param message error message
 */
function isAuthenticationFailure(message: AuthenticationError): boolean {
    return [
        AuthenticationErrorReason.INVALID_CREDENTIALS,
        AuthenticationErrorReason.EXPIRED_TOKEN,
        AuthenticationErrorReason.INVALID_TOKEN,
    ].includes(message.reason);
}

function getAuthErrorRedirect(
    message: AuthenticationError,
    authenticationFailureRedirect: AuthenticationFailureRedirect
): AuthenticationFailureRedirect {
    if (isAuthenticationFailure(message)) {
        return authenticationFailureRedirect;
    }

    return 'error';
}

interface RedirectResponse {
    redirect_uri: string;
}

interface SuccessResponse {
    success: boolean;
}

/**
 * Revoke the current session
 */
export async function revokeSession(): Promise<RedirectResponse | SuccessResponse | null> {
    try {
        const response = await request('/api/auth/revoke-session', {
            method: HTTP_METHOD.POST,
        });

        if (response.ok) {
            const responseData = await response.json();
            return responseData;
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to revoke session', e);
    }

    return null;
}

/**
 * Resolve the referrer url to be passed back to login, adjusted for the base path.
 */
export function resolveReferrer(): string {
    if (!window.dara.base_url) {
        return encodeURIComponent(window.location.pathname + window.location.search);
    }

    const base_url_path = new URL(window.dara.base_url, window.location.origin).pathname;
    const referrer = window.location.pathname;

    // Remove the matching part of the base_url from the referrer.
    let strippedReferrer = referrer.replace(base_url_path, '');

    // If this has stripped the leading / then replace it
    if (!strippedReferrer.startsWith('/')) {
        strippedReferrer = `/${strippedReferrer}`;
    }

    return encodeURIComponent(strippedReferrer + window.location.search);
}

/**
 * Helper function to handle auth errors in a response
 *
 * @param res the response object to check
 * @param options auth error handling options
 */
export async function handleAuthErrors(res: Response, options: HandleAuthErrorsOptions = {}): Promise<boolean> {
    const { authenticationFailureRedirect = 'login', ignoreErrors = [] } = options;

    // Bail out if the response is not an auth error, if we don't then non json responses can cause the following
    // code to hang.
    if (res.status >= 500 || res.status < 400) {
        return false;
    }

    const content = await res.clone().json();

    const authError = parseAuthenticationError(content?.detail);

    if (authError && !shouldIgnoreError(authError, ignoreErrors)) {
        // use existing referrer if available in case we were already redirected because of e.g. missing token
        const queryParams = new URLSearchParams(window.location.search);
        const referrer = queryParams.get('referrer') ?? resolveReferrer();

        const redirect = getAuthErrorRedirect(authError, authenticationFailureRedirect);
        const path = redirect === 'login' ? `/login?referrer=${referrer}` : `/error?code=${res.status}`;

        if (redirect === 'login') {
            notifySessionLoggedOut();
        }

        window.location.href = `${window.dara.base_url}${path}`;

        return true;
    }

    return false;
}

/**
 * Api call to get user data from the backend
 */
export function useUser(): UseQueryResult<UserData, RequestError> {
    const extras = useRequestExtras();
    return useQuery({
        queryFn: async () => {
            const res = await request('/api/auth/user', { method: HTTP_METHOD.GET }, extras);
            await handleAuthErrors(res);
            await validateResponse(res, 'Failed to fetch user for this app');
            return res.json();
        },
        queryKey: ['user'],
        refetchOnWindowFocus: false,
    });
}

/** Api call to create a session with the backend */
export async function requestSessionToken(body: User = {}): Promise<boolean> {
    const res = await request('/api/auth/session', {
        body: JSON.stringify(body),
        method: HTTP_METHOD.POST,
    });

    // check auth errors, but ignore invalid credentials - these will be handled by validateResponse further
    const loggedOut = await handleAuthErrors(res, {
        ignoreErrors: [AuthenticationErrorReason.INVALID_CREDENTIALS],
    });

    if (loggedOut) {
        return false;
    }

    await validateResponse(res, 'Failed to create a session');
    return true;
}

/** Api call to create a session with the backend */
export function useSession(body: User = {}): UseQueryResult<boolean, RequestError> {
    return useQuery({
        queryFn: async () => {
            return requestSessionToken(body);
        },
        queryKey: ['session'],
        refetchOnMount: false,
    });
}

/** Api call to verify the session token from the backend */
export async function verifySessionToken(): Promise<VerifySessionTokenResult> {
    const res = await request('/api/auth/verify-session', {
        method: HTTP_METHOD.POST,
    });

    if (!res.ok) {
        const handled = await handleAuthErrors(res, {
            ignoreErrors: [
                AuthenticationErrorReason.EXPIRED_TOKEN,
                AuthenticationErrorReason.INVALID_CREDENTIALS,
                AuthenticationErrorReason.INVALID_TOKEN,
            ],
        });

        if (handled) {
            return 'handled_auth_error';
        }

        setSessionIdentifier(null);
        return 'login_required';
    }

    try {
        const sessionId = await res.json();
        setSessionIdentifier(typeof sessionId === 'string' ? sessionId : null);
    } catch {
        setSessionIdentifier(null);
    }

    return 'verified';
}
