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
        result: any;
    }
>();

export type TriggerIndexValue = {
    /** Set to a unique key if force=True was set by the user */
    force_key: string | null;
    inc: number;
};

type RegistryKeyType = 'result-selector' | 'derived-selector' | 'selector-nested' | 'trigger' | 'filters';

/**
 * Registry key types that do not use 'nested' in their key
 */
const SHARED_KEY_TYPES = ['result-selector', 'derived-selector'];

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

    const opts = { useNested: !SHARED_KEY_TYPES.includes(type) };

    return `${getUniqueIdentifier(variable, opts)}-${type}-${extras}`;
}

/**
 * Clear registries - to be used in tests only.
 */
export function clearRegistries_TEST(): void {
    for (const registry of [
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
        case 'ServerVariable':
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

        case 'DerivedVariable': {
            const key = getRegistryKey(variable, 'selector');
            return selectorFamilyRegistry.has(key);
        }

        default:
            return false;
    }
}
