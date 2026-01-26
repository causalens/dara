import type { Params } from 'react-router';
import { type RecoilState, type Snapshot } from 'recoil';

import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras } from '@/api/http';
import {
    type AnyVariable,
    type GlobalTaskContext,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    isCondition,
    isDerivedVariable,
    isResolvedDerivedVariable,
    isResolvedSwitchVariable,
    isServerVariable,
    isStateVariable,
    isStreamVariable,
    isSwitchVariable,
    isVariable,
} from '@/types';

// eslint-disable-next-line import/no-cycle
import { getOrRegisterDerivedVariable, getOrRegisterPlainVariable, resolvePlainVariableStatic } from './internal';
import { getOrRegisterServerVariable, resolveServerVariable, resolveServerVariableStatic } from './server-variable';
import { getOrRegisterStreamVariable } from './stream-variable';

export async function resolveVariable<VariableType>(
    variable: AnyVariable<VariableType>,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras,
    resolver: (
        state: RecoilState<VariableType>
    ) => Promise<RecoilState<VariableType> | ResolvedDerivedVariable | VariableType> = (state) => Promise.resolve(state)
): Promise<
    RecoilState<VariableType> | ResolvedDerivedVariable | ResolvedServerVariable | ResolvedSwitchVariable | VariableType
> {
    if (isDerivedVariable(variable)) {
        getOrRegisterDerivedVariable(variable, client, taskContext, extras);

        // For derived variable, recursively resolve the dependencies
        const values = await Promise.all(
            variable.variables.map((v) => resolveVariable(v, client, taskContext, extras, resolver))
        );

        // Store indexes of values which are in deps
        const deps = variable.deps.map((dep) => variable.variables.findIndex((v) => v.uid === dep.uid));

        return {
            deps,
            type: 'derived',
            uid: variable.uid,
            values,
            nested: variable.nested,
        } satisfies ResolvedDerivedVariable;
    }

    if (isServerVariable(variable)) {
        getOrRegisterServerVariable(variable, extras);
        return resolveServerVariable(variable, extras, resolver);
    }

    if (isSwitchVariable(variable)) {
        // For switch variables, we need to resolve the constituent parts
        // and return a serialized representation similar to derived variables
        let resolvedValue =
            isVariable(variable.value) ?
                await resolveVariable(variable.value, client, taskContext, extras, resolver)
            :   variable.value;

        // value could be a condition object, resolve its variable
        if (isCondition(resolvedValue)) {
            resolvedValue = {
                ...resolvedValue,
                variable: (await resolveVariable(resolvedValue.variable, client, taskContext, extras, resolver)) as any,
            };
        }

        const resolvedValueMap =
            isVariable(variable.value_map) ?
                await resolveVariable(variable.value_map as any, client, taskContext, extras, resolver)
            :   variable.value_map;
        const resolvedDefault =
            isVariable(variable.default) ?
                await resolveVariable(variable.default, client, taskContext, extras, resolver)
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

    if (isStreamVariable(variable)) {
        // StreamVariable returns a Recoil selector that can be used as a dependency
        return resolver(
            getOrRegisterStreamVariable(variable, client, taskContext, extras) as RecoilState<VariableType>
        );
    }

    return resolver(getOrRegisterPlainVariable(variable, client, taskContext, extras));
}

/**
 * Static variant of variable resolution.
 * Notable does not register variables if they haven't yet been registered.
 * For plain variables, uses default values if not yet registered.
 */
export function resolveVariableStatic(variable: AnyVariable<any>, snapshot: Snapshot, params: Params<string>): any {
    if (isDerivedVariable(variable)) {
        // For derived variable, recursively resolve the dependencies
        const values = variable.variables.map((v) => resolveVariableStatic(v, snapshot, params));

        // Store indexes of values which are in deps
        const deps = variable.deps.map((dep) => variable.variables.findIndex((v) => v.uid === dep.uid));

        return {
            deps,
            type: 'derived',
            uid: variable.uid,
            values,
            nested: variable.nested,
        } satisfies ResolvedDerivedVariable;
    }

    if (isServerVariable(variable)) {
        return resolveServerVariableStatic(variable, snapshot);
    }

    if (isSwitchVariable(variable)) {
        // For switch variables, we need to resolve the constituent parts
        // and return a serialized representation similar to derived variables
        let resolvedValue =
            isVariable(variable.value) ? resolveVariableStatic(variable.value, snapshot, params) : variable.value;

        // value could be a condition object, resolve its variable
        if (isCondition(resolvedValue)) {
            resolvedValue = {
                ...resolvedValue,
                variable: resolveVariableStatic(resolvedValue.variable, snapshot, params),
            };
        }

        const resolvedValueMap =
            isVariable(variable.value_map) ?
                resolveVariableStatic(variable.value_map as any, snapshot, params)
            :   variable.value_map;
        const resolvedDefault =
            isVariable(variable.default) ? resolveVariableStatic(variable.default, snapshot, params) : variable.default;

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

    if (isStreamVariable(variable)) {
        // Streams cannot be statically resolved without an active connection
        throw new Error('StreamVariable should not be resolved - it should be handled by useVariable hook');
    }

    // plain variable
    let result = resolvePlainVariableStatic(variable, snapshot, params);
    // unwrap if variable.default is a derived variable, i.e. used create_from_derived
    while (isDerivedVariable(result)) {
        result = resolveVariableStatic(result, snapshot, params);
    }
    return result;
}

/**
 * Clean value to a format understood by the backend.
 * Removes `deps`, preserves embedded `force_key` from resolved derived(data)variables.
 *
 * @param value a value to clean
 * @param forceKeyOverride optional force key to use instead of the one embedded in the resolved variable
 */
export function cleanValue(value: unknown, forceKeyOverride?: string | null): any {
    if (isResolvedDerivedVariable(value)) {
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
