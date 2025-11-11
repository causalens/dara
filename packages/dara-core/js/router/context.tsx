import * as React from 'react';
import { type RouteObject } from 'react-router';

import { type RouteDefinition, type RouteMatch, type Variable } from '@/types';

interface RouterContextValue {
    routeDefinitions: RouteDefinition[];
    routeObjects: RouteObject[];
    routeDefMap: Map<string, RouteDefinition>;
    defaultPath: string;
    routeMatches: Variable<RouteMatch[]>;
}

const RouterContext = React.createContext<RouterContextValue | null>(null);

export function RouterContextProvider({
    children,
    routeDefinitions,
    routeObjects,
    routeDefMap,
    defaultPath,
    routeMatches,
}: {
    children: React.ReactNode;
    routeDefinitions: RouteDefinition[];
    routeObjects: RouteObject[];
    routeDefMap: Map<string, RouteDefinition>;
    defaultPath: string;
    routeMatches: Variable<RouteMatch[]>;
}): React.ReactElement {
    const value = React.useMemo(
        () => ({
            routeDefinitions,
            routeObjects,
            routeDefMap,
            defaultPath,
            routeMatches,
        }),
        [routeDefinitions, routeObjects, routeDefMap, defaultPath, routeMatches]
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
