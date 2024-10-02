import { UseQueryResult, useQuery } from '@tanstack/react-query';

import { HTTP_METHOD, RequestError, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { useRequestExtras } from '@/shared/context';
import { getTokenKey } from '@/shared/utils/embed';
import { User, UserData } from '@/types';

enum AuthenticationErrorReason {
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

/**
 * Whether a message is an authentication error
 *
 * @param message message
 */
function isAuthenticationError(message: any): message is AuthenticationError {
    return (
        message !== null &&
        message !== undefined &&
        typeof message === 'object' &&
        'reason' in message &&
        Object.values(AuthenticationErrorReason).includes(message.reason)
    );
}

/**
 * Whether the error should be ignored
 *
 * @param message error message
 * @param ignoreErrors error types to ignore
 */
function shouldIgnoreError(message: AuthenticationError, ignoreErrors: Array<AuthenticationError['reason']>): boolean {
    return ignoreErrors && ignoreErrors.includes(message.reason);
}

/**
 * Returns true if the error should redirect to login, otherwise it should redirect to the error page
 *
 * @param message error message
 */
function shouldRedirectToLogin(message: AuthenticationError): boolean {
    return [AuthenticationErrorReason.INVALID_CREDENTIALS, AuthenticationErrorReason.EXPIRED_TOKEN].includes(
        message.reason
    );
}

/**
 * Separate from the main component system, since we can't use component registry
 */
export interface AuthComponent {
    js_module: string;
    js_name: string;
    py_module: string;
}

interface AuthComponents {
    [route: string]: AuthComponent;
    login: AuthComponent;
    logout: AuthComponent;
}

/**
 * Fetch components to use for authentication
 */
export function useAuthComponents(): UseQueryResult<AuthComponents> {
    return useQuery(
        ['auth-components'],
        async () => {
            const response = await request('/api/core/auth-components', {
                method: HTTP_METHOD.GET,
            });

            return response.json();
        },
        { refetchOnWindowFocus: false }
    );
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
export async function revokeSession(): Promise<RedirectResponse | SuccessResponse> {
    try {
        const response = await request(
            '/api/auth/revoke-session',
            {
                method: HTTP_METHOD.POST,
            },
        );

        if (response.ok) {
            const responseData = await response.json();
            return responseData;
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to revoke session', e);
    }
}

/**
 * Helper function to handle auth errors in a response
 *
 * @param res the response object to check
 * @param toLogin if true, open the login page, else open the error page
 * @param ignoreErrors if specified, certain reasons for an error will be ignored
 */
export async function handleAuthErrors(
    res: Response,
    toLogin = false,
    ignoreErrors: Array<AuthenticationErrorReason> = null
): Promise<boolean> {
    const content = await res.clone().json();

    if (isAuthenticationError(content?.detail) && !shouldIgnoreError(content?.detail, ignoreErrors)) {
        localStorage.removeItem(getTokenKey());

        // use existing referrer if available in case we were already redirected because of e.g. missing token
        const queryParams = new URLSearchParams(window.location.search);
        const referrer =
            queryParams.get('referrer') ?? encodeURIComponent(window.location.pathname + window.location.search);

        const path =
            toLogin || shouldRedirectToLogin(content.detail) ?
                `/login?referrer=${referrer}`
            :   `/error?code=${res.status}`;
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

/** Api call to fetch the session token from the backend */
export async function requestSessionToken(body: User = {}): Promise<string> {
    const res = await request('/api/auth/session', {
        body: JSON.stringify(body),
        method: HTTP_METHOD.POST,
    });

    // check auth errors, but ignore invalid credentials - these will be handled by validateResponse further
    const loggedOut = await handleAuthErrors(res, false, [AuthenticationErrorReason.INVALID_CREDENTIALS]);

    if (loggedOut) {
        return null;
    }

    await validateResponse(res, 'Failed to fetch the session token');
    const parsedResponse = await res.json();

    const { token } = parsedResponse;

    localStorage.setItem(getTokenKey(), token);
    return token;
}

/** Api call to fetch the session token from the backend */
export function useSession(body: User = {}): UseQueryResult<string, RequestError> {
    return useQuery({
        queryFn: async () => {
            return requestSessionToken(body);
        },
        queryKey: ['session'],
        refetchOnMount: false,
    });
}

/** Api call to verify the session token from the backend */
export async function verifySessionToken(): Promise<boolean> {
    const res = await request(
        '/api/auth/verify-session',
        {
            method: HTTP_METHOD.POST,
        },
    );
    return res.ok;
}
