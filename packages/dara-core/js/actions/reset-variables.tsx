import { getOrRegisterPlainVariable } from '@/shared/interactivity/plain-variable';
import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { getOrRegisterUrlVariable } from '@/shared/interactivity/url-variable';
import { type ActionHandler, type ResetVariablesImpl } from '@/types/core';
import {
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isSwitchVariable,
    isUrlVariable,
    isVariable,
} from '@/types/utils';

/**
 * Front-end handler for ResetVariables action.
 * Sequentially resets variables to their default values (or forces a recalculation for DerivedVariables)
 */
const ResetVariables: ActionHandler<ResetVariablesImpl> = (ctx, actionImpl) => {
    actionImpl.variables.filter(isVariable).forEach((variable) => {
        // For DVs, trigger their recalculation
        if (isDerivedVariable(variable) || isDerivedDataVariable(variable)) {
            const triggerAtom = getOrRegisterTrigger(variable);

            ctx.set(triggerAtom, (triggerIndexValue) => ({
                force: true,
                inc: triggerIndexValue.inc + 1,
            }));
        } else if (isUrlVariable(variable)) {
            // For UrlVariables, we use set instead of reset to update the URL as well; otherwise just the atom is reset
            const urlAtom = getOrRegisterUrlVariable(variable);
            ctx.set(urlAtom, variable.default);

            ctx.eventBus.publish('URL_VARIABLE_LOADED', { variable, value: variable.default });
        } else if (isDataVariable(variable)) {
            // for data variables this is a noop
        } else if (isSwitchVariable(variable)) {
            // cannot reset switch variables
        } else {
            // For plain variables reset them to default values
            const plainAtom = getOrRegisterPlainVariable(variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            ctx.reset(plainAtom);

            ctx.eventBus.publish('PLAIN_VARIABLE_LOADED', { variable, value: variable.default });
        }
    });
};

export default ResetVariables;
