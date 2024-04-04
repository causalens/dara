/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';

import { revokeSession } from '@/auth/auth';
import { useAuthCtx } from '@/auth/auth-context';

/**
 * Auth component that wipes user token in AuthContext on mount and redirects to /login
 */
function BasicAuthLogout(): JSX.Element {
    const { setToken, token } = useAuthCtx();

    useEffect(() => {
        revokeSession(token).then(() => {
            setToken(null);
            window.location.href = `${window.dara.base_url}/login`;
        });
    }, []);

    return null;
}

export default BasicAuthLogout;
