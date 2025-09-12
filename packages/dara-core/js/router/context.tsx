import * as React from 'react';
import { type RouteObject } from 'react-router';

import { type RouteDefinition } from '@/types';

interface RouterContextValue {
    routeDefinitions: RouteDefinition[];
    routeObjects: RouteObject[];
    routeDefMap: Map<string, RouteDefinition>;
    defaultPath: string;
}

const RouterContext = React.createContext<RouterContextValue | null>(null);

export function RouterContextProvider({
    children,
    routeDefinitions,
    routeObjects,
    routeDefMap,
    defaultPath,
}: {
    children: React.ReactNode;
    routeDefinitions: RouteDefinition[];
    routeObjects: RouteObject[];
    routeDefMap: Map<string, RouteDefinition>;
    defaultPath: string;
}): React.ReactElement {
    const value = React.useMemo(
        () => ({
            routeDefinitions,
            routeObjects,
            routeDefMap,
            defaultPath,
        }),
        [routeDefinitions, routeObjects, routeDefMap, defaultPath]
    );

    return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouterContext(): RouterContextValue {
    const context = React.useContext(RouterContext);
    if (!context) {
        throw new Error('useRouterContext must be used within a RouterContextProvider');
    }
    return context;
}
