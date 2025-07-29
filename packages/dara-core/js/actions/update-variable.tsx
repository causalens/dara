import { getOrRegisterPlainVariable } from '@/shared/interactivity/plain-variable';
import { type ActionHandler, type UpdateVariableImpl } from '@/types/core';

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
const UpdateVariable: ActionHandler<UpdateVariableImpl> = async (ctx, actionImpl) => {
    let varAtom;
    let eventName: 'PLAIN_VARIABLE_LOADED' | 'URL_VARIABLE_LOADED';

    // Make sure the variable is registered
    switch (actionImpl.variable.__typename) {
        case 'Variable':
            varAtom = getOrRegisterPlainVariable(actionImpl.variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            eventName = 'PLAIN_VARIABLE_LOADED';
            break;
        case 'DataVariable':
            throw new Error('DataVariable is not supported in UpdateVariable action');
    }

    let newValue;

    if (actionImpl.value === INPUT) {
        newValue = ctx.input;
    } else if (actionImpl.value === TOGGLE) {
        // normally we'd use the updater form here, but we need to know what value we're
        // toggling to emit the correct event, and the updater must be pure
        const value = await ctx.snapshot.getLoadable(varAtom).toPromise();
        newValue = !value;
    } else {
        newValue = actionImpl.value;
    }

    ctx.set(varAtom, newValue);
    ctx.eventBus.publish(eventName, { variable: actionImpl.variable as any, value: newValue });
};

export default UpdateVariable;
