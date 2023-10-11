/* eslint-disable react-hooks/exhaustive-deps */

import { ReactNode, useEffect } from 'react';
import { Redirect } from 'react-router-dom';

import { useSessionToken } from '@/auth/auth-context';
import { DefaultFallback } from '@/components';
import useAction from '@/shared/utils/use-action';
import useWindowTitle from '@/shared/utils/use-window-title';
import { Action } from '@/types';

interface PrivateRouteProps {
    /** The children to wrap */
    children: ReactNode;
    /** Name of the page this route links to */
    name?: string;
    /** Variables which should be reset upon visiting the page */
    on_load?: Action;
}

/**
 * The PrivateRoute component takes a private route object and checks for authentication.
 * It redirects to the login page if the user is not authenticated.
 *
 * @param props - the component props
 */
function PrivateRoute({ children, on_load, name }: PrivateRouteProps): ReactNode {
    const token = useSessionToken();
    const [onLoad, isLoading] = useAction(on_load);

    useWindowTitle(name);

    useEffect(() => {
        // On mount, call the on_load action
        onLoad();
    }, []);

    if (!token) {
        return <Redirect to="/login" />;
    }

    return isLoading ? <DefaultFallback /> : children;
}

export default PrivateRoute;
