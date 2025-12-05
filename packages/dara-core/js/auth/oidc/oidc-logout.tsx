import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import DefaultFallback from '@/components/fallback/default';
import Center from '@/shared/center/center';

import { revokeSession } from '../auth';
import { setSessionToken } from '../use-session-token';

/**
 * Auth component that handles OIDC logout.
 *
 * If the IDP supports RP-Initiated Logout, redirects to the IDP's end_session_endpoint
 * with post_logout_redirect_uri pointing back to /login.
 *
 * If the IDP doesn't support logout (server returns { success: true }), simply
 * clears the local session and redirects to /login.
 */
function OIDCAuthLogout(): JSX.Element {
    const navigate = useNavigate();

    useEffect(() => {
        revokeSession().then((responseData) => {
            // Always clear the local session token
            setSessionToken(null);

            // Check if we got a redirect URL (IDP supports RP-Initiated Logout)
            if (responseData && 'redirect_uri' in responseData) {
                // Append the post_logout_redirect_uri to redirect back to /login after IDP logout
                const loginUrl = new URL('/login', window.location.origin);
                const finalRedirectUrl = new URL(responseData.redirect_uri);
                finalRedirectUrl.searchParams.append('post_logout_redirect_uri', loginUrl.toString());
                window.location.href = finalRedirectUrl.toString();
                return;
            }

            // No redirect URL - IDP doesn't support logout, just go to login
            navigate('/login');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Center>
            <DefaultFallback />
        </Center>
    );
}

export default OIDCAuthLogout;
