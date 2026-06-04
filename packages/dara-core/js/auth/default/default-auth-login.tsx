/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import DefaultFallback from '@/components/fallback/default';
import { useRouterContext } from '@/router/context';
import Center from '@/shared/center/center';

import { parseLoginReferrer, requestSessionToken, verifySessionToken } from '../auth';

/**
 * The Login component requests a new server-managed session cookie and then redirects.
 */
function DefaultAuthLogin(): JSX.Element {
    const location = useLocation();
    const navigate = useNavigate();
    const { defaultPath } = useRouterContext();

    const previousLocation = parseLoginReferrer(location.search, defaultPath);

    async function getNewToken(): Promise<void> {
        const sessionCreated = await requestSessionToken({});
        // in default auth this always succeeds
        if (sessionCreated) {
            navigate(previousLocation);
        }
    }

    useEffect(() => {
        // If we landed on this page with a valid session already, redirect.
        // Otherwise, request a new session token.
        verifySessionToken().then((verificationResult) => {
            if (verificationResult === 'verified') {
                navigate(previousLocation, { replace: true });
            } else if (verificationResult === 'login_required') {
                getNewToken();
            }
        });
    }, []);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default DefaultAuthLogin;
