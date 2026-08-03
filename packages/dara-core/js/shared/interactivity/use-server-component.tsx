/* eslint-disable react-hooks/exhaustive-deps */
import { nanoid } from 'nanoid';
import { useContext, useEffect, useMemo } from 'react';
import type { Params } from 'react-router';
import {
    type RecoilState,
    type RecoilValue,
    type Snapshot,
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
    type PyComponentInstance,
    type TaskResponse,
    isVariable,
} from '@/types';

import { VariableCtx, WebSocketCtx, useRequestExtras } from '../context';
import { useTaskContext } from '../context/global-task-context';
import { useEventBus } from '../event-bus/event-bus';
import { type CurrentResult, preloadDerivedValue, resolveDerivedValue } from './derived-variable';
import { findStreamVariablesInArray } from './find-stream-variables';
import { buildTriggerList, getOrRegisterTrigger, registerChildTriggers, resolveTriggerStatic } from './internal';
import { createPollForceKey, isPollForceKey, markRetryAfter, runPoll, usePollKey, waitOrAbort } from './polling';
import { cleanKwargs, resolveVariable } from './resolve-variable';
import {
    type TriggerIndexValue,
    atomRegistry,
    depsRegistry,
    getOrRegisterPollingTrigger,
    selectorFamilyMembersRegistry,
    selectorFamilyRegistry,
} from './store';
import { useStreamSubscription } from './use-stream-subscription';

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
 * Generate the request identity used for polling and cancellation.
 */
export function getServerComponentRequestKey(
    uid: string,
    loopInstanceUid: string | undefined,
    extras: RequestExtras
): string {
    return getComponentRegistryKey(uid, false, loopInstanceUid) + new RequestExtrasSerializable(extras).toJSON();
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
    wsClient: WebSocketClientInterface,
    signal?: AbortSignal
): Promise<TaskResponse | NormalizedPayload<ComponentInstance> | null> {
    const ws_channel = await wsClient.getChannel();
    const res = await request(
        `/api/core/components/${component}`,
        {
            body: JSON.stringify({ uid, values, ws_channel }),
            method: HTTP_METHOD.POST,
        },
        extras,
        { signal }
    );
    await handleAuthErrors(res, { authenticationFailureRedirect: 'login' });
    try {
        await validateResponse(res, `Failed to fetch the component: ${component}`);
    } catch (error) {
        throw markRetryAfter(error, res);
    }
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

const NOT_SET = Symbol('NOT_SET');

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
                        const throwError = (error: unknown): never => {
                            // On DV task error put selectorId and extras into the error so the boundary can reset the selector cache
                            (error as any).selectorId = key;
                            (error as any).selectorExtras = extrasSerializable.toJSON();
                            throw error;
                        };
                        const selectorKey = key + extrasSerializable.toJSON();

                        // Kwargs resolved to their simple values
                        const resolvedKwargs = await Promise.all(
                            Object.entries(dynamicKwargs).map(async ([k, value]) => {
                                const resolvedValue = isVariable(value)
                                    ? await resolveVariable(value, wsClient, taskContext, currentExtras)
                                    : value;
                                return [k, resolvedValue];
                            })
                        ).then((entries) => Object.fromEntries(entries));

                        // Turn kwargs into lists so we can re-use the DerivedVariable logic
                        const resolvedKwargsList = Object.values(resolvedKwargs);
                        const kwargsList = Object.values(dynamicKwargs);

                        const triggerAtom = getOrRegisterComponentTrigger(uid, loop_instance_uid);
                        const selfTrigger = get(triggerAtom);
                        const pollingTrigger = get(getOrRegisterPollingTrigger(selectorKey));

                        // Build trigger map once for efficient lookups
                        const triggerList = buildTriggerList(kwargsList);

                        // Register nested triggers as dependencies so triggering one of the nested derived variables will trigger a recalculation here
                        const childTriggers = registerChildTriggers(triggerList, get);

                        const { extras } = extrasSerializable;

                        let derivedResult = resolveDerivedValue({
                            key: selectorKey,
                            variables: kwargsList,
                            deps: kwargsList,
                            resolvedVariables: resolvedKwargsList,
                            resolutionStrategy: { name: 'get', get },
                            triggerList,
                            selfTriggers: [selfTrigger, pollingTrigger],
                            childTriggers,
                        });

                        // returning previous result as no change in dependant values
                        if (derivedResult.type === 'previous') {
                            return derivedResult.entry.result;
                        }

                        const currentResult =
                            derivedResult.type === 'current' ? (derivedResult as CurrentResult) : undefined;
                        const pollRequest = isPollForceKey(currentResult?.selfTriggerForceKey);
                        const inputKey = currentResult
                            ? JSON.stringify({
                                  forceKey: currentResult.selfTriggerForceKey,
                                  values: currentResult.values,
                              })
                            : undefined;
                        const fetchComponent = async (signal?: AbortSignal): Promise<any> => {
                            let result: any = NOT_SET;
                            let shouldFetchTask = false;

                            if (derivedResult.type === 'cached') {
                                const response = await derivedResult.response.getValue();
                                shouldFetchTask = true;
                                if (!response.ok) {
                                    throwError(new Error(response.value));
                                }

                                result = response.value;
                                derivedResult = derivedResult.currentResult;
                            } else {
                                signal!.addEventListener('abort', () => taskContext.cleanupRunningTasks(key), {
                                    once: true,
                                });

                                // Otherwise fetch new component
                                // turn the resolved values back into an object and clean them up
                                const kwargValues = cleanKwargs(
                                    Object.keys(dynamicKwargs).reduce(
                                        (acc, k, idx) => {
                                            acc[k] = currentResult!.values[idx];
                                            return acc;
                                        },
                                        {} as Record<string, any>
                                    )
                                );

                                result = await fetchFunctionComponent(
                                    name,
                                    normalizeRequest(kwargValues, dynamicKwargs),
                                    uid,
                                    extras,
                                    wsClient,
                                    signal!
                                );
                            }

                            taskContext.cleanupRunningTasks(key);

                            // Metatask returned
                            if (isTaskResponse(result)) {
                                const taskId = result.task_id;
                                result = NOT_SET;

                                // pre-fetch task result since it could already be available without us receiving the notif
                                if (shouldFetchTask) {
                                    const taskResult = await fetchTaskResult<any>(taskId, {
                                        ...extras,
                                        signal,
                                    });
                                    if (taskResult.status === 'ok') {
                                        result = taskResult.result;
                                    }
                                }

                                // no value yet, need to wait for the task
                                if (result === NOT_SET) {
                                    // Register the task under the component's instance key
                                    taskContext.startTask(taskId, key, getComponentRegistryKey(uid, true));

                                    try {
                                        await waitOrAbort(wsClient.waitForTask(taskId), signal);
                                    } finally {
                                        taskContext.endTask(taskId);
                                    }

                                    const response = await fetchTaskResult<NormalizedPayload<ComponentInstance>>(
                                        taskId,
                                        {
                                            ...extras,
                                            signal,
                                        }
                                    );
                                    if (response.status === 'not_found') {
                                        throw new Error('Task result not found');
                                    }
                                    result = response.result;
                                }
                            }

                            if (result !== NOT_SET && result !== null) {
                                // Denormalize
                                result = denormalize(result.data, result.lookup);
                            }

                            return result;
                        };

                        if (!currentResult) {
                            try {
                                const result = await fetchComponent();
                                depsRegistry.set(derivedResult.depsKey, {
                                    args: derivedResult.relevantValues,
                                    result,
                                });
                                return result;
                            } catch (error) {
                                return throwError(error);
                            }
                        }

                        const runResult = currentResult;
                        try {
                            return await runPoll({
                                cause: pollRequest ? 'poll' : 'dependency',
                                inputKey,
                                key: selectorKey,
                                read: () => {
                                    const saved = depsRegistry.get(runResult.depsKey);
                                    return saved ? { found: true, value: saved.result } : { found: false };
                                },
                                signal: extras.signal ?? undefined,
                                work: fetchComponent,
                                write: (result) => {
                                    depsRegistry.set(runResult.depsKey, {
                                        args: runResult.relevantValues,
                                        result,
                                    });
                                },
                            });
                        } catch (error) {
                            return throwError(error);
                        }
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

export function preloadServerComponent(
    component: PyComponentInstance,
    snapshot: Snapshot,
    params: Params<string>
): ReturnType<typeof preloadDerivedValue> {
    const key = getServerComponentRequestKey(component.uid, component.loop_instance_uid, {});

    const kwargsList = Object.values(component.props.dynamic_kwargs);

    const triggerList = buildTriggerList(kwargsList);

    // prepare trigger list as usual but use static resolution
    const selfTriggers = [
        resolveTriggerStatic(getOrRegisterComponentTrigger(component.uid, component.loop_instance_uid), snapshot),
        resolveTriggerStatic(getOrRegisterPollingTrigger(key), snapshot),
    ];
    const childTriggers = triggerList.map((ti) => resolveTriggerStatic(getOrRegisterTrigger(ti.variable), snapshot));

    return preloadDerivedValue({
        key,
        variables: kwargsList,
        deps: kwargsList,
        triggerList,
        selfTriggers,
        childTriggers,
        snapshot,
        params,
    });
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
    const requestKey = getServerComponentRequestKey(uid, loop_instance_uid, extras);
    usePollKey(variablesContext?.pollScope, requestKey);

    const bus = useEventBus();

    // Synchronously register the py_component uid, and clean it up on unmount
    variablesContext?.variables.current.add(getComponentRegistryKey(uid));
    useEffect(() => {
        return () => {
            variablesContext?.variables.current.delete(getComponentRegistryKey(uid));
        };
    }, []);

    // Find all StreamVariables in dynamicKwargs and subscribe to them
    // This runs in useEffect - tracks active users so we know when to cleanup
    // Keyed by uid+extras so different auth contexts are independent
    const streamUids = useMemo(
        () => findStreamVariablesInArray(Object.values(dynamicKwargs)).map((s) => s.uid),
        [dynamicKwargs]
    );
    useStreamSubscription(streamUids, extras);

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

/**
 * Refresh one server-component/request-extras identity for polling.
 */
export function usePollServerComponent(
    uid: string,
    loopInstanceUid: string | undefined,
    extras: RequestExtras
): () => void {
    const requestKey = getServerComponentRequestKey(uid, loopInstanceUid, extras);
    return useRecoilCallback(
        ({ set }) =>
            () => {
                set(getOrRegisterPollingTrigger(requestKey), (triggerIndexValue) => ({
                    force_key: createPollForceKey(),
                    inc: triggerIndexValue.inc + 1,
                }));
            },
        [requestKey]
    );
}
