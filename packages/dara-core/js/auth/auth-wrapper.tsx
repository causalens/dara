import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Route, Switch } from 'react-router-dom';

import DefaultFallback from '@/components/fallback/default';
import ErrorPage from '@/pages/error-page';
import Center from '@/shared/center/center';
import { ImportersCtx } from '@/shared/context';
import PrivateRoute from '@/shared/private-route/private-route';
import { getToken } from '@/shared/utils';

import { AuthComponent, useAuthConfig } from './auth';
import { setSessionToken } from './use-session-token';

interface AuthWrapperProps {
    /** The children to wrap */
    children: ReactNode;
}

/**
 * Simplified version of DynamicComponent, just for the auth components.
 * This is because we can't use the component registry for auth components, since the component registry operates
 * in an authenticated context, and we need to be able to render the login page without being authenticated.
 */
function DynamicAuthComponent(props: { component: AuthComponent }): JSX.Element {
    const importers = useContext(ImportersCtx);
    const [component, setComponent] = useState(() => <DefaultFallback />);

    useEffect(() => {
        const importer = importers[props.component.py_module];

        importer()
            .then((moduleContent) => {
                if (!moduleContent) {
                    throw new Error(`Failed to import module ${props.component.py_module}`);
                }

                const Component = moduleContent[props.component.js_name];

                if (!Component) {
                    throw new Error(
                        `Failed to import component ${props.component.js_name} from module ${props.component.py_module}`
                    );
                }

                setComponent(<Component />);
            })
            .catch((err) => {
                throw new Error(`Failed to import module ${props.component.py_module}`, err);
            });
    }, [props.component, importers]);

    return component;
}

/**
 * Simple Auth Wrapper component that initializes the token from localStorage,
 * synchronizes token with localStorage and refreshes the token if it's about to expire.
 * Renders the login/logout components and the children wrapped in PrivateRoute.
 *
 * @param props - the component props
 */
function AuthWrapper(props: AuthWrapperProps): JSX.Element {
    const { data: authConfig, isLoading } = useAuthConfig();
    const isMounted = useRef(false);

    // set initial token from local storage as soon as we render
    if (!isMounted.current) {
        isMounted.current = true;
        setSessionToken(getToken());
    }

    if (isLoading) {
        return (
            <Center>
                <DefaultFallback />
            </Center>
        );
    }

    const { login, logout, ...extraRoutes } = authConfig.auth_components;

    return (
        <Switch>
            <Route path="/login">
                <DynamicAuthComponent component={login} />
            </Route>
            <Route path="/logout">
                <DynamicAuthComponent component={logout} />
            </Route>
            {Object.entries(extraRoutes).map(([path, component]) => (
                <Route key={path} path={`/${path}`}>
                    <DynamicAuthComponent component={component} />
                </Route>
            ))}
            <Route component={ErrorPage} path="/error" />
            <Route path="/" render={() => <PrivateRoute>{props.children}</PrivateRoute>} />
        </Switch>
    );
}

export default AuthWrapper;
