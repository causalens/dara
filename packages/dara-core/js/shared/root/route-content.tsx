/* eslint-disable react/no-unused-prop-types */
import type { QueryClient } from '@tanstack/query-core';
import { type UseQueryOptions } from '@tanstack/react-query';
import * as React from 'react';
import { Await, type LoaderFunctionArgs, type Params, useLoaderData, useMatches } from 'react-router';
import { type Snapshot } from 'recoil';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth';
import { DefaultFallbackStatic } from '@/components/fallback/default';
import {
    type Action,
    type ActionImpl,
    type ComponentInstance,
    type NormalizedPayload,
    type RouteDefinition,
    isAnnotatedAction,
} from '@/types';

import DynamicComponent from '../dynamic-component/dynamic-component';
import { cleanKwargs, resolveVariableStatic } from '../interactivity/resolve-variable';
import { useExecuteAction } from '../interactivity/use-action';
import { useWindowTitle } from '../utils';
import { denormalize, normalizeRequest } from '../utils/normalization';

interface RouteDataRequestBody {
    action_payloads: ActionPayload[];
    ws_channel: string | null;
    params: Params<string>;
}

interface RouteResponse {
    template: NormalizedPayload<ComponentInstance>;
    action_results: Record<string, ActionImpl[]>;
}

interface ActionPayload {
    definition_uid: string;
    uid: string;
    values: NormalizedPayload<any>;
}

interface LoaderData {
    template: ComponentInstance;
    on_load: ActionImpl[];
    route_definition: RouteDefinition;
}

export interface LoaderResult {
    data: LoaderData | Promise<LoaderData>;
}

/**
 * We're using React Query for the loader to utilize a cache. This allows us to
 * implement custom prefetching logic on links. React Router is not a cache
 * and by default will always refetch the data on every navigation.
 *
 * See https://tkdodo.eu/blog/react-query-meets-react-router
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const loaderQuery = (route: RouteDefinition, params: Params<string>, snapshotRef: React.MutableRefObject<Snapshot>) =>
    ({
        queryKey: ['route', route.id, params],
        queryFn: async ({ signal }) => {
            // collect payloads for annotated actions - action impls can stay on the client
            let actions: Action = [];
            if (Array.isArray(route.on_load)) {
                actions = route.on_load;
            } else if (route.on_load) {
                actions = [route.on_load];
            }
            const actionPayloads = actions.filter(isAnnotatedAction).map((a) => {
                const kwargs = cleanKwargs(
                    Object.fromEntries(
                        Object.entries(a.dynamic_kwargs).map(([k, v]) => {
                            return [k, resolveVariableStatic(v, snapshotRef.current)];
                        })
                    ),
                    null
                );
                return {
                    uid: a.uid,
                    definition_uid: a.definition_uid,
                    values: normalizeRequest(kwargs, a.dynamic_kwargs),
                } satisfies ActionPayload;
            });

            const response = await request(`/api/core/route/${route.id}`, {
                method: HTTP_METHOD.POST,
                body: JSON.stringify({
                    action_payloads: actionPayloads,
                    ws_channel: window.dara.ws ? await window.dara.ws.getChannel() : null,
                    params,
                } satisfies RouteDataRequestBody),
                // ensures loader requests are cancelled if user changes their mind
                signal,
            });
            await handleAuthErrors(response, true);
            await validateResponse(response, 'Failed to fetch the route data for this app');
            const responseContent: RouteResponse = await response.json();
            const template = denormalize(
                responseContent.template.data,
                responseContent.template.lookup
            ) as ComponentInstance;

            const onLoad = actions.flatMap((a) => {
                if (isAnnotatedAction(a)) {
                    return responseContent.action_results[a.uid]!;
                }
                return a;
            });

            return { template, on_load: onLoad, route_definition: route } satisfies LoaderData;
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        cacheTime: 0,
        staleTime: 0,
    }) satisfies UseQueryOptions;

function hasServerActions(route: RouteDefinition): boolean {
    if (!route.on_load) {
        return false;
    }
    const actions = Array.isArray(route.on_load) ? route.on_load : [route.on_load];
    return actions.some(isAnnotatedAction);
}

export function createRouteLoader(
    route: RouteDefinition,
    queryClient: QueryClient,
    snapshotRef: React.MutableRefObject<Snapshot>
) {
    return async function loader({ request: loaderRequest, params }: LoaderFunctionArgs) {
        // make sure RR's signal cancels the prefetch
        const query = loaderQuery(route, params, snapshotRef);
        loaderRequest.signal.addEventListener('abort', () => {
            queryClient.cancelQueries(query);
        });

        let result: any = queryClient.ensureQueryData(query);

        // Let the result through as a promise if it's a page/index route with server actions on_load.
        // Otherwise, await and block the navigation.
        // This lets us render the fallback for pages without holding the navigation
        // while the request is in flight, as th expectation is that it will take
        // longer if there are AnnotatedActions to run.
        // TODO: alternatively we can always block unless an explicit fallback is provided
        if (!((route.__typename === 'IndexRoute' || route.__typename === 'PageRoute') && hasServerActions(route))) {
            result = await result;
        }

        return { data: result };
    };
}

function Content({
    route,
    on_load,
    template,
}: LoaderData & {
    route: RouteDefinition;
}): React.ReactNode {
    const executeAction = useExecuteAction();
    const [isLoading, setIsLoading] = React.useState(on_load.length > 0);

    React.useLayoutEffect(() => {
        if (on_load.length === 0) {
            return;
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
    }, [route.id, on_load, executeAction]);

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
