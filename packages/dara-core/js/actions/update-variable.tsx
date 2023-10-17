import { getAtom } from '@/shared/interactivity';
import { ActionHandler, UpdateVariableImpl } from '@/types/core';

/**
 * Constant to replace with the input value.
 */
const INPUT = '__dara_input__';

/**
 * Constant to signify the actions hould negate the previous variable value.
 */
const TOGGLE = '__dara_toggle__';

/**
 * Front-end handler for UpdateVariable action.
 */
const UpdateVariable: ActionHandler<UpdateVariableImpl> = (ctx, actionImpl) => {
    const varAtom = getAtom(actionImpl.target);

    if (actionImpl.value === INPUT) {
        return ctx.set(varAtom, ctx.input);
    }

    if (actionImpl.value === TOGGLE) {
        return ctx.set(varAtom, (value) => !value);
    }

    return ctx.set(varAtom, actionImpl.value);
};

export default UpdateVariable;
