/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import DefaultFallback from '@/components/fallback/default';
import Center from '@/shared/center/center';

import { requestSessionToken, verifySessionToken } from '../auth';
import { getSessionToken, setSessionToken } from '../use-session-token';
import { useRouterContext } from '@/router/context';

/**
 * The Login component gets a new session token from the backend and stores it in local storage
 */
function DefaultAuthLogin(): JSX.Element {
    const location = useLocation();
    const navigate = useNavigate();
    const { defaultPath } = useRouterContext();
    const queryParams = new URLSearchParams(location.search);

    const previousLocation = queryParams.get('referrer') ?? defaultPath ;

    async function getNewToken(): Promise<void> {
        const sessionToken = await requestSessionToken({});
        // in default auth this always succeeds
        if (sessionToken) {
            setSessionToken(sessionToken);
            navigate(decodeURIComponent(previousLocation));
        }
    }

    useEffect(() => {
        // If we landed on this page with a token already, verify it
        if (getSessionToken()) {
            verifySessionToken().then((verified) => {
                // we already have a valid token, redirect
                if (verified) {
                    navigate(decodeURIComponent(previousLocation));
                } else {
                    // Otherwise grab a new token
                    getNewToken();
                }
            });
        } else {
            // Otherwise grab a new token
            getNewToken();
        }
    }, []);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default DefaultAuthLogin;
