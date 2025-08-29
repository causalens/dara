import type { QueryClient } from '@tanstack/query-core';
import { type UseQueryOptions } from '@tanstack/react-query';
import * as React from 'react';
import { type LoaderFunctionArgs, useLoaderData, useMatches } from 'react-router';
import type { Snapshot } from 'recoil';

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
import { useAction } from '../interactivity';
import { cleanKwargs, resolveVariableStatic } from '../interactivity/resolve-variable';
import { useWindowTitle } from '../utils';
import { denormalize, normalizeRequest } from '../utils/normalization';

interface RouteResponse {
    template: NormalizedPayload<ComponentInstance>;
    on_load: ActionImpl[];
}

interface ActionPayload {
    uid: string;
    values: NormalizedPayload<any>;
}

/**
 * We're using React Query for the loader to utilize a cache. This allows us to
 * implement custom prefetching logic on links. React Router is not a cache
 * and by default will always refetch the data on every navigation.
 *
 * See https://tkdodo.eu/blog/react-query-meets-react-router
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const loaderQuery = (route: RouteDefinition, snapshotRef: React.MutableRefObject<Snapshot>) =>
    ({
        queryKey: ['route', route.id],
        queryFn: async ({ signal }) => {
            // collect payloads for annotated actions - action impls can on the client
            let actionPayloads: ActionPayload[] = [];
            if (route.on_load) {
                const actions = Array.isArray(route.on_load) ? route.on_load : [route.on_load];
                actionPayloads = actions.filter(isAnnotatedAction).map((a) => {
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
                        values: normalizeRequest(kwargs, a.dynamic_kwargs),
                    };
                });
            }

            const response = await request('/api/core/route', {
                method: HTTP_METHOD.POST,
                body: JSON.stringify({
                    id: route.id,
                    action_payloads: actionPayloads,
                }),
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
            return { template, on_load: responseContent.on_load };
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        cacheTime: 0,
        staleTime: 0,
    }) satisfies UseQueryOptions;

export function createRouteLoader(
    route: RouteDefinition,
    queryClient: QueryClient,
    snapshotRef: React.MutableRefObject<Snapshot>
) {
    return async function loader({ request: loaderRequest }: LoaderFunctionArgs) {
        // make sure RR's signal cancels the prefetch
        const query = loaderQuery(route, snapshotRef);
        loaderRequest.signal.addEventListener('abort', () => {
            queryClient.cancelQueries(query);
        });
        return queryClient.ensureQueryData(query);
    };
}

function RouteContent(props: { route: RouteDefinition }): React.ReactNode {
    const { template, on_load } = useLoaderData<ReturnType<typeof createRouteLoader>>();
    const executeAction = useExecuteAction();

    // TODO: execute actions synchronously here

    // only sync title for the most exact route
    const matches = useMatches();
    const isMostExact = matches.at(-1)!.id === props.route.id;
    useWindowTitle(props.route.name, isMostExact);

    return <DynamicComponent component={template} />;
}

export default RouteContent;
