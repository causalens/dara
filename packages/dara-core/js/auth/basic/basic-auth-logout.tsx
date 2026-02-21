/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';

import { revokeSession } from '@/auth/auth';

import { notifySessionLoggedOut } from '../use-session-token';

/**
 * Auth component that wipes user token in AuthContext on mount and redirects to /login
 */
function BasicAuthLogout(): React.ReactNode {
    useEffect(() => {
        revokeSession().then(() => {
            notifySessionLoggedOut();
            window.location.href = `${window.dara.base_url}/login`;
        });
    }, []);

    return null;
}

export default BasicAuthLogout;
