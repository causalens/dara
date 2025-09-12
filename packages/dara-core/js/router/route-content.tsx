/* eslint-disable react/no-unused-prop-types */
import * as React from 'react';
import { Await, type LoaderFunctionArgs, useLoaderData, useMatches } from 'react-router';
import { type Snapshot } from 'recoil';

import { DefaultFallbackStatic } from '@/components/fallback/default';
import { depsRegistry } from '@/shared';
import { type RouteDefinition, isAnnotatedAction } from '@/types';

import DynamicComponent from '../shared/dynamic-component/dynamic-component';
import { useExecuteAction } from '../shared/interactivity/use-action';
import { useWindowTitle } from '../shared/utils';
import { type LoaderData, fetchRouteData, getFromPreloadCache } from './fetching';

export interface LoaderResult {
    data: LoaderData | Promise<LoaderData>;
}

function hasServerActions(route: RouteDefinition): boolean {
    if (!route.on_load) {
        return false;
    }
    const actions = Array.isArray(route.on_load) ? route.on_load : [route.on_load];
    return actions.some(isAnnotatedAction);
}

/**
 * Determines whether to hold navigation (await promise) or let it suspend.
 * Currently holds navigation unless it's a page/index route with server actions.
 * This allows rendering fallbacks for routes with server actions while blocking
 * navigation for simpler routes.
 */
function shouldHoldPromise(route: RouteDefinition): boolean {
    return !((route.__typename === 'IndexRoute' || route.__typename === 'PageRoute') && hasServerActions(route));
}

export function createRouteLoader(route: RouteDefinition, snapshotRef: React.MutableRefObject<Snapshot>) {
    return async function loader({ request: loaderRequest, params }: LoaderFunctionArgs) {
        // Check preload cache first
        let result: LoaderData | Promise<LoaderData> | undefined = getFromPreloadCache(route.id, params);

        if (!result) {
            // Not in cache, fetch fresh data
            // Note: loader-initiated requests are NOT cached
            result = fetchRouteData(route, params, snapshotRef.current, loaderRequest.signal);
        }

        if (shouldHoldPromise(route)) {
            result = await result;
        }

        return { data: result };
    };
}

function Content({
    route,
    on_load,
    template,
    py_components,
    derived_variables,
}: LoaderData & {
    route: RouteDefinition;
}): React.ReactNode {
    const executeAction = useExecuteAction();
    const [isLoading, setIsLoading] = React.useState(
        on_load.length > 0 || py_components.length > 0 || derived_variables.length > 0
    );

    React.useLayoutEffect(() => {
        if (on_load.length === 0 && py_components.length === 0 && derived_variables.length === 0) {
            return;
        }

        // put the pre-computed promises into the deps registry
        for (const resultHandle of [...py_components, ...derived_variables]) {
            depsRegistry.set(resultHandle.result.depsKey, {
                args: resultHandle.result.relevantValues,
                result: resultHandle.handle,
            });
        }

        let cancelled = false;

        const result = executeAction(on_load);

        // if result is a promise, handle async case
        if (result instanceof Promise) {
            result
                .then(() => {
                    if (!cancelled) {
                        setIsLoading(false);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        // eslint-disable-next-line no-console
                        console.error('Error executing on_load actions:', error);
                        setIsLoading(false);
                    }
                });
        } else {
            // synchronous case - immediately stop loading
            setIsLoading(false);
        }

        return () => {
            cancelled = true;
        };
    }, [route.id, on_load, executeAction, py_components, derived_variables]);

    // only sync title for the most exact route
    const matches = useMatches();
    const isMostExact = matches.at(-1)!.id === route.id;
    useWindowTitle(route.name, isMostExact);

    if (isLoading) {
        return <DefaultFallbackStatic />;
    }

    return <DynamicComponent component={template} />;
}

function RouteContent(props: { route: RouteDefinition }): React.ReactNode {
    const { data } = useLoaderData<LoaderResult>();

    if (data instanceof Promise) {
        return (
            <React.Suspense fallback={<DefaultFallbackStatic />}>
                <Await resolve={data}>{(resolved) => <Content {...resolved} route={props.route} />}</Await>
            </React.Suspense>
        );
    }

    return <Content {...data} route={props.route} />;
}

export default RouteContent;
