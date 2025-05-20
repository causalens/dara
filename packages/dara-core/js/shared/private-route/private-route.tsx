/* eslint-disable react-hooks/exhaustive-deps */
import { ReactNode, useEffect } from 'react';
import { Redirect } from 'react-router-dom';

import { resolve_referrer } from '@/auth/auth';
import { useSessionToken } from '@/auth/use-session-token';
import DefaultFallback from '@/components/fallback/default';
import useAction, { useActionIsLoading } from '@/shared/utils/use-action';
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
    const onLoad = useAction(on_load);
    const isLoading = useActionIsLoading(on_load);

    useWindowTitle(name);

    useEffect(() => {
        // On mount, call the on_load action
        onLoad();
    }, []);

    if (!token) {
        const referrer = resolve_referrer();
        return (
            <Redirect
                to={{
                    pathname: '/login',
                    search: `?referrer=${referrer}`,
                }}
            />
        );
    }

    // Show fallback while the onLoad action is in progress
    return isLoading ? <DefaultFallback /> : children;
}

export default PrivateRoute;
