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
    let eventName: 'PLAIN_VARIABLE_LOADED' | 'URL_VARIABLE_LOADED';

    // Make sure the variable is registered
    switch (actionImpl.variable.__typename) {
        case 'Variable':
            varAtom = getOrRegisterPlainVariable(actionImpl.variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            eventName = 'PLAIN_VARIABLE_LOADED';
            break;
        case 'UrlVariable':
            varAtom = getOrRegisterUrlVariable(actionImpl.variable);
            eventName = 'URL_VARIABLE_LOADED';
            break;
        case 'DataVariable':
            throw new Error('DataVariable is not supported in UpdateVariable action');
    }

    if (actionImpl.value === INPUT) {
        ctx.set(varAtom, ctx.input);
        ctx.eventBus.publish(eventName, { variable: actionImpl.variable as any, value: ctx.input });
        return;
    }

    if (actionImpl.value === TOGGLE) {
        ctx.set(varAtom, (value: boolean) => {
            ctx.eventBus.publish(eventName, { variable: actionImpl.variable as any, value: !value });
            return !value;
        });
        return;
    }

    ctx.set(varAtom, actionImpl.value);
    ctx.eventBus.publish(eventName, { variable: actionImpl.variable as any, value: actionImpl.value });
};

export default UpdateVariable;
