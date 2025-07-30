import isObject from 'lodash/isObject';

import {
    type ActionImpl,
    type AnnotatedAction,
    type AnyVariable,
    type ComponentInstance,
    type Condition,
    type DerivedVariable,
    type LoopVariable,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    type ServerVariable,
    type StateVariable,
    type SwitchVariable,
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
 * Check if a value is a derived variable instance and type guard the response
 *
 * @param variable the potential derived variable to check
 */
export function isDerivedVariable<T>(variable: AnyVariable<T> | T): variable is DerivedVariable {
    return isVariable(variable) && variable.__typename === 'DerivedVariable';
}

/** Check if a value is a server variable instance and type guard the response */
export function isServerVariable(variable: AnyVariable<any>): variable is ServerVariable {
    return isVariable(variable) && variable.__typename === 'ServerVariable';
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
 * Check if a value is a switch variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isSwitchVariable<T>(variable: AnyVariable<T> | T): variable is SwitchVariable {
    return isVariable(variable) && variable.__typename === 'SwitchVariable';
}

/**
 * Check if a value is a state variable instance and type guard the response
 *
 * @param variable the potential variable to check
 */
export function isStateVariable<T>(variable: AnyVariable<T> | T): variable is StateVariable {
    return isVariable(variable) && variable.__typename === 'StateVariable';
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

export function isResolvedServerVariable(value: any | ResolvedServerVariable): value is ResolvedServerVariable {
    return (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'server' &&
        'uid' in value &&
        'sequence_number' in value
    );
}

export function isResolvedSwitchVariable(value: any | ResolvedSwitchVariable): value is ResolvedSwitchVariable {
    return (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'switch' &&
        'uid' in value &&
        'value_map' in value
    );
}

/**
 * Check if a value is an ActionImpl
 *
 * @param action value to check
 */
export function isActionImpl(action: any): action is ActionImpl {
    return action && typeof action === 'object' && action.__typename === 'ActionImpl';
}

export function isAnnotatedAction(action: any): action is AnnotatedAction {
    return action && 'uid' in action && 'definition_uid' in action && 'dynamic_kwargs' in action;
}

export const isPyComponent = (value: unknown): value is ComponentInstance =>
    isObject(value) &&
    'props' in value &&
    isObject(value.props) &&
    'func_name' in value.props &&
    'dynamic_kwargs' in value.props;

export function isCondition(value: any): value is Condition<any> {
    return value && typeof value === 'object' && value.__typename === 'Condition';
}
