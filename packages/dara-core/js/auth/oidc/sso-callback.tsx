import { useEffect } from 'react';

import { Center, DefaultFallback, ReactRouter, handleAuthErrors, request, setSessionToken } from '@darajs/core';
import { HTTP_METHOD } from '@darajs/ui-utils';

const DEFAULT_REDIRECT = '/';

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
        // JWT structure: header.payload.signature
        const parts = state.split('.');
        if (parts.length !== 3) {
            // Not a JWT, treat as raw redirect URL (fallback)
            return decodeURIComponent(state);
        }

        // Decode the payload (second part), handling base64url encoding
        const base64Payload = parts[1];
        if (!base64Payload) {
            return DEFAULT_REDIRECT;
        }
        const base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        return payload.redirect_to ?? DEFAULT_REDIRECT;
    } catch {
        // If decoding fails, try using the raw state as a URL (fallback)
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

function SSOCallbackPage(): JSX.Element {
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

export default SSOCallbackPage;
