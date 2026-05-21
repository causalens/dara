import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { HTTP_METHOD } from '@darajs/ui-utils';

import { request } from '@/api/http';
import DefaultFallback from '@/components/fallback/default';
import { useRouterContext } from '@/router/context';
import Center from '@/shared/center/center';

import { handleAuthErrors } from '../auth';

interface SSOCallbackResponse {
    redirect_to?: string | null;
}

/**
 * Makes a call to /sso-callback and returns the post-auth redirect path.
 * Returns null on auth failure.
 *
 * @param search current search string
 */
export async function getSSOCallbackResult(
    search: string,
    defaultPath: string
): Promise<{ redirectTo: string } | null> {
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
            const responseData = (await res.json()) as SSOCallbackResponse;
            return {
                redirectTo: responseData.redirect_to ?? defaultPath,
            };
        }

        throw new Error(`${res.status}: ${res.statusText}`);
    } catch {
        return null;
    }
}

function OIDCAuthSSOCallback(): JSX.Element {
    const { search } = useLocation();
    const navigate = useNavigate();
    const routerContext = useRouterContext();

    useEffect(() => {
        getSSOCallbackResult(search, routerContext.defaultPath)
            .then((result) => {
                if (result) {
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
