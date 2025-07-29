import { type RecoilState, type RecoilValue } from 'recoil';

import { RequestExtrasSerializable } from '@/api/http';
import { getUniqueIdentifier } from '@/shared/utils/hashing';
import { type AnyVariable, isDerivedVariable, isVariable } from '@/types';

/**
 * Selector family type which constructs a selector from a given set of extras.
 */
export type SelectorFamily = (P: RequestExtrasSerializable) => RecoilValue<any>;

/**
 * Atom family type which constructs an atom from a given set of extras.
 */
export type AtomFamily = (P: RequestExtrasSerializable) => RecoilState<any>;

/**
 * Key -> trigger atom
 */
export const dataRegistry = new Map<string, RecoilState<TriggerIndexValue>>();
/**
 * Key -> atom
 */
export const atomRegistry = new Map<string, RecoilState<any>>();
/**
 * Key -> atom family
 */
export const atomFamilyRegistry = new Map<string, AtomFamily>();
/**
 * Atom family function => {extras => atom}
 *
 * Stores all instances of a given atom family, as a map of seriailzed extras to atom.
 */
export const atomFamilyMembersRegistry = new Map<AtomFamily, Map<string | null, RecoilState<any>>>();
/**
 * Key -> selector
 */
export const selectorRegistry = new Map<string, RecoilValue<any>>();
/**
 * Key -> selector family
 */
export const selectorFamilyRegistry = new Map<string, SelectorFamily>();
/**
 * Selector family function => {extras => selector}
 *
 * Stores all instances of a given selector family, as a map of seriailzed extras to selector.
 */
export const selectorFamilyMembersRegistry = new Map<SelectorFamily, Map<string | null, RecoilValue<any>>>();
/**
 * Key -> dependencies data for a selector
 */
export const depsRegistry = new Map<
    string,
    {
        args: any[];
        cacheKey: string | null;
        result: any;
    }
>();

export type TriggerIndexValue = {
    /** Set to a unique key if force=True was set by the user */
    force_key: string | null;
    inc: number;
};

type RegistryKeyType = 'result-selector' | 'selector' | 'derived-selector' | 'trigger' | 'filters';

/**
 * Get a unique registry key of a given type for a given variable.
 *
 * @param variable variable to get the key for
 * @param type type of the registry entry
 */
export function getRegistryKey<T>(variable: AnyVariable<T>, type: RegistryKeyType): string {
    let extras = '';

    if (isDerivedVariable(variable)) {
        extras = variable.loop_instance_uid ?? '';
    }

    return `${getUniqueIdentifier(variable)}-${type}-${extras}`;
}

/**
 * Clear registries - to be used in tests only.
 */
export function clearRegistries_TEST(): void {
    for (const registry of [
        dataRegistry,
        atomRegistry,
        atomFamilyRegistry,
        atomFamilyMembersRegistry,
        selectorRegistry,
        depsRegistry,
        selectorFamilyRegistry,
        selectorFamilyMembersRegistry,
    ]) {
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

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (variable.__typename) {
        case 'Variable': {
            if (atomRegistry.has(variable.uid)) {
                return true;
            }
            const family = atomFamilyRegistry.get(variable.uid);

            if (!family) {
                return false;
            }

            return atomFamilyMembersRegistry.get(family)!.size > 0;
        }

        case 'UrlVariable':
        case 'DataVariable':
            return atomRegistry.has(variable.uid);

        case 'DerivedVariable': {
            const key = getRegistryKey(variable, 'selector');
            return selectorFamilyRegistry.has(key);
        }

        case 'DerivedDataVariable': {
            const key = getRegistryKey(variable, 'selector');
            return selectorFamilyRegistry.has(key);
        }

        default:
            return false;
    }
}
