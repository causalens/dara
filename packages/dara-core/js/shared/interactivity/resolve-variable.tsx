import { type RecoilState } from 'recoil';

import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras } from '@/api/http';
import {
    type AnyVariable,
    type GlobalTaskContext,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    isCondition,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
    isResolvedSwitchVariable,
    isServerVariable,
    isStateVariable,
    isSwitchVariable,
    isVariable,
} from '@/types';

// eslint-disable-next-line import/no-cycle
import {
    getOrRegisterDerivedVariable,
    getOrRegisterPlainVariable,
    resolveDataVariable,
    resolveServerVariable,
} from './internal';

/**
 * Resolve a variable to a value (for non-derived variables using provided resolver)
 * or a ResolvedDerivedVariable (if it's a derived variable).
 * Registers all encountered variables which aren't yet in registry.
 *
 * @param variable variable to resolve
 * @param client websocket client from context
 * @param taskContext global task context
 * @param extras request extras to be merged into the options
 * @param resolver function to run the value through (for non-derived variables)
 */
export function resolveVariable<VariableType>(
    variable: AnyVariable<VariableType>,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras,
    resolver: (val: RecoilState<VariableType>) => RecoilState<VariableType> | ResolvedDerivedVariable | VariableType = (
        val: RecoilState<VariableType>
    ) => val
):
    | RecoilState<VariableType>
    | ResolvedDerivedVariable
    | ResolvedDerivedDataVariable
    | ResolvedDataVariable
    | ResolvedServerVariable
    | ResolvedSwitchVariable
    | VariableType {
    if (isDerivedVariable(variable) || isDerivedDataVariable(variable)) {
        getOrRegisterDerivedVariable(variable, client, taskContext, extras);

        // For derived variable, recursively resolve the dependencies
        const values = variable.variables.map((v) => resolveVariable(v, client, taskContext, extras, resolver));

        // Store indexes of values which are in deps
        const deps = variable.deps.map((dep) => variable.variables.findIndex((v) => v.uid === dep.uid));

        if (isDerivedDataVariable(variable)) {
            return {
                deps,
                filters: variable.filters,
                type: 'derived-data',
                uid: variable.uid,
                values,
            } satisfies ResolvedDerivedDataVariable;
        }

        return {
            deps,
            type: 'derived',
            uid: variable.uid,
            values,
        } satisfies ResolvedDerivedVariable;
    }

    if (isDataVariable(variable)) {
        return resolveDataVariable(variable);
    }

    if (isServerVariable(variable)) {
        return resolveServerVariable(variable, extras, resolver);
    }

    if (isSwitchVariable(variable)) {
        // For switch variables, we need to resolve the constituent parts
        // and return a serialized representation similar to derived variables
        let resolvedValue =
            isVariable(variable.value) ?
                resolveVariable(variable.value, client, taskContext, extras, resolver)
            :   variable.value;

        // value could be a condition object, resolve its variable
        if (isCondition(resolvedValue)) {
            resolvedValue = {
                ...resolvedValue,
                variable: resolveVariable(resolvedValue.variable, client, taskContext, extras, resolver) as any,
            };
        }

        const resolvedValueMap =
            isVariable(variable.value_map) ?
                resolveVariable(variable.value_map as any, client, taskContext, extras, resolver)
            :   variable.value_map;
        const resolvedDefault =
            isVariable(variable.default) ?
                resolveVariable(variable.default, client, taskContext, extras, resolver)
            :   variable.default;

        return {
            type: 'switch',
            uid: variable.uid,
            value: resolvedValue,
            value_map: resolvedValueMap,
            default: resolvedDefault,
        } satisfies ResolvedSwitchVariable;
    }

    if (isStateVariable(variable)) {
        // StateVariables should not be resolved as they are internal client-side variables
        // They should be handled by useVariable hook directly
        throw new Error('StateVariable should not be resolved - it should be handled by useVariable hook');
    }

    return resolver(getOrRegisterPlainVariable(variable, client, taskContext, extras));
}

/**
 * Clean value to a format understood by the backend.
 * Removes `deps`, preserves embedded `force_key` from resolved derived(data)variables.
 *
 * @param value a value to clean
 * @param forceKeyOverride optional force key to use instead of the one embedded in the resolved variable
 */
export function cleanValue(value: unknown, forceKeyOverride?: string | null): any {
    if (isResolvedDerivedVariable(value) || isResolvedDerivedDataVariable(value)) {
        const { deps, ...rest } = value;
        const cleanedValues = value.values.map((v) => cleanValue(v));

        return {
            ...rest,
            // Use override if provided, otherwise use the embedded force_key from the resolved variable
            force_key: forceKeyOverride ?? (value.force_key || null),
            values: cleanedValues,
        };
    }

    if (isResolvedSwitchVariable(value)) {
        return {
            ...value,
            value: cleanValue(value.value, forceKeyOverride),
            value_map: cleanValue(value.value_map, forceKeyOverride),
            default: cleanValue(value.default, forceKeyOverride),
        };
    }

    return value;
}

/**
 * Clean kwargs to a format understood by the backend.
 * Removes `deps`, preserves embedded `force_key` from resolved derived(data)variables.
 *
 * @param kwargs kwargs to clean
 * @param forceKeyOverride optional force key to use instead of the one embedded in the resolved variable
 */
export function cleanKwargs(kwargs: Record<string, any>, forceKeyOverride?: string | null): Record<string, any> {
    return Object.keys(kwargs).reduce(
        (acc, k) => {
            acc[k] = cleanValue(kwargs[k], forceKeyOverride);
            return acc;
        },
        {} as Record<string, any>
    );
}

/**
 * Format values into a shape expected by the backend.
 * Removes `deps`, preserves embedded `force_key` from resolved derived(data)variables.
 *
 * @param values list of values - plain values or ResolvedDerivedVariable constructs with plain values nested inside
 * @param forceKeyOverride optional force key to use instead of the one embedded in the resolved variable
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function cleanArgs(values: Array<any | ResolvedDerivedVariable>, forceKeyOverride?: string | null): any[] {
    return values.map((val) => cleanValue(val, forceKeyOverride));
}
