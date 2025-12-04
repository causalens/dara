import { jwtDecode } from 'jwt-decode';
import { useEffect } from 'react';

import { Center, DefaultFallback, ReactRouter, handleAuthErrors, request, setSessionToken } from '@darajs/core';
import { HTTP_METHOD } from '@darajs/ui-utils';

const DEFAULT_REDIRECT = '/';

interface StatePayload {
    redirect_to?: string;
}

/**
 * Decode the state parameter which is a JWT containing the redirect URL.
 * Falls back to the raw state value or default redirect if decoding fails.
 *
 * @param state The state parameter from the callback URL
 * @returns The redirect URL extracted from the state
 */
function decodeStateRedirect(state: string | null): string {
    if (!state) {
        return DEFAULT_REDIRECT;
    }

    try {
        const payload = jwtDecode<StatePayload>(state);
        return payload.redirect_to ?? DEFAULT_REDIRECT;
    } catch {
        // If decoding fails, try using the raw state as a URL (fallback for non-JWT states)
        try {
            return decodeURIComponent(state);
        } catch {
            return DEFAULT_REDIRECT;
        }
    }
}

/**
 * Makes a call to /sso-callback and returns a new token
 * Returns null if no token was returned (i.e. 403)
 *
 * @param search current search string
 */
export async function getSSOCallbackToken(search: string): Promise<{ token: string; redirectTo: string } | null> {
    try {
        const params = new URLSearchParams(search);
        const state = params.get('state');

        const res = await request('/api/auth/sso-callback', {
            body: JSON.stringify({
                auth_code: params.get('code'),
                state,
            }),
            method: HTTP_METHOD.POST,
        });

        const shouldLogOut = await handleAuthErrors(res);
        if (shouldLogOut) {
            return null;
        }

        if (res.ok) {
            const { token } = await res.json();
            return {
                token,
                redirectTo: decodeStateRedirect(state),
            };
        }

        throw new Error(`${res.status}: ${res.statusText}`);
    } catch {
        return null;
    }
}

function OIDCAuthSSOCallback(): JSX.Element {
    const { search } = ReactRouter.useLocation();
    const navigate = ReactRouter.useNavigate();

    useEffect(() => {
        getSSOCallbackToken(search)
            .then((result) => {
                if (result) {
                    setSessionToken(result.token);
                    navigate(result.redirectTo);
                }
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Failed to run SSO callback', err);
                navigate('/logout');
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default OIDCAuthSSOCallback;
