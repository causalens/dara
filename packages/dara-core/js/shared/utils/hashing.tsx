import { type AnyVariable } from '@/types/core';

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

    return identifier;
}
