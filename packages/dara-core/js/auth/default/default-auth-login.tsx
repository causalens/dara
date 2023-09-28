/* eslint-disable react-hooks/exhaustive-deps */

import { useContext, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import DefaultFallback from '@/components/fallback/default';
import Center from '@/shared/center/center';
import { AuthCtx } from '@/shared/context';
import { getTokenKey } from '@/shared/utils';

import { getSessionToken, verifySessionToken } from '../auth';

/**
 * The Login component gets a new session token from the backend and stores it in local storage
 */
function DefaultAuthLogin(): JSX.Element {
    const { token, setToken } = useContext(AuthCtx);

    const history = useHistory();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);

    // Put any type here as typescript couldn't resolve location's typings
    const previousLocation: any = location.state || { from: { pathname: queryParams.get('referrer') ?? '/' } };
    const { from } = previousLocation;

    async function getNewToken(): Promise<void> {
        const sessionToken = await getSessionToken({});
        // in default auth this always succeeds
        if (sessionToken) {
            setToken(sessionToken);
            history.replace(from);
        }
    }

    useEffect(() => {
        const key = getTokenKey();

        // If we landed on this page with a token already, verify it
        if (token) {
            const storedToken = localStorage.getItem(key);
            if (token !== undefined && token !== null && (!storedToken || storedToken === 'undefined')) {
                localStorage.setItem(key, token);
            }

            // Grab the token from local storage again as it may have changed
            verifySessionToken(localStorage.getItem(key)).then((verified) => {
                // we already have a valid token, redirect
                if (verified) {
                    history.replace(from);
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
