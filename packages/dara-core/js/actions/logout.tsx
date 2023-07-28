import { useCallback } from 'react';
import { useHistory } from 'react-router-dom';

import { ActionHook, LogoutInstance } from '@/types/core';

/**
 * Front-end handler for Logout action.
 * Navigates to '/logout'.
 */
const Logout: ActionHook<never, LogoutInstance> = () => {
    const history = useHistory();

    return useCallback(async (): Promise<void> => {
        history.push('/logout');
        return Promise.resolve();
    }, []);
};

export default Logout;
