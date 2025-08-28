import NProgress from 'nprogress';
import { type RouteObject, createBrowserRouter, redirect } from 'react-router';

import { getSessionToken, resolveReferrer, setSessionToken, verifySessionToken } from '@/auth';
import { DefaultFallbackStatic } from '@/components/fallback/default';
import ErrorPage from '@/pages/error-page';
import RootErrorPage from '@/pages/root-error-page';
import { type DaraData, type ModuleContent, type RouteDefinition } from '@/types/core';

import DynamicAuthComponent, { preloadAuthComponent } from './dynamic-component/dynamic-auth-component';
import { preloadComponents } from './dynamic-component/dynamic-component';
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

export async function createRouter(
    config: DaraData,
    importers: Record<string, () => Promise<ModuleContent>>
): Promise<ReturnType<typeof createBrowserRouter>> {
    let basename = '';

    // The base_url is set in the html template by the backend when returning it
    if (window.dara.base_url !== '') {
        basename = new URL(window.dara.base_url, window.origin).pathname;
    }

    // preload auth components to prevent flashing of extra spinners
    await Promise.all(
        Object.values(config.auth_components).map((component) => preloadAuthComponent(importers, component))
    );
    // preload components for the entire loaded registry
    // TODO: This can error in scenarios where an asset is missing, how does this look like for the user?
    await preloadComponents(importers, Object.values(config.components));
    const { login, logout, ...extraRoutes } = config.auth_components;

    NProgress.configure({ showSpinner: false });

    return createBrowserRouter(
        [
            {
                // wrapper around all the router content
                element: <UnauthenticatedRoot />,
                hydrateFallbackElement: <DefaultFallbackStatic />,
                ErrorBoundary: RootErrorPage,
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
                                const token = getSessionToken();

                                // short-circuit - already validated token
                                if (token) {
                                    return;
                                }

                                // verify storage token if present
                                const storageToken = getToken();
                                if (storageToken) {
                                    if (await verifySessionToken()) {
                                        setSessionToken(storageToken);
                                        return;
                                    }
                                }

                                const referrer = resolveReferrer();
                                const baseUrl: string = window.dara?.base_url ?? '';
                                const redirectUrl = new URL(baseUrl + '/login', window.location.origin);
                                redirectUrl.searchParams.set('referrer', referrer);
                                throw redirect(redirectUrl.toString());
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
