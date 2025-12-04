import { useEffect } from 'react';

import { Center, DefaultFallback, ReactRouter, revokeSession, setSessionToken } from '@darajs/core';

/**
 * Auth component that wipes user token in AuthContext on mount and redirects to /login
 */
function SSOLogout(): JSX.Element {
    const navigate = ReactRouter.useNavigate();

    useEffect(() => {
        revokeSession().then((responseData) => {
            setSessionToken(null);

            if (!responseData || !('redirect_uri' in responseData)) {
                navigate('/login');
                // eslint-disable-next-line no-console
                console.error('Failed to revoke session, redirect_uri not present in response', responseData);
                return;
            }

            // Append the post_logout_redirect_uri to the redirectUri
            const loginUrl = new URL('/login', window.location.origin);
            const finalRedirectUrl = new URL(responseData.redirect_uri);
            finalRedirectUrl.searchParams.append('post_logout_redirect_uri', loginUrl.toString());
            window.location.href = finalRedirectUrl.toString();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default SSOLogout;
