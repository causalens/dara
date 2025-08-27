import { type RouteObject, createBrowserRouter, redirect } from 'react-router';

import { getSessionToken, resolveReferrer, setSessionToken, verifySessionToken } from '@/auth';
import DefaultFallback, { DefaultFallbackStatic } from '@/components/fallback/default';
import ErrorPage from '@/pages/error-page';
import { type DaraData, type RouteDefinition } from '@/types/core';

import DynamicAuthComponent from './dynamic-component/dynamic-auth-component';
import AuthenticatedRoot from './root/authenticated-root';
import RouteContent, { createRouteLoader } from './root/route-content';
import UnauthenticatedRoot from './root/unauthenticated-root';
import { getToken } from './utils';

function createRoute(route: RouteDefinition): RouteObject {
    const sharedProps = {
        id: route.id,
        caseSensitive: route.case_sensitive,
    };

    switch (route.__typename) {
        case 'IndexRoute':
            return {
                ...sharedProps,
                index: true,
                element: <RouteContent />,
                loader: createRouteLoader(route),
            };
        case 'PageRoute':
            return {
                ...sharedProps,
                path: route.path,
                element: <RouteContent />,
                loader: createRouteLoader(route),
                children: route.children.map(createRoute),
            };
        case 'LayoutRoute':
            return {
                ...sharedProps,
                path: route.path,
                element: <RouteContent />,
                loader: createRouteLoader(route),
                children: route.children.map(createRoute),
            };
        case 'PrefixRoute':
            return {
                ...sharedProps,
                path: route.path,
                children: route.children.map(createRoute),
            };
        default:
            throw new Error(`Unknown route type ${JSON.stringify(route)}`);
    }
}

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
}

export function createRouter(config: DaraData): ReturnType<typeof createBrowserRouter> {
    let basename = '';

    // The base_url is set in the html template by the backend when returning it
    if (window.dara.base_url !== '') {
        basename = new URL(window.dara.base_url, window.origin).pathname;
    }

    const { login, logout, ...extraRoutes } = config.auth_components;

    // Upon page load, set the session token from the local storage
    setSessionToken(getToken());

    return createBrowserRouter(
        [
            {
                // wrapper around all the router content
                element: <UnauthenticatedRoot />,
                hydrateFallbackElement: <DefaultFallbackStatic />,
                children: [
                    {
                        path: 'error',
                        Component: ErrorPage,
                    },
                    // core auth routes
                    {
                        path: 'login',
                        element: <DynamicAuthComponent component={login} />,
                    },
                    {
                        path: 'logout',
                        element: <DynamicAuthComponent component={logout} />,
                    },
                    // extra auth routes
                    ...Object.entries(extraRoutes).map(([path, component]) => ({
                        path,
                        element: <DynamicAuthComponent component={component} />,
                    })),
                    // root of the app
                    {
                        // TODO: move useWindowTitle and onLoad to somewhere, used to be PrivateRoute
                        element: <AuthenticatedRoot daraData={config} />,
                        // token must be set to access the authenticated routes
                        unstable_middleware: [
                            async () => {
                                console.log('auth middleware');
                                const token = getSessionToken();

                                const redirectToLogin = () => {
                                    const referrer = resolveReferrer();
                                    const baseUrl: string = window.dara?.base_url ?? '';
                                    const redirectUrl = new URL(baseUrl + '/login', window.location.origin);
                                    redirectUrl.searchParams.set('referrer', referrer);
                                    throw redirect(redirectUrl.toString());
                                };

                                // no token - go to login to get one
                                if (!token) {
                                    console.log('auth middleware - no token');
                                    redirectToLogin();
                                }
                                console.log('auth middleware - token found', token);

                                const ok = await verifySessionToken();
                                if (!ok) {
                                    console.log('auth middleware - token invalid');
                                    redirectToLogin();
                                }
                                console.log('auth middleware - token valid');
                            },
                        ],
                        // user-defined routes
                        children: config.router.children.map(createRoute),
                    },
                ],
            },
        ],
        { basename }
    );
}
