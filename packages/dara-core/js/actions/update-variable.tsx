import { getOrRegisterPlainVariable } from '@/shared/interactivity/plain-variable';
import { getOrRegisterUrlVariable } from '@/shared/interactivity/url-variable';
import { ActionHandler, UpdateVariableImpl } from '@/types/core';

/**
 * Constant to replace with the input value.
 */
export const INPUT = '__dara_input__';

/**
 * Constant to signify the actions hould negate the previous variable value.
 */
export const TOGGLE = '__dara_toggle__';

/**
 * Front-end handler for UpdateVariable action.
 */
const UpdateVariable: ActionHandler<UpdateVariableImpl> = (ctx, actionImpl) => {
    let varAtom;

    // Make sure the variable is registered
    switch (actionImpl.variable.__typename) {
        case 'Variable':
            varAtom = getOrRegisterPlainVariable(actionImpl.variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            break;
        case 'UrlVariable':
            varAtom = getOrRegisterUrlVariable(actionImpl.variable);
            break;
        case 'DataVariable':
            throw new Error('DataVariable is not supported in UpdateVariable action');
    }

    if (actionImpl.value === INPUT) {
        return ctx.set(varAtom, ctx.input);
    }

    if (actionImpl.value === TOGGLE) {
        return ctx.set(varAtom, (value) => !value);
    }

    return ctx.set(varAtom, actionImpl.value);
};

export default UpdateVariable;
