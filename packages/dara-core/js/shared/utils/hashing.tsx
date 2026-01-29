import { type AnyVariable, type NestedKey } from '@/types/core';
import { isLoopVariable } from '@/types/utils';

/**
 * Serialize a nested key for identifier computation.
 * Handles both string keys and LoopVariable objects.
 */
function serializeNestedKey(key: NestedKey): string {
    if (typeof key === 'string') {
        return key;
    }
    // It's a LoopVariable
    if (isLoopVariable(key)) {
        const loopNested = key.nested.join(',');
        return `LoopVar:${key.uid}:${loopNested}`;
    }
    return String(key);
}

/**
 * Get a unique identifier for a variable, using its `uid` and `nested` properties
 *
 * @param variable variable to get the identifier from
 */
export function getUniqueIdentifier<T>(
    variable: AnyVariable<T>,
    opts: { useNested: boolean } = {
        useNested: true,
    }
): string {
    let identifier = variable.uid;

    if (opts.useNested && 'nested' in variable) {
        identifier += variable.nested.map(serializeNestedKey).join(',');
    }

    return identifier;
}
