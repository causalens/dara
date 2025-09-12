/* eslint-disable react-hooks/exhaustive-deps */
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
import { nanoid } from 'nanoid';
import { useCallback, useMemo } from 'react';
import {
    type GetRecoilValue,
    type RecoilValue,
    type Snapshot,
    isRecoilValue,
    selectorFamily,
    useRecoilValue,
    useSetRecoilState,
} from 'recoil';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { debounceTime, filter, share, switchMap, take } from 'rxjs/operators';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { type WebSocketClientInterface, fetchTaskResult, request } from '@/api';
import { type RequestExtras, RequestExtrasSerializable } from '@/api/http';
import { TaskError } from '@/api/websocket';
import { handleAuthErrors } from '@/auth/auth';
import { getUniqueIdentifier } from '@/shared/utils/hashing';
import { normalizeRequest } from '@/shared/utils/normalization';
import useInterval from '@/shared/utils/use-interval';
import {
    type DerivedVariable,
    type GlobalTaskContext,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    isCondition,
    isResolvedDerivedVariable,
    isResolvedServerVariable,
    isResolvedSwitchVariable,
    isVariable,
} from '@/types';

import { type Deferred, deferred, isDeferred } from '../utils/deferred';
// eslint-disable-next-line import/no-cycle
import { cleanArgs, getOrRegisterTrigger, resolveNested, resolveVariable, resolveVariableStatic } from './internal';
import {
    type TriggerIndexValue,
    depsRegistry,
    getRegistryKey,
    selectorFamilyMembersRegistry,
    selectorFamilyRegistry,
} from './store';
import { type TriggerInfo, buildTriggerList, registerChildTriggers, resolveTriggerStatic } from './triggers';

export interface DerivedVariableValueResponse<T> {
    cache_key: string;
    value: T;
}

type DerivedVariableResponse<T> = DerivedVariableTaskResponse | DerivedVariableValueResponse<T>;

export function isTaskResponse(dvResponse: DerivedVariableResponse<any>): dvResponse is DerivedVariableTaskResponse {
    return 'task_id' in dvResponse;
}

interface DerivedVariableTaskResponse {
    cache_key: string;
    task_id: string;
}

interface FetchDerivedVariableArgs {
    cache: DerivedVariable['cache'];
    extras: RequestExtras;
    force_key?: string | null;
    /**
     * selector instance key  - each selector's requests should be treated separately
     */
    selectorKey: string;
    values: Record<string | number, any>;
    /**
     * Variable uid
     */
    variableUid: string;
    wsClient: WebSocketClientInterface;
}

/**
 * Fetch the value of a derived variable from the backend
 *
 * @param input Function inputs
 * - `cache`, the cache option for the derived variable.
 * - `extras`, request extras to be merged into the options
 * - `uid`, the uid of the derived variable
 * - `values`, values to pass in the request
 * - `wsClient`, websocket client
 */
export async function fetchDerivedVariable<T>({
    cache,
    extras,
    force_key,
    variableUid,
    values,
    wsClient,
}: FetchDerivedVariableArgs): Promise<DerivedVariableResponse<T>> {
    const cacheControl =
        cache === null ?
            ({
                'cache-control': 'none',
            } as const)
        :   undefined;

    const ws_channel = await wsClient.getChannel();

    const res = await request(
        `/api/core/derived-variable/${variableUid}`,
        {
            body: JSON.stringify({ values, ws_channel, force_key: force_key ?? null }),
            headers: { ...cacheControl },
            method: HTTP_METHOD.POST,
        },
        extras
    );
    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to fetch the derived variable with uid: ${variableUid}`);
    return res.json();
}

/**
 * Add a debounced version of the fetch so as to not overload the backend on startup. This needs to be cached per uid
 * so that we only debounce calls to the same DerivedVariable. Debouncing is done with rxjs as everything here is
 * promise based and async
 */
const debouncedFetchSubjects: {
    [k: string]: BehaviorSubject<FetchDerivedVariableArgs | null>;
} = {};
const debouncedFetchCache: {
    [k: string]: Observable<any>;
} = {};

async function debouncedFetchDerivedVariable({
    variableUid,
    selectorKey,
    values,
    wsClient,
    extras,
    cache,
    force_key,
}: FetchDerivedVariableArgs): Promise<DerivedVariableResponse<any>> {
    // If this is the first time this is called then set up a subject and return stream for this selector
    if (!debouncedFetchSubjects[selectorKey]) {
        debouncedFetchSubjects[selectorKey] = new BehaviorSubject<FetchDerivedVariableArgs | null>(null);
        debouncedFetchCache[selectorKey] = debouncedFetchSubjects[selectorKey].pipe(
            filter((args) => !!args),
            debounceTime(10),
            switchMap((args) => from(fetchDerivedVariable(args))),
            share()
        );
    }

    // Push the next set of args to the subject
    debouncedFetchSubjects[selectorKey].next({
        cache,
        extras,
        force_key,
        selectorKey,
        values,
        variableUid,
        wsClient,
    });

    // Return the debounced response from the backend
    return new Promise((resolve, reject) => {
        debouncedFetchCache[selectorKey]!.pipe(take(1)).subscribe(resolve, reject);
    });
}

/**
 * Resolve a value to a format understood by the backend, resolving atoms to values.
 *
 * @param value value to resolve
 * @param getter recoil getter function
 */
function resolveValue(
    value: ResolvedDerivedVariable | ResolvedServerVariable | ResolvedSwitchVariable | RecoilValue<any>,
    getter: GetRecoilValue
): any {
    if (isResolvedDerivedVariable(value)) {
        const resolvedValues = value.values.map((v) => resolveValue(v, getter));

        return {
            ...value,
            values: resolvedValues,
        };
    }
    if (isResolvedSwitchVariable(value)) {
        return {
            ...value,
            value: resolveValue(value.value, getter),
            value_map: resolveValue(value.value_map, getter),
            default: resolveValue(value.default, getter),
        };
    }

    if (isResolvedServerVariable(value)) {
        return {
            ...value,
            sequence_number:
                isRecoilValue(value.sequence_number) ? getter(value.sequence_number) : value.sequence_number,
        };
    }

    if (isCondition(value)) {
        return {
            ...value,
            // at this point condition would've already resolved a variable to a recoil value
            variable: resolveValue(value.variable as any as RecoilValue<any>, getter),
        };
    }

    if (isRecoilValue(value)) {
        return getter(value);
    }

    return value;
}

/**
 * Recursively build a deps array from a list of values
 * Values not in deps array are replaced with empty array
 *
 * @param values array of primitives and ResolvedDerivedVariable objects
 * @param deps array of indexes of dependencies to get values from
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function getDeps(values: Array<ResolvedDerivedVariable | any>, deps?: number[]): any[] {
    return values.map((val, idx) => {
        if (deps && !deps.includes(idx)) {
            return [];
        }

        if (isResolvedDerivedVariable(val)) {
            return getDeps(val.values, val.deps).flat();
        }

        if (isResolvedServerVariable(val)) {
            return val.sequence_number;
        }

        if (isResolvedSwitchVariable(val)) {
            // For switch variables, return the constituent parts as dependencies
            return getDeps([val.value, val.value_map, val.default], [0, 1, 2]).flat();
        }

        return val;
    });
}

/**
 * A helper hook that turns a DerivedVariable into its trigger index value.
 * Useful to subscribe a component to forced trigger updates.
 *
 * @param variable variable to use
 */
export function useTriggerIndex(variable: DerivedVariable): TriggerIndexValue {
    return useRecoilValue(getOrRegisterTrigger(variable));
}

/**
 * DerivedVariable resolution result meaning that the value did not change since last time
 * and should be returned from the previous entry.
 */
interface PreviousResult {
    /**
     * Previous entry in the depsRegistry found to not have been changed
     */
    entry: {
        args: any[];
        result: any;
    };
    type: 'previous';
    relevantValues: any[];
    /**
     * List of values to use in the refetch request (force_key is embedded directly in the values)
     */
    values: any[];
    /** Key to the deps cache */
    depsKey: string;
}

/**
 * DerivedVariable resolution result meaning that the value changed since last time
 * and should be refetched.
 */
interface CurrentResult {
    /**
     * List of new 'relevant' values which should be used to update the depsRegistry entry if refetch was successful
     */
    relevantValues: any[];
    /**
     * Force key for self-trigger (polling, manual trigger), null if triggered by nested variable
     */
    selfTriggerForceKey: string | null;
    type: 'current';
    /**
     * List of values to use in the refetch request (force_key is embedded directly in the values)
     */
    values: any[];
    /** Key to the deps cache */
    depsKey: string;
}

/**
 * Represents a cached result of a derived variable resolution.
 * This can happen when we prefetch a derived value, wraps the current result and the raw server response.
 */
interface CachedResponse {
    type: 'cached';
    response: Deferred<{ ok: boolean; value: any }>;
    values: any[];
    depsKey: string;
    currentResult: CurrentResult;
    relevantValues: any[];
}

/**
 * Represents the result of a derived variable resolution.
 */
export type DerivedResult = PreviousResult | CurrentResult | CachedResponse;

/**
 * Resolve a derived value from a list of dependant variables and their resolved values.
 *
 * Handles a dependency array, where in case 'relevant' (i.e. present in deps) values did not change,
 * an earlier result from the `depsRegistry` is returned.
 *
 * This is the core of the derived variable resolution logic, extracted so that it can be used in both
 * DerivedVariable and py_component logic.
 *
 * @param key unique key to look up `depsRegistry` entry from
 * @param variables dependant variables
 * @param deps list of relevant dependant variables, akin to useEffect dependency array
 * @param resolvedVariables resolved values of dependant variables - turned into primitives and Resolved forms
 * @param get getter function to resolve atoms to values
 * @param triggerList list of trigger info objects
 * @param triggers list of triggers to register as dependencies; first one is expected to be the self-trigger
 */
export function resolveDerivedValue({
    key,
    variables,
    deps,
    resolvedVariables,
    resolutionStrategy,
    triggerList,
    triggers,
}: {
    key: string;
    variables: any[];
    deps: any[];
    resolvedVariables: any[];
    resolutionStrategy: { name: 'get'; get: GetRecoilValue } | { name: 'snapshot'; snapshot: Snapshot };
    triggerList: Array<TriggerInfo>;
    triggers: TriggerIndexValue[];
}): DerivedResult {
    /**
     * Array of values:
     * - primitive values are resolved to themselves
     * - simple variables are resolved to their values
     * - derived variables are resolved to ResolvedDerivedVariable objects with nested values/deps resolved to values
     * - server variables are resolved to their sequence number
     */
    const values = resolvedVariables.map((v) => {
        if (resolutionStrategy.name === 'snapshot') {
            return resolveVariableStatic(v, resolutionStrategy.snapshot);
        }

        return resolveValue(v, resolutionStrategy.get);
    });

    /**
     * Array of values with ResolvedDerivedVariable objects replaced
     * (recursively) by nested arrays of their dependency values
     *
     * Dependencies which aren't included in `deps` are replaced with empty arrays
     */
    const depsValues = getDeps(values);

    /**
     * A map of variable UID-nested -> its primitive value (or array of dependencies).
     * Only includes variables present in deps
     *
     * `nested` is used to generate a key so that the same variable with different nested property will be
     * present in the map separately.
     */
    const variableValueMap = variables.reduce((acc, v, idx) => {
        // skip non-variables
        if (!isVariable(v)) {
            return acc;
        }
        return acc.set(getUniqueIdentifier(v), depsValues[idx]);
    }, new Map<string, any>());

    /**
     * Deps handling
     */
    const previousEntry = depsRegistry.get(key);

    // Get relevant values based on deps
    const relevantValues = deps
        .filter(isVariable)
        .map((dep) => variableValueMap.get(getUniqueIdentifier(dep)))
        .concat(triggers.map((trigger) => trigger.inc)); // Append triggerValues to make triggers force a recalc even when deps didn't change

    // If there's no entry it's the first run so skip; otherwise:
    if (previousEntry) {
        const areArgsTheSame = isEqual(previousEntry.args, relevantValues);

        // If the relevant arg values didn't change, return previous result
        if (areArgsTheSame) {
            const previousValue = previousEntry.result;
            if (isDeferred(previousValue)) {
                return {
                    type: 'cached',
                    response: previousValue,
                    depsKey: key,
                    values,
                    relevantValues,
                    currentResult: {
                        relevantValues,
                        selfTriggerForceKey: null,
                        type: 'current',
                        values,
                        depsKey: key,
                    },
                };
            }

            return {
                entry: previousEntry,
                type: 'previous',
                values,
                relevantValues,
                depsKey: key,
            };
        }

        // Otherwise continue and fetch new value, but first check what caused the change

        // Assumption: Triggers are always stored after the values, with the triggers of the current variable being first
        const previousTriggerCounters = previousEntry.args.slice(
            previousEntry.args.length - triggers.length
        ) as number[];

        // Find which trigger changed and handle force_key appropriately
        let selfTriggerForceKey: string | null = null;

        for (const [idx, triggerValue] of triggers.entries()) {
            /**
             *  If any of the nested trigger value has changed (this execution was caused by a trigger)
             *  handle the force_key appropriately
             */
            if (triggerValue.inc !== previousTriggerCounters[idx]) {
                if (idx === 0) {
                    // This is a self-trigger (polling, manual trigger) - use global force
                    selfTriggerForceKey = triggerValue.force_key;
                } else if (triggerValue.force_key) {
                    // This is a nested variable trigger - embed force_key in the specific variable
                    // shift index back by 1 because we prepended a self trigger
                    const valueIndex = idx - 1;
                    const triggerInfo = triggerList[valueIndex]!;

                    // If the trigger path is empty, it means we need to force the DV itself
                    // This can happen when e.g. a dependant DataVariable is triggered
                    if (triggerInfo.path.length === 0) {
                        selfTriggerForceKey = triggerValue.force_key;
                    } else {
                        set(values, [...triggerInfo.path, 'force_key'], triggerValue.force_key);
                    }
                }
                break;
            }
        }

        return {
            relevantValues,
            selfTriggerForceKey,
            type: 'current',
            values,
            depsKey: key,
        };
    }

    return {
        relevantValues,
        selfTriggerForceKey: null,
        type: 'current',
        values,
        depsKey: key,
    };
}

/**
 * Get or register a recoil selector for a given derived variable result object.
 * Resolves the primitive values and returns either the previous cached result or an object
 * signifying that we need to refetch the value.
 */
export function getOrRegisterDerivedVariableResult(
    variable: DerivedVariable,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    currentExtras: RequestExtras
): RecoilValue<DerivedResult> {
    const key = getRegistryKey(variable, 'result-selector');

    if (!selectorFamilyRegistry.has(key)) {
        getOrRegisterTrigger(variable);

        // register a family for this particular variable
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                cachePolicy_UNSTABLE: {
                    eviction: 'most-recent',
                },
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    async ({ get }) => {
                        /**
                         * Recursively resolve variables to list of values
                         *
                         * For derived variables, put ResolvedDerivedVariable object with values resolved to recoil atoms/selectors,
                         * and deps resolved to array of indexes of variables (or null if not set)
                         */
                        const resolvedVariables = await Promise.all(
                            variable.variables.map(async (v) => {
                                // Handle non-variables - plain values could be injected via LoopVariable
                                if (!isVariable(v)) {
                                    return Promise.resolve(v);
                                }

                                return resolveVariable(v, wsClient, taskContext, currentExtras);
                            })
                        );

                        const selfTrigger = get(getOrRegisterTrigger(variable));

                        // for deps use a different key for each selector instance rather than one per family
                        const selectorKey = key + extrasSerializable.toJSON();

                        // Build trigger map once for efficient lookups
                        const triggerList = buildTriggerList(variable.variables);

                        // Register nested triggers as dependencies so triggering one of the nested derived variables will trigger a recalculation here
                        const triggers = registerChildTriggers(triggerList, get);
                        triggers.unshift(selfTrigger);

                        const derivedResult = resolveDerivedValue({
                            key: selectorKey,
                            variables: variable.variables,
                            deps: variable.deps,
                            resolvedVariables,
                            resolutionStrategy: { name: 'get', get },
                            triggerList,
                            triggers,
                        });
                        return derivedResult;
                    },
                key: nanoid(),
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

const NOT_SET = Symbol('NOT_SET');

/**
 * Get a derived variable from the selector registry, registering it if not already registered
 *
 * @param variable variable to register
 * @param wsClient WebSocket client from context
 * @param tasks tasks list from context
 * @param currentExtras request extras to be merged into the options
 */
export function getOrRegisterDerivedVariable(
    variable: DerivedVariable,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    currentExtras: RequestExtras
): RecoilValue<any> {
    const key = getRegistryKey(variable, 'selector');

    if (!selectorFamilyRegistry.has(key)) {
        getOrRegisterTrigger(variable);

        // register a family for this particular variable
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                cachePolicy_UNSTABLE: {
                    eviction: 'most-recent',
                },
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    async ({ get }) => {
                        const selectorKey = key + extrasSerializable.toJSON();

                        const throwError = (error: unknown): never => {
                            // On DV task error put selectorId and extras into the error so the boundary can reset the selector cache
                            (error as any).selectorId = key;
                            (error as any).selectorExtras = extrasSerializable.toJSON();
                            throw error;
                        };
                        const handleError = <R,>(func: () => R): R | undefined => {
                            try {
                                return func();
                            } catch (e) {
                                throwError(e);
                            }
                        };

                        // get the result selector instance for this extras value
                        const dvResultSelector = getOrRegisterDerivedVariableResult(
                            variable,
                            wsClient,
                            taskContext,
                            extrasSerializable.extras
                        );
                        let derivedResult = get(dvResultSelector);

                        if (derivedResult.type === 'previous') {
                            return derivedResult.entry.result;
                        }

                        const { extras } = extrasSerializable;
                        let variableResponse = null;
                        // whether to check for an initial task
                        let shouldFetchTask = false;

                        // Skip fetching if we have a cached result, await it instead
                        if (derivedResult.type === 'cached') {
                            try {
                                const response = await derivedResult.response.getValue();
                                shouldFetchTask = true;
                                if (!response.ok) {
                                    throwError(new Error(response.value));
                                }
                                variableResponse = response.value;
                                derivedResult = derivedResult.currentResult;
                            } catch (e) {
                                throwError(e);
                            }
                        } else {
                            variableResponse = await handleError(() =>
                                debouncedFetchDerivedVariable({
                                    cache: variable.cache,
                                    extras,
                                    force_key: (derivedResult as CurrentResult).selfTriggerForceKey,
                                    selectorKey,
                                    values: normalizeRequest(
                                        cleanArgs((derivedResult as CurrentResult).values),
                                        variable.variables
                                    ),
                                    variableUid: variable.uid,
                                    wsClient,
                                })
                            );
                        }

                        let variableValue: any = NOT_SET;

                        // If there is a task running related to the current variable then something has changed, so cancel them
                        taskContext.cleanupRunningTasks(variable.uid);

                        // If the variable is computed as a task then wait for it to finish and fetch the result
                        if (isTaskResponse(variableResponse)) {
                            const taskId = variableResponse.task_id;

                            // pre-fetch task result since it could already be available without us receiving the notif
                            if (shouldFetchTask) {
                                try {
                                    const taskResult = await fetchTaskResult<any>(taskId, extras);
                                    if (taskResult.status === 'ok') {
                                        variableValue = taskResult.result;
                                    }
                                } catch (e) {
                                    throwError(e);
                                }
                            }

                            // continue waiting for the task if it's not available yet
                            if (variableValue === NOT_SET) {
                                // register task being started
                                taskContext.startTask(taskId, variable.uid, getRegistryKey(variable, 'trigger'));

                                try {
                                    await wsClient.waitForTask(taskId);
                                } catch (e: unknown) {
                                    if (e instanceof TaskError) {
                                        throwError(e);
                                    }

                                    // should be a TaskCancelledError
                                    // It should be safe to return `null` here as the selector will re-run and throw suspense again
                                    return null;
                                } finally {
                                    taskContext.endTask(taskId);
                                }

                                variableValue = await handleError(async () => {
                                    const result = await fetchTaskResult<any>(taskId, extras);
                                    if (result.status === 'not_found') {
                                        throw new Error('Task result not found');
                                    }
                                    return result.result;
                                });
                            }
                        } else {
                            variableValue = variableResponse.value;
                        }

                        // resolve nested if defined
                        variableValue =
                            'nested' in variable ? resolveNested(variableValue, variable.nested) : variableValue;

                        // Store the final result and arguments used
                        depsRegistry.set(derivedResult.depsKey, {
                            args: derivedResult.relevantValues,
                            result: variableValue,
                        });

                        return variableValue;
                    },
                key: nanoid(),
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
 * Preload a derived value.
 * Replicates the logic of normal resolution but resolving the values
 * from snapshot or falling back to the defaults.
 *
 * For details, see the original implementation comments.
 *
 * Returns null if there already is a cached value for the variable.
 * Otherwise, returns an object with values so be sent to the backend
 * and handles to resolve the cached promise to the result.
 */
export function preloadDerivedValue({
    key,
    variables,
    deps,
    triggerList,
    triggers,
    snapshot,
}: {
    key: string;
    variables: any[];
    deps: any[];
    triggerList: Array<TriggerInfo>;
    triggers: TriggerIndexValue[];
    snapshot: Snapshot;
}): {
    handle: Deferred<any>;
    result: DerivedResult;
} | null {
    const derivedResult = resolveDerivedValue({
        key,
        variables,
        deps,
        resolvedVariables: variables,
        resolutionStrategy: { name: 'snapshot', snapshot },
        triggerList,
        triggers,
    });

    // otherwise we already have a valid entry, nothing to do here
    if (derivedResult.type === 'previous') {
        return null;
    }

    // no previous entry or values changed - have to recompute
    return { result: derivedResult, handle: deferred() };
}
/**
 * Preload a derived variable value.
 */
export function preloadDerivedVariable(
    variable: DerivedVariable,
    snapshot: Snapshot
): ReturnType<typeof preloadDerivedValue> {
    // assume no extras in top-level variables
    const key = getRegistryKey(variable, 'result-selector') + new RequestExtrasSerializable({}).toJSON();

    // prepare trigger list as usual but use static resolution
    const triggerList = [...buildTriggerList(variable.variables), { path: [], variable }];
    const triggers = triggerList.map((ti) => resolveTriggerStatic(getOrRegisterTrigger(ti.variable), snapshot));

    return preloadDerivedValue({
        key,
        variables: variable.variables,
        deps: variable.deps,
        triggers,
        triggerList,
        snapshot,
    });
}

/**
 * Helper hook to get the (data) derived variable selector, while correctly registering triggers and setting up polling interval.
 *
 * @param variable derived variable to use
 * @param WsClient websocket client instance
 * @param taskContext global task context
 * @param search search query
 * @param extras request extras to be merged into the options
 */
export function useDerivedVariable(
    variable: DerivedVariable,
    WsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilValue<any> {
    const dvSelector = getOrRegisterDerivedVariable(variable, WsClient, taskContext, extras);

    /**
     * Workaround for forcing a re-calculation for derived variables by creating a triggerIndex atom and making it a dependency of
     * the recoil selector. This way the selector can be re-run and derived variable can be re-fetched from the
     * backend by just updating this atom.
     */
    const triggerIndex = useMemo(() => getOrRegisterTrigger(variable), []);

    // Creating a setter function for triggerIndex
    const triggerUpdates = useSetRecoilState(triggerIndex);
    const trigger = useCallback(
        (force = true) =>
            triggerUpdates((val) => ({
                force_key: force ? nanoid() : null,
                inc: val.inc + 1,
            })),
        [triggerUpdates]
    );

    // Using useInterval to poll, forcing recalculation everytime
    useInterval(trigger, variable.polling_interval);

    return dvSelector;
}
