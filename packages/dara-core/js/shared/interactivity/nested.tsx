import clone from 'lodash/clone';
import cloneDeep from 'lodash/cloneDeep';

import type { NestedKey } from '@/types/core';

/**
 * Resolve the value of the variable using it's optional nested
 *
 * By the time this function is called, templating should have resolved any LoopVariables
 * in the nested array to strings. This function accepts NestedKey[] for type compatibility
 * but expects all elements to be strings at runtime.
 *
 * @param obj an object to resolve from
 * @param nested a list of keys to resolve (should be strings after templating)
 */
export function resolveNested<T extends Record<string, any>>(obj: T, nested: NestedKey[]): any {
    // Nested not provided
    if (!nested || nested.length === 0) {
        return obj;
    }

    // Not an object
    if (!obj || !(typeof obj === 'object' && !Array.isArray(obj))) {
        return obj;
    }

    let returnVal = obj;

    for (const key of nested) {
        // After templating, all keys should be strings. If a non-string is found, it's a bug.
        const stringKey = typeof key === 'string' ? key : String(key);

        // If the key doesn't exist, return null as we're referring to a path which doesn't exist yet
        if (!Object.keys(returnVal).includes(stringKey)) {
            return null;
        }

        returnVal = returnVal[stringKey];
    }

    return returnVal;
}

/**
 * Set a nested value inside a given object.
 *
 * By the time this function is called, templating should have resolved any LoopVariables
 * in the nested array to strings. This function accepts NestedKey[] for type compatibility
 * but expects all elements to be strings at runtime.
 *
 * @param obj an object to set the value of
 * @param nested a list of keys pointing at the value to set (should be strings after templating)
 * @param newValue a new value to set
 */
export function setNested<T extends Record<string, any>>(obj: T, nested: NestedKey[], newValue: unknown): T {
    // Nested not provided
    if (!nested || nested.length === 0) {
        return cloneDeep(obj);
    }

    // Not an object
    if (!obj || !(typeof obj === 'object' && !Array.isArray(obj))) {
        return cloneDeep(obj);
    }

    // Need to clone to prevent reference issues
    const cloned = clone(obj);

    // After templating, all keys should be strings. If a non-string is found, convert it.
    const key = typeof nested[0] === 'string' ? nested[0] : String(nested[0]);
    if (!Object.keys(obj).includes(key)) {
        (cloned as any)[key] = {};
    }

    (cloned as any)[key] = nested.length === 1 ? newValue : setNested(cloned[key], nested.slice(1), newValue);

    return cloned;
}
