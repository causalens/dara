import { ReactNode, useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';

import { useSessionToken } from '@/auth/auth-context';
import { useResetVariables } from '@/shared/interactivity';
import useWindowTitle from '@/shared/utils/use-window-title';
import { Variable } from '@/types';

interface PrivateRouteProps {
    /** The children to wrap */
    children: ReactNode;
    /** To have exact matching for the route path */
    exact?: boolean;
    /** Name of the page this route links to */
    name?: string;
    /** The route for the private route */
    path: string;
    /** Variables which should be reset upon visiting the page */
    reset_vars_on_load?: Variable<any>[];
}

/**
 * The PrivateRoute component takes a private route object and checks for authentication.
 * It redirects to the login page if the user is not authenticated.
 *
 * @param props - the component props
 */
function PrivateRoute({ children, path, exact, reset_vars_on_load, name, ...rest }: PrivateRouteProps): JSX.Element {
    const token = useSessionToken();
    const resetVariables = useResetVariables(reset_vars_on_load ?? []);

    useWindowTitle(name);

    useEffect(() => {
        // On mount, reset variables which were specified
        resetVariables();
    }, []);

    return (
        <Route
            {...rest}
            exact={exact}
            path={path}
            render={({ location }) =>
                token ? (
                    children
                ) : (
                    <Redirect
                        to={{
                            pathname: '/login',
                            state: { from: location },
                        }}
                    />
                )
            }
        />
    );
}

export default PrivateRoute;
