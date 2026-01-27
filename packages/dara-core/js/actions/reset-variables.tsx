import { nanoid } from 'nanoid';

import { getOrRegisterPlainVariable } from '@/shared/interactivity/plain-variable';
import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { type ActionHandler, type ResetVariablesImpl } from '@/types/core';
import {
    isDerivedVariable,
    isServerVariable,
    isStateVariable,
    isStreamVariable,
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
        if (isDerivedVariable(variable)) {
            const triggerAtom = getOrRegisterTrigger(variable);

            ctx.set(triggerAtom, (triggerIndexValue) => ({
                force_key: nanoid(),
                inc: triggerIndexValue.inc + 1,
            }));
        } else if (isSwitchVariable(variable)) {
            // cannot reset switch variables
        } else if (isStateVariable(variable)) {
            // StateVariables cannot be reset as they track parent DerivedVariable state
            // This is a noop - the state will update when the parent DerivedVariable changes
        } else if (isServerVariable(variable)) {
            // ServerVariables cannot be reset currently as they might not even have a default value (user stores)
        } else if (isStreamVariable(variable)) {
            // StreamVariables cannot be reset - they're read-only and managed by the server stream
        } else {
            const plainAtom = getOrRegisterPlainVariable(variable, ctx.wsClient, ctx.taskCtx, ctx.extras);
            if (variable.store?.__typename === 'QueryParamStore') {
                // NOTE: using set(..., default) instead of reset,
                // as reset doesn't properly reset the query param
                ctx.set(plainAtom, variable.default);
            } else {
                ctx.reset(plainAtom);
            }

            ctx.eventBus.publish('PLAIN_VARIABLE_LOADED', { variable, value: variable.default });
        }
    });
};

export default ResetVariables;
