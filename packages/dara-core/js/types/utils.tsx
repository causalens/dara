import {
    type ActionImpl,
    type AnyVariable,
    type DataVariable,
    type DerivedDataVariable,
    type DerivedVariable,
    type LoopVariable,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
    type UrlVariable,
} from './core';

/**
 * Check if a value is a variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isVariable<T>(variable: AnyVariable<T> | T): variable is AnyVariable<T> {
    return (
        variable &&
        typeof variable == 'object' &&
        variable.hasOwnProperty('uid') &&
        variable.hasOwnProperty('__typename') &&
        (variable as { __typename: string }).__typename.includes('Variable')
    );
}

/**
 * Check if a value is a UrlVariable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isUrlVariable<T>(variable: AnyVariable<T> | T): variable is UrlVariable<T> {
    return isVariable(variable) && variable.__typename === 'UrlVariable';
}

/**
 * Check if a value is a derived variable instance and type guard the response
 *
 * @param variable the potential derived variable to check
 */
export function isDerivedVariable<T>(variable: AnyVariable<T> | T): variable is DerivedVariable {
    return isVariable(variable) && variable.__typename === 'DerivedVariable';
}

/**
 * Check if a value is a data variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isDataVariable<T>(variable: AnyVariable<T> | T): variable is DataVariable {
    return isVariable(variable) && variable.__typename === 'DataVariable';
}

/**
 * Check if a value is a derived data variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isDerivedDataVariable<T>(variable: AnyVariable<T> | T): variable is DerivedDataVariable {
    return isVariable(variable) && variable.__typename === 'DerivedDataVariable';
}

/**
 * Check if a value is a loop variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isLoopVariable(variable: any): variable is LoopVariable {
    return (
        variable &&
        typeof variable == 'object' &&
        variable.hasOwnProperty('uid') &&
        variable.hasOwnProperty('__typename') &&
        variable.__typename === 'LoopVariable'
    );
}

/**
 * Check if a value is a ResolvedDerivedVariable
 *
 * @param value value to check
 */
export function isResolvedDerivedVariable(value: any | ResolvedDerivedVariable): value is ResolvedDerivedVariable {
    return (
        value &&
        typeof value === 'object' &&
        'values' in value &&
        'type' in value &&
        value.type === 'derived' &&
        'uid' in value
    );
}

/**
 * Check if a value is a ResolvedDataVariable
 *
 * @param value value to check
 */
export function isResolvedDataVariable(value: any | ResolvedDataVariable): value is ResolvedDataVariable {
    return (
        value &&
        typeof value === 'object' &&
        'filters' in value &&
        'type' in value &&
        value.type === 'data' &&
        'uid' in value
    );
}

/**
 * Check if a value is a ResolvedDerivedDataVariable
 *
 * @param value value to check
 */
export function isResolvedDerivedDataVariable(
    value: any | ResolvedDerivedDataVariable
): value is ResolvedDerivedDataVariable {
    return (
        value &&
        typeof value === 'object' &&
        'filters' in value &&
        'values' in value &&
        'type' in value &&
        value.type === 'derived-data' &&
        'uid' in value
    );
}

/**
 * Check f a value is an ActionImpl
 *
 * @param action value to check
 */
export function isActionImpl(action: any): action is ActionImpl {
    return action && typeof action === 'object' && action.__typename === 'ActionImpl';
}
