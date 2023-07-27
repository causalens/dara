import hash from 'object-hash';

import { AnyVariable } from '@/types';

/**
 * Generate a unique hash for an object
 *
 * @param obj object to hash
 */
export function hashObject(obj: any): string {
    return hash(obj, { unorderedArrays: true, unorderedObjects: true, unorderedSets: true });
}

/**
 * Get a unique identifier for a variable, using its `uid` and `nested` properties
 *
 * @param variable variable to get the identifier from
 */
export function getUniqueIdentifier<T>(variable: AnyVariable<T>): string {
    let identifier = variable.uid;

    if ('nested' in variable) {
        identifier += variable.nested.join(',');
    }

    // include filters for DataVariable to consider variables with different filters as different instances
    if ('filters' in variable && variable.filters) {
        identifier += hashObject(variable.filters);
    }

    return identifier;
}
