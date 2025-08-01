/* eslint-disable react-hooks/exhaustive-deps */
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
import { nanoid } from 'nanoid';
import { useCallback, useMemo } from 'react';
import {
    type GetRecoilValue,
    type RecoilValue,
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
    type DerivedDataVariable,
    type DerivedVariable,
    type GlobalTaskContext,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    isCondition,
    isDerivedDataVariable,
    isDerivedVariable,
    isResolvedDataVariable,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
    isResolvedServerVariable,
    isResolvedSwitchVariable,
    isVariable,
} from '@/types';

// eslint-disable-next-line import/no-cycle
import { cleanArgs, getOrRegisterTrigger, resolveNested, resolveVariable } from './internal';
import {
    type TriggerIndexValue,
    depsRegistry,
    getRegistryKey,
    selectorFamilyMembersRegistry,
    selectorFamilyRegistry,
} from './store';
import { buildTriggerList, registerChildTriggers } from './triggers';

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
    is_data_variable?: boolean;
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
    is_data_variable = false,
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
            body: JSON.stringify({ is_data_variable, values, ws_channel, force_key: force_key ?? null }),
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
    is_data_variable = false,
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
        is_data_variable,
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
    value:
        | ResolvedDerivedVariable
        | ResolvedDerivedDataVariable
        | ResolvedDataVariable
        | ResolvedServerVariable
        | ResolvedSwitchVariable
        | RecoilValue<any>,
    getter: GetRecoilValue
): any {
    if (isResolvedDerivedVariable(value) || isResolvedDerivedDataVariable(value)) {
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

    if (isResolvedDataVariable(value)) {
        return value;
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

        if (isResolvedDerivedVariable(val) || isResolvedDerivedDataVariable(val)) {
            return getDeps(val.values, val.deps).flat();
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
        cacheKey: string | null;
        result: any;
    };
    type: 'previous';
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
     * List of values to use in the refetch request (force_key is now embedded directly in the values)
     */
    values: any[];
}

/**
 * Represents the result of a derived variable resolution.
 */
type DerivedResult = PreviousResult | CurrentResult;

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
 * @param wsClient websocket client
 * @param get getter function to resolve atoms to values
 * @param selfTrigger additional trigger index value to register as a dependency
 */
export function resolveDerivedValue(
    key: string,
    variables: any[], // variable or primitive
    deps: any[], // variable or primitive
    resolvedVariables: any[],
    wsClient: WebSocketClientInterface,
    get: GetRecoilValue,
    selfTrigger?: TriggerIndexValue
): DerivedResult {
    // Build trigger map once for efficient lookups
    const triggerList = buildTriggerList(variables);

    // Register nested triggers as dependencies so triggering one of the nested derived variables will trigger a recalculation here
    const triggers = registerChildTriggers(triggerList, wsClient, get);

    if (selfTrigger) {
        triggers.unshift(selfTrigger);
    }

    /**
     * Array of values:
     * - primitive values are resolved to themselves
     * - simple variables are resolved to their values
     * - derived variables are resolved to ResolvedDerivedVariable objects with nested values/deps resolved to values
     * - ResolvedDataVariable objects are left as is
     */
    const values = resolvedVariables.map((v) => resolveValue(v, get));

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
            return {
                entry: previousEntry,
                type: 'previous',
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
                if (selfTrigger && idx === 0) {
                    // This is a self-trigger (polling, manual trigger) - use global force
                    selfTriggerForceKey = triggerValue.force_key;
                } else if (triggerValue.force_key) {
                    // This is a nested variable trigger - embed force_key in the specific variable
                    // shift index back by 1 if we prepended a self trigger
                    const valueIndex = selfTrigger ? idx - 1 : idx;
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
        };
    }

    return {
        relevantValues,
        selfTriggerForceKey: null,
        type: 'current',
        values,
    };
}

/**
 * Get a derived variable from the selector registry, registering it if not already registered
 *
 * @param variable variable to register
 * @param wsClient WebSocket client from context
 * @param tasks tasks list from context
 * @param currentExtras request extras to be merged into the options
 */
export function getOrRegisterDerivedVariable(
    variable: DerivedVariable | DerivedDataVariable,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    currentExtras: RequestExtras
): RecoilValue<DerivedVariableValueResponse<any>> {
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
                        /**
                         * Recursively resolve variables to list of values
                         *
                         * For derived variables, put ResolvedDerivedVariable object with values resolved to recoil atoms/selectors,
                         * and deps resolved to array of indexes of variables (or null if not set)
                         * For data variables, put ResolvedDataVariable object.
                         */
                        const resolvedVariables = variable.variables.map((v) => {
                            // Handle non-variables - plain values could be injected via LoopVariable
                            if (!isVariable(v)) {
                                return v;
                            }

                            return resolveVariable(v, wsClient, taskContext, currentExtras);
                        });

                        const selfTrigger = get(getOrRegisterTrigger(variable));
                        const { extras } = extrasSerializable;

                        // for deps use a different key for each selector instance rather than one per family
                        const selectorKey = key + extrasSerializable.toJSON();
                        const derivedResult = resolveDerivedValue(
                            selectorKey,
                            variable.variables,
                            variable.deps,
                            resolvedVariables,
                            wsClient,
                            get,
                            selfTrigger
                        );

                        if (derivedResult.type === 'previous') {
                            return { cache_key: derivedResult.entry.cacheKey, value: derivedResult.entry.result };
                        }

                        let variableResponse = null;

                        try {
                            variableResponse = await debouncedFetchDerivedVariable({
                                cache: variable.cache,
                                extras,
                                force_key: derivedResult.selfTriggerForceKey,
                                is_data_variable: isDerivedDataVariable(variable),
                                selectorKey,
                                values: normalizeRequest(cleanArgs(derivedResult.values), variable.variables),
                                variableUid: variable.uid,
                                wsClient,
                            });
                        } catch (e: unknown) {
                            // On DV error put selectorId and extras into the error so the boundary can reset the selector cache
                            (e as any).selectorId = key;
                            (e as any).selectorExtras = extrasSerializable.toJSON();
                            throw e;
                        }

                        const cacheKey = variableResponse.cache_key;
                        let variableValue = null;

                        // We're only interested in the actual value for DVs.
                        // For DerivedDataVariables we only need the cache key and the backend will handle the rest, regardless
                        // of whether it's running as a task or not
                        if (isDerivedVariable(variable)) {
                            // If there is a task running related to the current variable then something has changed, so cancel them
                            taskContext.cleanupRunningTasks(variable.uid);

                            // If the variable is computed as a task then wait for it to finish and fetch the result
                            if (isTaskResponse(variableResponse)) {
                                const taskId = variableResponse.task_id;

                                // register task being started
                                taskContext.startTask(taskId, variable.uid, getRegistryKey(variable, 'trigger'));

                                try {
                                    await wsClient.waitForTask(taskId);
                                } catch (e: unknown) {
                                    if (e instanceof TaskError) {
                                        // On DV task error put selectorId and extras into the error so the boundary can reset the selector cache
                                        (e as any).selectorId = key;
                                        (e as any).selectorExtras = extrasSerializable.toJSON();
                                        throw e;
                                    }

                                    // should be a TaskCancelledError
                                    // It should be safe to return `null` here as the selector will re-run and throw suspense again
                                    return {
                                        cache_key: cacheKey,
                                        value: null,
                                    };
                                } finally {
                                    taskContext.endTask(taskId);
                                }

                                try {
                                    variableValue = await fetchTaskResult<any>(taskId, extras);
                                } catch (e) {
                                    // On DV task error put selectorId and extras into the error so the boundary can reset the selector cache
                                    (e as any).selectorId = key;
                                    (e as any).selectorExtras = extrasSerializable.toJSON();
                                    throw e;
                                }
                            } else {
                                variableValue = variableResponse.value;
                            }
                        }

                        // Store the final result and arguments used if deps is specified

                        // resolve nested if defined (i.e. for DerivedVariable, DerivedDataVariable does not have nested)
                        variableValue =
                            'nested' in variable ? resolveNested(variableValue, variable.nested) : variableValue;

                        depsRegistry.set(selectorKey, {
                            args: derivedResult.relevantValues,
                            cacheKey,
                            result: variableValue,
                        });

                        return {
                            cache_key: cacheKey,
                            value: variableValue,
                        };
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
 * Get a derived selector for a derived variable.
 * Retrieves the value of the derived variable directly instead of returning an object with cache_key and value.
 *
 * @param variable variable to register
 * @param wsClient WebSocket client from context
 * @param taskContext global task context
 * @param search search query from location
 * @param extras request extras to be merged into the options
 */
export function getOrRegisterDerivedVariableValue(
    variable: DerivedVariable,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    currentExtras: RequestExtras
): RecoilValue<any> {
    const key = getRegistryKey(variable, 'derived-selector');

    if (!selectorFamilyRegistry.has(key)) {
        selectorFamilyRegistry.set(
            key,
            selectorFamily({
                get:
                    (extrasSerializable: RequestExtrasSerializable) =>
                    ({ get }) => {
                        // get the right selector instance for this extras value
                        const dvSelector = getOrRegisterDerivedVariable(
                            variable,
                            wsClient,
                            taskContext,
                            extrasSerializable.extras
                        );
                        const dvResponse = get(dvSelector);
                        return dvResponse.value;
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
 * Helper hook to get the (data) derived variable selector, while correctly registering triggers and setting up polling interval.
 *
 * @param variable derived variable to use
 * @param WsClient websocket client instance
 * @param taskContext global task context
 * @param search search query
 * @param extras request extras to be merged into the options
 */
export function useDerivedVariable(
    variable: DerivedVariable | DerivedDataVariable,
    WsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilValue<DerivedVariableValueResponse<any>> {
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
