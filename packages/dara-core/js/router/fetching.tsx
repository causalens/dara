import { type Params, matchRoutes } from 'react-router';
import { type Snapshot, useRecoilCallback } from 'recoil';
import * as z from 'zod/v4';

import { HTTP_METHOD } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth';
import { type Deferred, type DerivedResult, deferred, preloadDerivedVariable, preloadServerComponent } from '@/shared';
import {
    type Action,
    ActionImpl,
    type ComponentInstance,
    type DerivedVariable,
    LoaderError,
    type LoaderErrorPayload,
    type NormalizedPayload,
    type PyComponentInstance,
    type RouteDefinition,
    isAnnotatedAction,
} from '@/types';

import { cleanArgs, cleanKwargs, resolveVariableStatic } from '../shared/interactivity/resolve-variable';
import { denormalize, normalizeRequest } from '../shared/utils/normalization';
import { SingleUseCache } from './cache';
import { useRouterContext } from './context';

interface RouteDataRequestBody {
    action_payloads: ActionPayload[];
    derived_variable_payloads: DerivedVariablePayload[];
    py_component_payloads: PyComponentPayload[];
    ws_channel: string | null;
    params: Params<string>;
}

interface ActionPayload {
    definition_uid: string;
    uid: string;
    values: NormalizedPayload<any>;
}

const NormalizedObject = z.object({
    data: z.any(),
    lookup: z.record(z.string(), z.any()),
});

export const TemplateChunk = z.object({
    type: z.literal('template'),
    template: NormalizedObject,
});
export type TemplateChunk = z.infer<typeof TemplateChunk>;

export const ActionChunk = z.object({
    type: z.literal('actions'),
    actions: z.record(z.string(), z.array(ActionImpl)),
});
export type ActionChunk = z.infer<typeof ActionChunk>;

export const DerivedVariableChunk = z.object({
    type: z.literal('derived_variable'),
    uid: z.string(),
    result: z.object({ ok: z.boolean(), value: z.any() }),
});
export type DerivedVariableChunk = z.infer<typeof DerivedVariableChunk>;

export const PyComponentChunk = z.object({
    type: z.literal('py_component'),
    uid: z.string(),
    result: z.object({ ok: z.boolean(), value: z.any() }),
});
export type PyComponentChunk = z.infer<typeof PyComponentChunk>;

export const ResponseChunk = z.union([TemplateChunk, ActionChunk, DerivedVariableChunk, PyComponentChunk]);
export type ResponseChunk = z.infer<typeof ResponseChunk>;

interface DerivedVariablePayload {
    uid: string;
    values: NormalizedPayload<any[]>;
}

interface PyComponentPayload {
    uid: string;
    name: string;
    values: NormalizedPayload<Record<string, any>>;
}

interface DerivedVariableHandle {
    dv: DerivedVariable;
    result: DerivedResult;
    handle: Deferred<any>;
    payload: DerivedVariablePayload;
}

interface PyComponentHandle {
    py: PyComponentInstance;
    result: DerivedResult;
    handle: Deferred<any>;
    payload: PyComponentPayload;
}

export interface LoaderData {
    template: ComponentInstance;
    on_load: ActionImpl[];
    route_definition: RouteDefinition;
    derived_variables: DerivedVariableHandle[];
    py_components: PyComponentHandle[];
}

const PRELOAD_TIMEOUT = 5000; // 5 seconds
const preloadCache = new SingleUseCache<LoaderData>({
    defaultTimeout: PRELOAD_TIMEOUT,
});

function createCacheKey(routeId: string, params: Params<string>): string {
    return `${routeId}:${JSON.stringify(params)}`;
}

/**
 * Creates an NDJSON async generator from a Response object.
 * Yields chunks of JSON data as they are received.
 *
 * @param response Response object to read from
 * @param signal AbortSignal to abort the generator
 */
async function* ndjson(response: Response, signal?: AbortSignal): AsyncGenerator<any, void> {
    const reader = response.body!.getReader();
    const newline = /\r?\n/;
    const decoder = new TextDecoder();

    let buffer = '';

    while (true) {
        if (signal?.aborted) {
            throw new DOMException('The operation was aborted', 'AbortError');
        }

        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) {
            if (buffer.length > 0) {
                yield JSON.parse(buffer);
            }
            return;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const parts = buffer.split(newline);
        buffer = parts.pop()!;
        for (const part of parts) {
            yield JSON.parse(part);
        }
    }
}

/**
 * Fetch route data from the server.
 *
 * Collects payloads for `on_load` actions as wel as `derived_variable`s and `py_component`s on the page and sends them in the same request.
 */
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

    // Collect payloads for DVs and py_components,
    // preloading ones that don't have a cached value
    const dvHandles = Object.values(route.dependency_graph?.derived_variables ?? {}).flatMap((dv) => {
        const handle = preloadDerivedVariable(dv, snapshot);
        if (!handle) {
            return [];
        }
        return {
            ...handle,
            dv,
            payload: {
                values: normalizeRequest(cleanArgs(handle.result.values, null), dv.variables) as any,
                uid: dv.uid,
            } satisfies DerivedVariablePayload,
        };
    });
    const pyHandles = Object.values(route.dependency_graph?.py_components ?? {}).flatMap((py) => {
        const handle = preloadServerComponent(py, snapshot);

        if (!handle) {
            return [];
        }

        // turn the resolved values back into an object and clean them up
        const kwargValues = cleanKwargs(
            Object.keys(py.props.dynamic_kwargs).reduce(
                (acc, k, idx) => {
                    acc[k] = handle.result.values[idx];
                    return acc;
                },
                {} as Record<string, any>
            )
        );

        return {
            ...handle,
            py,
            payload: {
                uid: py.uid,
                name: py.name,
                values: normalizeRequest(kwargValues, py.props.dynamic_kwargs),
            } satisfies PyComponentPayload,
        };
    });

    const dvHandlesByUid = dvHandles.reduce(
        (acc, h) => ({ ...acc, [h.dv.uid]: h }),
        {} as Record<string, DerivedVariableHandle>
    );
    const pyHandlesByUid = pyHandles.reduce(
        (acc, h) => ({ ...acc, [h.py.uid]: h }),
        {} as Record<string, PyComponentHandle>
    );

    const wsClient = await window.dara.ws.getValue();
    const wsChannel = await wsClient.getChannel();
    const response = await request(`/api/core/route/${route.id}`, {
        method: HTTP_METHOD.POST,
        body: JSON.stringify({
            action_payloads: actionPayloads,
            derived_variable_payloads: dvHandles.map((h) => h.payload),
            py_component_payloads: pyHandles.map((h) => h.payload),
            ws_channel: wsChannel,
            params,
        } satisfies RouteDataRequestBody),
        signal,
    });
    await handleAuthErrors(response, true);

    if (!response.ok) {
        const error = (await response.json()) as { detail: LoaderErrorPayload };
        throw new LoaderError(error.detail);
    }

    const template = deferred<ComponentInstance>();
    const onLoadActions = deferred<ActionImpl[]>();

    const resolvedDvs = new Set<string>();
    const resolvedPyComponents = new Set<string>();

    // kick off the async generator in the background
    queueMicrotask(async () => {
        try {
            for await (const data of ndjson(response, signal)) {
                const chunk = ResponseChunk.parse(data);

                if (chunk.type === 'template') {
                    const component = denormalize(chunk.template.data, chunk.template.lookup) as ComponentInstance;
                    template.resolve(component);
                }
                if (chunk.type === 'actions') {
                    onLoadActions.resolve(actions.flatMap((a) => (isAnnotatedAction(a) ? chunk.actions[a.uid]! : a)));
                }

                // process the other chunks, resolving the deferreds as they come in
                if (chunk.type === 'derived_variable') {
                    dvHandlesByUid[chunk.uid]?.handle.resolve(chunk.result);
                    resolvedDvs.add(chunk.uid);
                }
                if (chunk.type === 'py_component') {
                    pyHandlesByUid[chunk.uid]?.handle.resolve(chunk.result);
                    resolvedPyComponents.add(chunk.uid);
                }
            }
        } catch (e) {
            template.reject(e);
            onLoadActions.reject(e);

            // reject remaining unresolved promises
            for (const [uid, handle] of Object.entries(dvHandlesByUid)) {
                if (!resolvedDvs.has(uid)) {
                    handle.handle.reject(e);
                }
            }
            for (const [uid, handle] of Object.entries(pyHandlesByUid)) {
                if (!resolvedPyComponents.has(uid)) {
                    handle.handle.reject(e);
                }
            }
        }
    });

    // return as soon as we have the template and on_load actions
    const [templateValue, onLoadActionsValue] = await Promise.all([template.getValue(), onLoadActions.getValue()]);
    return {
        template: templateValue,
        on_load: onLoadActionsValue,
        route_definition: route,
        py_components: pyHandles,
        derived_variables: dvHandles,
    } satisfies LoaderData;
}

/**
 * Retrieve route data from the preload cache.
 *
 * @param routeId route ID
 * @param params current route params
 */
export function getFromPreloadCache(
    routeId: string,
    params: Params<string>
): LoaderData | Promise<LoaderData> | undefined {
    return preloadCache.get(createCacheKey(routeId, params));
}

/**
 * Provides a function to preload data for all routes matching a given URL.
 * Checks the preload cache first, and if not found, fetches the data from the server.
 */
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

                    preloadCache.setIfMissing(createCacheKey(routeDef.id, match.params), () => {
                        return fetchRouteData(routeDef, match.params, snapshot);
                    });
                });
            },
        [routeDefMap, routeObjects]
    );
}
