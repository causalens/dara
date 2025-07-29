import { nanoid } from 'nanoid';

import { getOrRegisterPlainVariable } from '@/shared/interactivity/plain-variable';
import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { type ActionHandler, type ResetVariablesImpl } from '@/types/core';
import {
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isStateVariable,
    isSwitchVariable,
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
                force_key: nanoid(),
                inc: triggerIndexValue.inc + 1,
            }));
        } else if (isDataVariable(variable)) {
            // for data variables this is a noop
        } else if (isSwitchVariable(variable)) {
            // cannot reset switch variables
        } else if (isStateVariable(variable)) {
            // StateVariables cannot be reset as they track parent DerivedVariable state
            // This is a noop - the state will update when the parent DerivedVariable changes
        } else {
            const plainAtom = getOrRegisterPlainVariable(variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            // NOTE: using set(..., default) instead of reset,
            // as reset doesn't work if e.g. we use the QueryParamStore
            ctx.set(plainAtom, variable.default);

            ctx.eventBus.publish('PLAIN_VARIABLE_LOADED', { variable, value: variable.default });
        }
    });
};

export default ResetVariables;
