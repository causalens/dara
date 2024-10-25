/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import DefaultFallback from '@/components/fallback/default';
import Center from '@/shared/center/center';

import { requestSessionToken, verifySessionToken } from '../auth';
import { getSessionToken, setSessionToken } from '../use-session-token';

/**
 * The Login component gets a new session token from the backend and stores it in local storage
 */
function DefaultAuthLogin(): JSX.Element {
    const history = useHistory();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);

    const previousLocation = queryParams.get('referrer') ?? '/';

    async function getNewToken(): Promise<void> {
        const sessionToken = await requestSessionToken({});
        // in default auth this always succeeds
        if (sessionToken) {
            setSessionToken(sessionToken);
            history.replace(decodeURIComponent(previousLocation));
        }
    }

    useEffect(() => {
        // If we landed on this page with a token already, verify it
        if (getSessionToken()) {
            verifySessionToken().then((verified) => {
                // we already have a valid token, redirect
                if (verified) {
                    history.replace(decodeURIComponent(previousLocation));
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
