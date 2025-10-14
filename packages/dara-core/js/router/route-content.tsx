/* eslint-disable react/no-unused-prop-types */
import * as React from 'react';
import { Await, type LoaderFunctionArgs, useLoaderData, useMatches } from 'react-router';
import { type Snapshot } from 'recoil';

import { DefaultFallbackStatic } from '@/components/fallback/default';
import { depsRegistry } from '@/shared';
import { type ComponentInstance, type RouteDefinition } from '@/types';

import DynamicComponent from '../shared/dynamic-component/dynamic-component';
import { useExecuteAction } from '../shared/interactivity/use-action';
import { useWindowTitle } from '../shared/utils';
import { type LoaderData, fetchRouteData, getFromPreloadCache } from './fetching';

export interface LoaderResult {
    data: LoaderData | Promise<LoaderData>;
    fallback?: ComponentInstance;
}

/**
 * Determines whether to hold navigation (await promise) or let it suspend.
 * Currently holds navigation unless the page defines an explicit fallback which we can show immediately.
 */
function shouldHoldPromise(route: RouteDefinition): boolean {
    return !route.fallback;
}

export function createRouteLoader(route: RouteDefinition, snapshot: () => Snapshot) {
    return async function loader({ request: loaderRequest, params }: LoaderFunctionArgs) {
        // Check preload cache first
        let result: LoaderData | Promise<LoaderData> | undefined = getFromPreloadCache(route.id, params);

        // Not in cache, fetch fresh data
        // Note: loader-initiated requests are NOT cached
        if (!result) {
            const snapshotInstance = snapshot();
            const release = snapshotInstance.retain();

            result = fetchRouteData(route, params, snapshotInstance, loaderRequest.signal).finally(() => {
                // ensure that after the fetcher completes, the snapshot is released
                release();
            });
        }

        if (shouldHoldPromise(route)) {
            result = await result;
        }

        return { data: result, fallback: route.fallback };
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
    const { data, fallback } = useLoaderData<LoaderResult>();

    const fallbackComponent = React.useMemo(
        () => (fallback ? <DynamicComponent component={fallback} /> : <DefaultFallbackStatic />),
        [fallback]
    );


    if (data instanceof Promise) {
        return (
            <React.Suspense fallback={fallbackComponent}>
                <Await resolve={data}>{(resolved) => <Content {...resolved} route={props.route} />}</Await>
            </React.Suspense>
        );
    }

    return <Content {...data} route={props.route} />;
}

export default RouteContent;
