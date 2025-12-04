import { useCallback, useEffect, useMemo } from 'react';

import {
    Center,
    DefaultFallback,
    ReactRouter,
    handleAuthErrors,
    request,
    useRouterContext,
    useSessionToken,
    verifySessionToken,
} from '@darajs/core';
import { HTTP_METHOD } from '@darajs/ui-utils';

/**
 * The Login component gets the username and password from the user and generates a session token.
 */
function LoginPage(): JSX.Element {
    const navigate = ReactRouter.useNavigate();
    const location = ReactRouter.useLocation();
    const token = useSessionToken();
    const { defaultPath } = useRouterContext();

    const previousLocation = useMemo(() => {
        const queryParams = new URLSearchParams(location.search);
        return queryParams.get('referrer') ?? defaultPath;
    }, [location, defaultPath]);

    /**
     * Verify existing token
     */
    const verifyToken = useCallback(async (): Promise<void> => {
        // send a call to backend to check the token (token will be automatically sent in the headers)
        const verified = await verifySessionToken();

        // token is valid, redirect back
        if (verified) {
            navigate(decodeURIComponent(previousLocation), { replace: true });
        } else {
            // not valid, go to logout to clear the token
            navigate('/logout', { replace: true });
        }
    }, [previousLocation, navigate]);

    /**
     * Get new token
     */
    const getNewToken = useCallback(async (): Promise<void> => {
        const res = await request('/api/auth/session', {
            body: JSON.stringify({
                redirect_to: previousLocation,
            }),
            method: HTTP_METHOD.POST,
        });

        // check for auth errors, redirecting to /error as needed
        const loggedOut = await handleAuthErrors(res, false);

        if (loggedOut) {
            return;
        }

        // Redirect to the SSO login page
        // The redirect_uri already contains the state parameter with the encoded redirect URL
        if (res.ok) {
            const resContent = await res.json();
            window.location.href = resContent.redirect_uri;
        }
    }, [previousLocation]);

    useEffect(() => {
        // If we landed on this page with a token already, verify it
        if (token) {
            verifyToken();
        } else {
            getNewToken();
        }
    }, [getNewToken, verifyToken, token]);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default LoginPage;
