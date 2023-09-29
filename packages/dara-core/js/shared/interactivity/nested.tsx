import clone from 'lodash/clone';
import cloneDeep from 'lodash/cloneDeep';

/**
 * Resolve the value of the variable using it's optional nested
 *
 * @param obj an object to resolve from
 * @param nested a list of keys to resolve
 */
export function resolveNested<T extends Record<string, any>>(obj: T, nested: string[]): any {
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
        // If the key doesn't exist, return null as we're referring to a path which doesn't exist yet
        if (!Object.keys(returnVal).includes(key)) {
            return null;
        }

        returnVal = returnVal[key];
    }

    return returnVal;
}

/**
 * Set a nested value inside a given object.
 *
 * @param obj an object to set the value of
 * @param nested a list of keys pointing at the value to set
 * @param newValue a new value to set
 */
export function setNested<T extends Record<string, any>>(obj: T, nested: string[], newValue: unknown): T {
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

    // If the key doesn't exist, create an empty object in case we're setting a nested value
    const [key] = nested;
    if (!Object.keys(obj).includes(key)) {
        (cloned as any)[key] = {};
    }

    (cloned as any)[key] = nested.length === 1 ? newValue : setNested(cloned[key], nested.slice(1), newValue);

    return cloned;
}
