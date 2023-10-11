/* eslint-disable react-hooks/exhaustive-deps */

import { ReactNode, useContext, useEffect, useState } from 'react';
import { Route, Switch } from 'react-router-dom';

import DefaultFallback from '@/components/fallback/default';
import ErrorPage from '@/pages/error-page';
import Center from '@/shared/center/center';
import { ImportersCtx } from '@/shared/context';
import PrivateRoute from '@/shared/private-route/private-route';
import { getToken, getTokenKey } from '@/shared/utils';

import { AuthComponent, useAuthComponents } from './auth';
import AuthContext from './auth-context';

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
    }, [props.component]);

    return component;
}

/**
 * Simple Auth Wrapper component that makes the session request to the backend and then provides the session token down
 * to the rest of the app via context
 *
 * @param props - the component props
 */
function AuthWrapper(props: AuthWrapperProps): JSX.Element {
    const [token, setToken] = useState<string>(() => getToken());
    const { data: authComponents, isLoading } = useAuthComponents();

    /**
     * Set token handler - updates the token in state and local storage
     *
     * @param newToken new token
     */
    function onSetToken(newToken: string): void {
        const key = getTokenKey();

        if (newToken) {
            localStorage.setItem(key, newToken);
        } else {
            localStorage.removeItem(key);
        }

        setToken(newToken);
    }

    if (isLoading) {
        return (
            <Center>
                <DefaultFallback />
            </Center>
        );
    }

    const { login, logout, ...extraRoutes } = authComponents;

    return (
        <AuthContext.Provider value={{ setToken: onSetToken, token }}>
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
        </AuthContext.Provider>
    );
}

export default AuthWrapper;
