import { RecoilState, RecoilValue } from 'recoil';

import { getUniqueIdentifier } from '@/shared/utils/hashing';
import { AnyVariable, isVariable } from '@/types';

export const dataRegistry = new Map<string, RecoilState<TriggerIndexValue>>(); // datavariableId -> trigger atom
export const atomRegistry = new Map<string, RecoilState<any>>();
export const selectorRegistry = new Map<string, RecoilValue<any>>();
export const depsRegistry = new Map<
    string,
    {
        args: any[];
        cacheKey: string;
        result: any;
    }
>();

export type TriggerIndexValue = {
    force: boolean;
    inc: number;
};

type RegistryKeyType = 'selector' | 'derived-selector' | 'trigger' | 'filters';

/**
 * Get a unique registry key of a given type for a given variable.
 *
 * @param variable variable to get the key for
 * @param type type of the registry entry
 */
export function getRegistryKey<T>(variable: AnyVariable<T>, type: RegistryKeyType): string {
    return `${getUniqueIdentifier(variable)}-${type}`;
}

/**
 * Clear registries - to be used in tests only.
 */
export function clearRegistries_TEST(): void {
    for (const registry of [dataRegistry, atomRegistry, selectorRegistry, depsRegistry]) {
        registry.clear();
    }
}

/**
 * Check whether a given variable is registered within the application
 * (More strictly, under the current RecoilRoot)
 *
 * @param variable variable to check
 */
export function isRegistered<T>(variable: AnyVariable<T>): boolean {
    if (!isVariable(variable)) {
        return false;
    }

    switch (variable.__typename) {
        case 'Variable':
        case 'UrlVariable':
        case 'DataVariable':
            return atomRegistry.has(variable.uid);

        case 'DerivedVariable':
        case 'DerivedDataVariable': {
            const key = getRegistryKey(variable, 'selector');
            return selectorRegistry.has(key);
        }

        default:
            return false;
    }
}

/**
 * Get an atom for a given variable.
 *
 * Useful in cases where we need to atom directly to e.g. write to it.
 *
 * @param variable variable to get the atom for
 */
export function getAtom<T>(variable: AnyVariable<T>): RecoilState<T> {
    if (!isRegistered(variable)) {
        throw new Error(`Variable ${variable.uid} is not registered.`);
    }

    switch (variable.__typename) {
        case 'Variable':
        case 'UrlVariable':
            return atomRegistry.get(variable.uid);

        default:
            throw new Error(
                `Variable ${variable.uid} of type ${variable.__typename} does not have an associated atom.`
            );
    }
}
