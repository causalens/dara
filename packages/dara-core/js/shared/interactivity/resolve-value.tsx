import { isResolvedDerivedDataVariable, isResolvedDerivedVariable } from '@/types';

/**
 * Resolve a value to a format understood by the backend, calling any callback found.
 *
 * Resolves:
 * - simple values to themselves,
 * - callbacks to their return values,
 * - for a ResolvedDerivedVariable, recursively resolve its dependencies, remove deps values (to maintain a consistent request payload shape)
 *
 * @param value a value to resolve
 * @param force whether to force a derived variable recalculation
 */
export function resolveValue(value: unknown, force: boolean): any {
    if (isResolvedDerivedVariable(value) || isResolvedDerivedDataVariable(value)) {
        const { deps, ...rest } = value;
        const resolvedValues = value.values.map((v) => resolveValue(v, force));

        return {
            ...rest,
            force,
            values: resolvedValues,
        };
    }

    if (typeof value === 'function') {
        // Make sure the value returned by the callback is also resolved
        return resolveValue(value(), force);
    }

    return value;
}
