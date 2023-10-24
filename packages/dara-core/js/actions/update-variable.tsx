import { getAtom } from '@/shared/interactivity';
import { resolveNested, setNested } from '@/shared/interactivity/nested';
import { ActionHandler, UpdateVariableImpl } from '@/types/core';

/**
 * Constant to replace with the input value.
 */
export const INPUT = '__dara_input__';

/**
 * Constant to signify the actions hould negate the previous variable value.
 */
export const TOGGLE = '__dara_toggle__';

function isFunction(val: any): val is (args: any) => any {
    return typeof val === 'function';
}

/**
 * Get an updater function for the variable.
 * For plain variables with a nested property this will return a function that will update the nested property.
 *
 * @param variable variable to update
 * @param updater value or function to update the variable with
 */
function getUpdater<T = any>(
    variable: UpdateVariableImpl['variable'],
    updater: T | ((value: T) => T)
): T | ((oldValue: T) => T) {
    // is a Variable().get()
    if (variable.__typename === 'Variable' && variable.nested && variable.nested.length > 0) {
        const nested = variable.nested.map((n) => String(n));
        return (oldValue: any) => {
            let newValue = updater;
            if (isFunction(updater)) {
                newValue = updater(resolveNested(oldValue, nested));
            }
            return setNested(oldValue, nested, newValue);
        };
    }

    // return as-is
    return updater;
}

/**
 * Front-end handler for UpdateVariable action.
 */
const UpdateVariable: ActionHandler<UpdateVariableImpl> = (ctx, actionImpl) => {
    const varAtom = getAtom(actionImpl.variable);

    if (actionImpl.value === INPUT) {
        return ctx.set(varAtom, getUpdater(actionImpl.variable, ctx.input));
    }

    if (actionImpl.value === TOGGLE) {
        return ctx.set(
            varAtom,
            getUpdater(actionImpl.variable, (value) => !value)
        );
    }

    return ctx.set(varAtom, getUpdater(actionImpl.variable, actionImpl.value));
};

export default UpdateVariable;
