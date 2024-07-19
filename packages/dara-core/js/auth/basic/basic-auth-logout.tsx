/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';

import { revokeSession } from '@/auth/auth';
import { setSessionToken } from '../use-session-token';

/**
 * Auth component that wipes user token in AuthContext on mount and redirects to /login
 */
function BasicAuthLogout(): JSX.Element {
    useEffect(() => {
        revokeSession().then(() => {
            setSessionToken(null);
            window.location.href = `${window.dara.base_url}/login`;
        });
    }, []);

    return null;
}

export default BasicAuthLogout;
