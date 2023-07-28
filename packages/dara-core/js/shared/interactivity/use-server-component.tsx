import { useContext, useEffect } from 'react';
import { useLocation } from 'react-router';
import { RecoilState, RecoilValue, atom, selector, useRecoilCallback, useRecoilValueLoadable } from 'recoil';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { WebSocketClientInterface, fetchTaskResult, request } from '@/api';
import { useSessionToken } from '@/auth';
import { useDeferLoadable } from '@/shared/utils';
import { normalizeRequest } from '@/shared/utils/normalization';
import {
    AnyVariable,
    ComponentInstance,
    TaskResponse,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
} from '@/types';

import { VariableCtx, WebSocketCtx } from '../context';
import { GlobalTaskContext, useTaskContext } from '../context/global-task-context';
import { resolveDerivedValue } from './derived-variable';
import { resolveVariable } from './resolve-variable';
import { TriggerIndexValue, atomRegistry, depsRegistry, selectorRegistry } from './store';

function isTaskResponse(response: any): response is TaskResponse {
    return response && typeof response === 'object' && 'task_id' in response;
}

/**
 * Generate a registry key for a component instance
 *
 * @param uid component instance uid
 * @param trigger whether it's a trigger key
 */
function getComponentRegistryKey(uid: string, trigger?: boolean): string {
    let key = `_COMPONENT_${uid}`;

    if (trigger) {
        key += '_TRIGGER';
    }

    return key;
}

/**
 * Fetch a component from the backend, expects a component instance to be returned.
 *
 * @param component the component to fetch
 * @param taskRef ref holding the current running task id
 */
async function fetchFunctionComponent(
    component: string,
    values: {
        [k: string]: any;
    },
    uid: string,
    token: string,
    wsClient: WebSocketClientInterface
): Promise<TaskResponse | ComponentInstance | null> {
    const ws_channel = await wsClient.getChannel();
    const res = await request(
        `/api/core/components/${component}`,
        {
            body: JSON.stringify({ uid, values, ws_channel }),
            method: HTTP_METHOD.POST,
        },
        token
    );
    await validateResponse(res, `Failed to fetch the component: ${component}`);
    const result: TaskResponse | ComponentInstance | null = await res.json();
    return result;
}

/**
 * Claan value to a format understood by the backend.
 * Removes `deps`, appends `force` to resolved derived(data)variables.
 *
 * @param value a value to clean
 * @param force whether to force a derived variable recalculation
 */
export function cleanValue(value: unknown, force: boolean): any {
    if (isResolvedDerivedVariable(value) || isResolvedDerivedDataVariable(value)) {
        const { deps, ...rest } = value;
        const cleanedValues = value.values.map((v) => cleanValue(v, force));

        return {
            ...rest,
            force,
            values: cleanedValues,
        };
    }

    return value;
}

function cleanKwargs(kwargs: Record<string, any>, force: boolean): Record<string, any> {
    return Object.keys(kwargs).reduce((acc, k) => {
        acc[k] = cleanValue(kwargs[k], force);
        return acc;
    }, {} as Record<string, any>);
}

function getOrRegisterComponentTrigger(uid: string): RecoilState<TriggerIndexValue> {
    const triggerKey = getComponentRegistryKey(uid, true);

    if (!atomRegistry.has(triggerKey)) {
        atomRegistry.set(
            triggerKey,
            atom({
                default: {
                    force: false,
                    inc: 0,
                },
                key: triggerKey,
            })
        );
    }

    return atomRegistry.get(triggerKey);
}

/**
 * Get a server component from the selector registry, registering it if not already registered
 *
 * @param name component name
 * @param uid  component uid
 * @param dynamicKwargs kwargs
 * @param wsClient websocket client
 * @param taskContext task context
 * @param search current search string
 * @param token auth token
 */
function getOrRegisterServerComponent(
    name: string,
    uid: string,
    dynamicKwargs: Record<string, AnyVariable<any>>,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    search: string,
    token: string
): RecoilValue<ComponentInstance> {
    const key = getComponentRegistryKey(uid);

    if (!selectorRegistry.has(key)) {
        // Kwargs resolved to their simple values
        const resolvedKwargs = Object.keys(dynamicKwargs).reduce((acc, k) => {
            const value = dynamicKwargs[k];
            acc[k] = resolveVariable(value, wsClient, taskContext, search, token);
            return acc;
        }, {} as Record<string, any>);

        // Turn kwargs into lists so we can re-use the DerivedVariable logic
        const resolvedKwargsList = Object.values(resolvedKwargs);
        const kwargsList = Object.values(dynamicKwargs);
        const triggerAtom = getOrRegisterComponentTrigger(uid);

        selectorRegistry.set(
            key,
            selector({
                cachePolicy_UNSTABLE: {
                    eviction: 'most-recent',
                },
                get: async ({ get }) => {
                    const selfTrigger = get(triggerAtom);

                    const derivedResult = await resolveDerivedValue(
                        key,
                        kwargsList,
                        kwargsList, // pass deps=kwargs
                        resolvedKwargsList,
                        wsClient,
                        get,
                        selfTrigger
                    );

                    // returning previous result as no change in dependant values
                    if (derivedResult.type === 'previous') {
                        return derivedResult.entry.result;
                    }

                    // Otherwise fetch new component

                    // turn the resolved values back into an object and clean them up
                    const kwargValues = cleanKwargs(
                        Object.keys(dynamicKwargs).reduce((acc, k, idx) => {
                            acc[k] = derivedResult.values[idx];
                            return acc;
                        }, {} as Record<string, any>),
                        derivedResult.force
                    );

                    let result = null;

                    try {
                        result = await fetchFunctionComponent(
                            name,
                            normalizeRequest(kwargValues, dynamicKwargs),
                            uid,
                            token,
                            wsClient
                        );
                    } catch (e) {
                        e.selectorId = key;
                        throw e;
                    }

                    taskContext.cleanupRunningTasks(key);

                    // Metatask returned
                    if (isTaskResponse(result)) {
                        const taskId = result.task_id;

                        // Register the task under the component's instance key
                        taskContext.startTask(taskId, key, getComponentRegistryKey(uid, true));

                        try {
                            await wsClient.waitForTask(taskId);
                        } catch {
                            return null;
                        } finally {
                            taskContext.endTask(taskId);
                        }

                        try {
                            result = await fetchTaskResult<ComponentInstance>(taskId, token);
                        } catch (e) {
                            e.selectorId = key;
                            throw e;
                        }
                    }

                    depsRegistry.set(key, {
                        args: derivedResult.relevantValues,
                        cacheKey: null,
                        result,
                    });

                    return result;
                },
                key,
            })
        );
    }

    return selectorRegistry.get(key);
}

/**
 * A hook to fetch a server component
 *
 * @param name component name - specific to a given py_component
 * @param uid component uid - specific to a given *instance* of a py_component
 * @param dynamicKwargs kwargs passed into the component
 */
export default function useServerComponent(
    name: string,
    uid: string,
    dynamicKwargs: Record<string, AnyVariable<any>>
): ComponentInstance {
    const token = useSessionToken();
    const { client: wsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const variablesContext = useContext(VariableCtx);
    const { search } = useLocation();

    // Synchronously register the py_component uid, and clean it up on unmount
    variablesContext.variables.current.add(getComponentRegistryKey(uid));
    useEffect(() => {
        return () => {
            variablesContext.variables.current.delete(getComponentRegistryKey(uid));
        };
    }, []);

    const componentSelector = getOrRegisterServerComponent(
        name,
        uid,
        dynamicKwargs,
        wsClient,
        taskContext,
        search,
        token
    );
    const componentLoadable = useRecoilValueLoadable(componentSelector);
    const deferred = useDeferLoadable(componentLoadable);

    return deferred;
}

/**
 * A helper hook that returns a function to force a refresh of a server component
 *
 * @param name component uid
 */
export function useRefreshServerComponent(uid: string): () => void {
    return useRecoilCallback(
        ({ set }) =>
            () => {
                const triggerAtom = getOrRegisterComponentTrigger(uid);

                set(triggerAtom, (triggerIndexValue) => ({
                    force: false,
                    inc: triggerIndexValue.inc + 1,
                }));
            },
        [uid]
    );
}
