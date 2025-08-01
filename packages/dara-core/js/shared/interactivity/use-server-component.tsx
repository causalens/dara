/* eslint-disable react-hooks/exhaustive-deps */
import { nanoid } from 'nanoid';
import { useContext, useEffect } from 'react';
import {
    type RecoilState,
    type RecoilValue,
    atom,
    selectorFamily,
    useRecoilCallback,
    useRecoilValueLoadable,
} from 'recoil';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { type WebSocketClientInterface, fetchTaskResult, request } from '@/api';
import { type RequestExtras, RequestExtrasSerializable } from '@/api/http';
import { handleAuthErrors } from '@/auth';
import { useDeferLoadable } from '@/shared/utils';
import { denormalize, normalizeRequest } from '@/shared/utils/normalization';
import {
    type AnyVariable,
    type ComponentInstance,
    type GlobalTaskContext,
    type NormalizedPayload,
    type TaskResponse,
    isVariable,
} from '@/types';

import { VariableCtx, WebSocketCtx, useRequestExtras } from '../context';
import { useTaskContext } from '../context/global-task-context';
import { useEventBus } from '../event-bus/event-bus';
import { resolveDerivedValue } from './derived-variable';
import { cleanKwargs, resolveVariable } from './resolve-variable';
import {
    type TriggerIndexValue,
    atomRegistry,
    depsRegistry,
    selectorFamilyMembersRegistry,
    selectorFamilyRegistry,
} from './store';

function isTaskResponse(response: any): response is TaskResponse {
    return response && typeof response === 'object' && 'task_id' in response;
}

/**
 * Generate a registry key for a component instance
 *
 * @param uid component instance uid
 * @param trigger whether it's a trigger key
 */
export function getComponentRegistryKey(uid: string, trigger?: boolean, loopInstanceUid?: string): string {
    let key = `_COMPONENT_${uid}`;

    if (trigger) {
        key += '_TRIGGER';
    }

    if (loopInstanceUid) {
        key += `_${loopInstanceUid}`;
    }

    return key;
}

/**
 * Fetch a component from the backend, expects a component instance to be returned.
 *
 * @param component the component to fetch
 * @param values the values to pass into the component
 * @param uid the component instance uid
 * @param extras request extras to be merged into the options
 * @param wsClient websocket client
 */
async function fetchFunctionComponent(
    component: string,
    values: {
        [k: string]: any;
    },
    uid: string,
    extras: RequestExtras,
    wsClient: WebSocketClientInterface
): Promise<TaskResponse | NormalizedPayload<ComponentInstance> | null> {
    const ws_channel = await wsClient.getChannel();
    const res = await request(
        `/api/core/components/${component}`,
        {
            body: JSON.stringify({ uid, values, ws_channel }),
            method: HTTP_METHOD.POST,
        },
        extras
    );
    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to fetch the component: ${component}`);
    const result: TaskResponse | NormalizedPayload<ComponentInstance> | null = await res.json();
    return result;
}

function getOrRegisterComponentTrigger(uid: string, loop_instance_uid?: string): RecoilState<TriggerIndexValue> {
    const triggerKey = getComponentRegistryKey(uid, true, loop_instance_uid);

    if (!atomRegistry.has(triggerKey)) {
        atomRegistry.set(
            triggerKey,
            atom({
                default: {
                    force_key: null,
                    inc: 0,
                } satisfies TriggerIndexValue,
                key: triggerKey,
            })
        );
    }

    return atomRegistry.get(triggerKey)!;
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
 * @param currentExtras request extras to be merged into the options
 */
function getOrRegisterServerComponent({
    name,
    uid,
    dynamicKwargs,
    wsClient,
    taskContext,
    currentExtras,
    loop_instance_uid,
}: {
    name: string;
    uid: string;
    dynamicKwargs: Record<string, AnyVariable<any>>;
    wsClient: WebSocketClientInterface;
    taskContext: GlobalTaskContext;
    currentExtras: RequestExtras;
    loop_instance_uid?: string;
}): RecoilValue<ComponentInstance> {
    const key = getComponentRegistryKey(uid, false, loop_instance_uid);

    if (!selectorFamilyRegistry.has(key)) {
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                cachePolicy_UNSTABLE: {
                    eviction: 'most-recent',
                },
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    async ({ get }) => {
                        // Kwargs resolved to their simple values
                        const resolvedKwargs = Object.keys(dynamicKwargs).reduce(
                            (acc, k) => {
                                const value = dynamicKwargs[k]!;
                                acc[k] =
                                    isVariable(value) ?
                                        resolveVariable(value, wsClient, taskContext, currentExtras)
                                    :   value;
                                return acc;
                            },
                            {} as Record<string, any>
                        );

                        // Turn kwargs into lists so we can re-use the DerivedVariable logic
                        const resolvedKwargsList = Object.values(resolvedKwargs);
                        const kwargsList = Object.values(dynamicKwargs);

                        const triggerAtom = getOrRegisterComponentTrigger(uid);
                        const selfTrigger = get(triggerAtom);

                        const { extras } = extrasSerializable;

                        const derivedResult = resolveDerivedValue(
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
                            Object.keys(dynamicKwargs).reduce(
                                (acc, k, idx) => {
                                    acc[k] = derivedResult.values[idx];
                                    return acc;
                                },
                                {} as Record<string, any>
                            )
                        );

                        let result = null;

                        try {
                            result = await fetchFunctionComponent(
                                name,
                                normalizeRequest(kwargValues, dynamicKwargs),
                                uid,
                                extras,
                                wsClient
                            );
                        } catch (e) {
                            (e as any).selectorId = key;
                            (e as any).selectorExtras = extrasSerializable.toJSON();
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
                            } catch (e: unknown) {
                                (e as any).selectorId = key;
                                (e as any).selectorExtras = extrasSerializable.toJSON();
                                throw e;
                            } finally {
                                taskContext.endTask(taskId);
                            }

                            try {
                                result = await fetchTaskResult<NormalizedPayload<ComponentInstance>>(taskId, extras);
                            } catch (e) {
                                (e as any).selectorId = key;
                                (e as any).selectorExtras = extrasSerializable.toJSON();
                                throw e;
                            }
                        }

                        if (result !== null) {
                            // Denormalize
                            result = denormalize(result.data, result.lookup);
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

    const family = selectorFamilyRegistry.get(key)!;

    // Get a selector instance for this particular extras value
    // This is required as otherwise the selector is not aware of different possible extras values
    // at the call site of e.g. useVariable and would otherwise be a stale closure using the initial extras when
    // first registered
    const serializableExtras = new RequestExtrasSerializable(currentExtras);
    const selectorInstance = family(serializableExtras);

    // register selector instance in the selector family registry
    if (!selectorFamilyMembersRegistry.has(family)) {
        selectorFamilyMembersRegistry.set(family, new Map());
    }
    selectorFamilyMembersRegistry.get(family)!.set(serializableExtras.toJSON(), selectorInstance);

    return selectorInstance;
}

/**
 * A hook to fetch a server component
 *
 * @param name component name - specific to a given py_component
 * @param uid component uid - specific to a given *instance* of a py_component
 * @param dynamicKwargs kwargs passed into the component
 * @param loop_instance_uid loop instance uid - extra loop variable key
 */
export default function useServerComponent(
    name: string,
    uid: string,
    dynamicKwargs: Record<string, AnyVariable<any>>,
    loop_instance_uid?: string
): ComponentInstance {
    const extras = useRequestExtras();
    const { client: wsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const variablesContext = useContext(VariableCtx);

    const bus = useEventBus();

    // Synchronously register the py_component uid, and clean it up on unmount
    variablesContext?.variables.current.add(getComponentRegistryKey(uid));
    useEffect(() => {
        return () => {
            variablesContext?.variables.current.delete(getComponentRegistryKey(uid));
        };
    }, []);

    const componentSelector = getOrRegisterServerComponent({
        name,
        uid,
        dynamicKwargs,
        wsClient,
        taskContext,
        currentExtras: extras,
        loop_instance_uid,
    });
    const componentLoadable = useRecoilValueLoadable(componentSelector);

    useEffect(() => {
        if (componentLoadable.state === 'hasValue') {
            bus.publish('SERVER_COMPONENT_LOADED', { name, uid, value: componentLoadable.contents });
        }
    }, [componentLoadable]);

    const deferred = useDeferLoadable(componentLoadable);

    return deferred;
}

/**
 * A helper hook that returns a function to force a refresh of a server component
 *
 * @param name component uid
 */
export function useRefreshServerComponent(uid: string, loop_instance_uid?: string): () => void {
    return useRecoilCallback(
        ({ set }) =>
            () => {
                const triggerAtom = getOrRegisterComponentTrigger(uid, loop_instance_uid);

                set(triggerAtom, (triggerIndexValue) => ({
                    force_key: nanoid(),
                    inc: triggerIndexValue.inc + 1,
                }));
            },
        [uid]
    );
}
