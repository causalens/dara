import { type Params, matchRoutes } from 'react-router';
import { type Snapshot, useRecoilCallback } from 'recoil';

import { HTTP_METHOD } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth';
import {
    type Action,
    type ActionImpl,
    type ComponentInstance,
    LoaderError,
    type LoaderErrorPayload,
    type NormalizedPayload,
    type RouteDefinition,
    isAnnotatedAction,
} from '@/types';

import { cleanKwargs, resolveVariableStatic } from '../shared/interactivity/resolve-variable';
import { denormalize, normalizeRequest } from '../shared/utils/normalization';
import { SingleUseCache } from './cache';
import { useRouterContext } from './context';

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

export interface LoaderData {
    template: ComponentInstance;
    on_load: ActionImpl[];
    route_definition: RouteDefinition;
}

const PRELOAD_TIMEOUT = 5000; // 5 seconds
const preloadCache = new SingleUseCache<LoaderData>({
    defaultTimeout: PRELOAD_TIMEOUT,
});

function createCacheKey(routeId: string, params: Params<string>): string {
    return `${routeId}:${JSON.stringify(params)}`;
}

export async function fetchRouteData(
    route: RouteDefinition,
    params: Params<string>,
    snapshot: Snapshot,
    signal?: AbortSignal
): Promise<LoaderData> {
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
                    return [k, resolveVariableStatic(v, snapshot)];
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
        signal,
    });
    await handleAuthErrors(response, true);

    if (!response.ok) {
        const error = (await response.json()) as { detail: LoaderErrorPayload };
        throw new LoaderError(error.detail);
    }

    const responseContent: RouteResponse = await response.json();
    const template = denormalize(responseContent.template.data, responseContent.template.lookup) as ComponentInstance;

    const onLoad = actions.flatMap((a) => (isAnnotatedAction(a) ? responseContent.action_results[a.uid]! : a));

    return { template, on_load: onLoad, route_definition: route } satisfies LoaderData;
}

export function getFromPreloadCache(
    routeId: string,
    params: Params<string>
): LoaderData | Promise<LoaderData> | undefined {
    return preloadCache.get(createCacheKey(routeId, params));
}

export function usePreloadRoute(): (url: Partial<Location> | string) => void {
    const { routeObjects, routeDefMap } = useRouterContext();

    return useRecoilCallback(
        ({ snapshot }) =>
            (url: Partial<Location> | string) => {
                // Match routes for the given URL using React Router's route objects
                const matches = matchRoutes(routeObjects, url, window.dara?.base_url);
                if (!matches) {
                    return;
                }

                matches.forEach((match) => {
                    // Find the corresponding route definition using the route ID
                    const routeDef = routeDefMap.get(match.route.id!);
                    if (!routeDef) {
                        return;
                    }

                    preloadCache.setIfMissing(createCacheKey(routeDef.id, match.params), () =>{
                        return fetchRouteData(routeDef, match.params, snapshot)
                    });
                });
            },
        [routeDefMap, routeObjects]
    );
}
