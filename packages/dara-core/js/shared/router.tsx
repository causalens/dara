import type { QueryClient } from '@tanstack/query-core';
import { Navigate, type RouteObject, createBrowserRouter, redirect } from 'react-router';
import type { Snapshot } from 'recoil';

import { getSessionToken, resolveReferrer, verifySessionToken } from '@/auth';
import { DefaultFallbackStatic } from '@/components/fallback/default';
import ErrorPage from '@/pages/error-page';
import RootErrorPage from '@/pages/root-error-page';
import {
    type DaraData,
    type IndexRouteDefinition,
    type LayoutRouteDefinition,
    type PageRouteDefinition,
    type PrefixRouteDefinition,
    type RouteDefinition,
} from '@/types/core';

import DynamicAuthComponent from './dynamic-component/dynamic-auth-component';
import AuthenticatedRoot from './root/authenticated-root';
import RouteContent, { createRouteLoader } from './root/route-content';
import UnauthenticatedRoot from './root/unauthenticated-root';

/**
 * Clean a single path segment by removing leading/trailing slashes
 */
function cleanPath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
}

/**
 * Helper function to clean and join path segments properly
 */
function joinPaths(parentPath: string, childPath: string): string {
    // Remove leading/trailing slashes from both parts
    const cleanParent = cleanPath(parentPath);
    const cleanChild = cleanPath(childPath);

    // Join with single slash and ensure leading slash
    if (cleanParent === '' && cleanChild === '') {
        return '/';
    }
    if (cleanParent === '') {
        return `/${cleanChild}`;
    }
    if (cleanChild === '') {
        return `/${cleanParent}`;
    }
    return `/${cleanParent}/${cleanChild}`;
}

function createRoute(
    route: RouteDefinition,
    queryClient: QueryClient,
    snapshotRef: React.MutableRefObject<Snapshot>
): RouteObject {
    const sharedProps = {
        id: route.id,
        caseSensitive: route.case_sensitive,
        hydrateFallbackElement: <DefaultFallbackStatic />,
    };

    switch (route.__typename) {
        case 'IndexRoute':
            return {
                ...sharedProps,
                index: true,
                element: <RouteContent route={route} key={route.id} />,
                loader: createRouteLoader(route, queryClient, snapshotRef),
            };
        case 'PageRoute':
            return {
                ...sharedProps,
                path: cleanPath(route.path),
                element: <RouteContent route={route} key={route.id} />,
                loader: createRouteLoader(route, queryClient, snapshotRef),
                children: route.children.map((r) => createRoute(r, queryClient, snapshotRef)),
            };
        case 'LayoutRoute':
            return {
                ...sharedProps,
                element: <RouteContent route={route} key={route.id} />,
                loader: createRouteLoader(route, queryClient, snapshotRef),
                children: route.children.map((r) => createRoute(r, queryClient, snapshotRef)),
            };
        case 'PrefixRoute':
            return {
                ...sharedProps,
                path: cleanPath(route.path),
                children: route.children.map((r) => createRoute(r, queryClient, snapshotRef)),
            };
        default:
            throw new Error(`Unknown route type ${JSON.stringify(route)}`);
    }
}
/**
 * Find the first navigatable path in the given routes.
 * Walks the routes in a BFS and returns the first route with a path.
 */
export function findFirstPath(routes: RouteDefinition[]): string {
    interface QueueItem {
        routes: RouteDefinition[];
        path: string;
    }

    const queue: QueueItem[] = [{ routes, path: '/' }];

    while (queue.length > 0) {
        const { routes: currentRoutes, path: currentPath } = queue.shift()!;

        // Categorize routes at current level
        let indexRoute: IndexRouteDefinition | null = null;
        const pageRoutes: PageRouteDefinition[] = [];
        const otherRoutes: (LayoutRouteDefinition | PrefixRouteDefinition)[] = [];

        for (const route of currentRoutes) {
            if (route.__typename === 'IndexRoute') {
                indexRoute = route;
            } else if (route.__typename === 'PageRoute') {
                pageRoutes.push(route);
            } else if (route.__typename === 'LayoutRoute' || route.__typename === 'PrefixRoute') {
                otherRoutes.push(route);
            }
        }

        // 1. Prefer index routes - return current path as it's navigatable
        if (indexRoute) {
            return currentPath === '' ? '/' : joinPaths('', currentPath);
        }

        // 2. Then prefer page routes - just return first one joined with parent
        if (pageRoutes.length > 0) {
            return joinPaths(currentPath, pageRoutes[0]!.path);
        }

        // 3. Add layout/prefix routes to queue for processing
        for (const otherRoute of otherRoutes) {
            const routePath = 'path' in otherRoute ? otherRoute.path : '';
            queue.push({ routes: otherRoute.children, path: joinPaths(currentPath, routePath) });
        }
    }

    return '/';
}

/**
 * Simple boolean to track whether we have done an initial verification of the token.
 * We only do it once, as we don't want to do it on every navigation - any server interaction will require a valid token anyway.
 * The initial check is only done to ensure that on initial load we short-circuit and bail out as early as possible.
 */
let verifiedToken = false;

/**
 * Create the router for the application
 */
export function createRouter(
    config: DaraData,
    queryClient: QueryClient,
    snapshotRef: React.MutableRefObject<Snapshot>
): ReturnType<typeof createBrowserRouter> {
    let basename = '';

    // The base_url is set in the html template by the backend when returning it
    if (window.dara.base_url !== '') {
        basename = new URL(window.dara.base_url, window.origin).pathname;
    }

    const { login, logout, ...extraRoutes } = config.auth_components;

    const userRoutes = config.router.children.map((r) => createRoute(r, queryClient, snapshotRef));
    const defaultPath = findFirstPath(config.router.children) || '/';

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
                        element: <AuthenticatedRoot daraData={config} />,
                        // token must be set to access the authenticated routes
                        unstable_middleware: [
                            async () => {
                                if (verifiedToken) {
                                    return;
                                }

                                const token = getSessionToken();

                                // if there is a token and we can verify it, we're good to go
                                if (token && (await verifySessionToken())) {
                                    verifiedToken = true;
                                    return;
                                }

                                // otherwise there is no token or it's invalid, redirect to login
                                const referrer = resolveReferrer();
                                const baseUrl: string = window.dara?.base_url ?? '';
                                const redirectUrl = new URL(`${baseUrl}/login`, window.location.origin);
                                redirectUrl.searchParams.set('referrer', referrer);
                                // Intended RR API usage
                                // eslint-disable-next-line @typescript-eslint/only-throw-error
                                throw redirect(redirectUrl.toString());
                            },
                        ],
                        // user-defined routes
                        children: [
                            ...userRoutes,
                            // fallback route, redirect to first navigatable path
                            {
                                path: '*',
                                element: <Navigate to={defaultPath} />,
                            },
                        ],
                    },
                ],
            },
        ],
        { basename }
    );
}
