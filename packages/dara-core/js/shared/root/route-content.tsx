import type { QueryClient } from '@tanstack/query-core';
import { type UseQueryOptions, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { type LoaderFunctionArgs, useLoaderData, useMatches } from 'react-router';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth';
import { DefaultFallbackStatic } from '@/components/fallback/default';
import type { Action, ComponentInstance, NormalizedPayload, RouteDefinition } from '@/types';

import DynamicComponent from '../dynamic-component/dynamic-component';
import { useAction } from '../interactivity';
import { useWindowTitle } from '../utils';
import { denormalize } from '../utils/normalization';

interface RouteResponse {
    template: NormalizedPayload<ComponentInstance>;
    on_load: Action | null;
}

const loaderQuery = (route: RouteDefinition) =>
    ({
        queryKey: ['route', route.id],
        queryFn: async ({ signal }) => {
            const response = await request('/api/core/route', {
                method: HTTP_METHOD.POST,
                body: JSON.stringify({
                    id: route.id,
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
            return { route, template, on_load: responseContent.on_load };
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // don't cache data loaded with useQuery at all
        cacheTime: 0,
        staleTime: Infinity,
    }) satisfies UseQueryOptions;

export function createRouteLoader(route: RouteDefinition, queryClient: QueryClient) {
    return async function loader({ request: loaderRequest }: LoaderFunctionArgs) {
        // make sure RR's signal cancels the prefetch
        const query = loaderQuery(route);
        loaderRequest.signal.addEventListener('abort', () => queryClient.cancelQueries(query));
        return queryClient.ensureQueryData({
            ...query,
            // consider data older than 5 seconds stale
            staleTime: 5_000,
        });
    };
}

function RouteContent(): React.ReactNode {
    const initialData = useLoaderData<ReturnType<typeof createRouteLoader>>();
    const {
        data: { template, on_load, route },
    } = useQuery({ ...loaderQuery(initialData.route), initialData });

    // TODO: next stage this will be kicked off in the same route request, for now just run it here
    const onLoad = useAction(on_load);
    const [isReady, setIsReady] = React.useState(() => !on_load);

    React.useLayoutEffect(() => {
        if (!on_load) {
            return;
        }
        onLoad().then(() => setIsReady(true));
    }, [on_load]);

    // only sync title for the most exact route
    const matches = useMatches();
    const isMostExact = matches.at(-1)!.id === route.id;
    useWindowTitle(route.name, isMostExact);

    if (!isReady) {
        return <DefaultFallbackStatic />;
    }

    return <DynamicComponent component={template} />;
}

export default RouteContent;
